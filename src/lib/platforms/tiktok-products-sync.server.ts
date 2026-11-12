import "@tanstack/react-start/server-only";

import { externalSupabaseAdmin as supabaseAdmin } from "@/integrations/supabase/external-admin.server";
import { decryptToken, encryptToken } from "@/lib/platforms/crypto.server";
import {
  searchTikTokProducts,
  getTikTokProduct,
  refreshTikTokAccessToken,
} from "@/lib/platforms/tiktok.server";

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

type ProductSyncResult = {
  imported: string[]; // newly created inventory items — still need a real cost filled in
  linked: number; // existing inventory items matched BY NAME and tagged with tiktok_product_id for the first time
  refreshed: number; // already-linked items whose price was re-pulled and TikTok stock change applied this sync
  delisted: number; // previously-linked items whose tiktok_product_id no longer appears on TikTok this sync — flagged, not removed
  relisted: number; // previously-flagged items that reappeared in TikTok's catalog this sync
  total: number;
};

/**
 * Pulls this seller's TikTok product catalog into Bossify inventory
 * (one-way — Bossify never writes back to TikTok). Name and price come
 * straight from TikTok. Stock does NOT get overwritten: after a row's
 * first sync, only TikTok's stock CHANGE since the previous sync is added
 * to Bossify's own count (tracked per SKU via tiktok_sku_id /
 * tiktok_stock_synced), so manual adjustments for sales made through
 * other channels survive. Needs supabase/manual-migrations/
 * stock-audit-fixes.sql applied first. Cost price is
 * deliberately NOT guessed — new items are created with cost_price = 0
 * and returned in `imported` so the UI can prompt the seller to fill in
 * the real cost before relying on their profit numbers.
 *
 * If a Bossify inventory item already exists with a matching name, it's
 * linked (tagged with tiktok_product_id, price refreshed, stock kept) instead
 * of duplicated — this also makes future TikTok order matching more
 * reliable, since order line items can then match by product_id instead
 * of only by name.
 *
 * Deletion reconciliation: there's no explicit "deleted" event from TikTok
 * — and, confirmed the hard way (2026-11-10), the product search endpoint
 * does NOT simply stop returning a product once it's deleted/deactivated in
 * Seller Center the way the original version of this function assumed;
 * the id can still come back. What actually changes is the per-product
 * detail's `status` field. So "seen this sync" is decided per-product
 * below (search for NON_LIVE_STATUSES), not just by which ids the search
 * endpoint happened to return. After that, we check for Bossify inventory
 * rows that are linked (tiktok_product_id set) but weren't counted as seen
 * this sync, and flag them with tiktok_delisted_at. We deliberately never
 * delete or hide the row itself — historical orders/reports may reference
 * it, and the seller decides what to do with it from here. If a flagged
 * product reappears later (re-listed on TikTok), the flag is cleared
 * automatically the next time it's seen.
 */
export async function syncTikTokProducts(userId: string): Promise<ProductSyncResult> {
  const { data: conn, error: connErr } = await supabaseAdmin
    .from("platform_connections" as any)
    .select("*")
    .eq("user_id", userId)
    .eq("platform", "tiktok")
    .maybeSingle();
  if (connErr || !conn) throw new Error("No TikTok Shop connection found for this user.");
  const c = conn as any;
  if (!c.platform_shop_cipher) {
    throw new Error("This TikTok connection is missing shop_cipher. Disconnect and reconnect TikTok Shop once to resolve this.");
  }

  let accessToken = decryptToken(c.access_token_encrypted);
  const expiresAt = c.token_expires_at ? new Date(c.token_expires_at).getTime() : 0;
  if (expiresAt - Date.now() < TOKEN_REFRESH_MARGIN_MS) {
    const refreshed = await refreshTikTokAccessToken(decryptToken(c.refresh_token_encrypted));
    accessToken = refreshed.access_token;
    await supabaseAdmin
      .from("platform_connections" as any)
      .update({
        access_token_encrypted: encryptToken(refreshed.access_token),
        refresh_token_encrypted: encryptToken(refreshed.refresh_token),
        token_expires_at: new Date(Date.now() + refreshed.access_token_expire_in * 1000).toISOString(),
      } as any)
      .eq("id", c.id);
  }

  await supabaseAdmin
    .from("platform_connections" as any)
    .update({ last_synced_at: new Date().toISOString() } as any)
    .eq("id", c.id);

  // Gather every product ID across pages.
  const productIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await searchTikTokProducts(accessToken, c.platform_shop_cipher, c.platform_shop_id, pageToken);
    productIds.push(...page.productIds);
    pageToken = page.nextPageToken ?? undefined;
  } while (pageToken);

  const { data: existingInv, error: invErr } = await supabaseAdmin
    .from("inventory" as any)
    .select("id,name,stock,tiktok_product_id,tiktok_sku_id,tiktok_stock_synced,tiktok_delisted_at")
    .eq("user_id", userId);
  // Fail closed: if this read fails (most likely the tiktok_sku_id /
  // tiktok_stock_synced columns from supabase/manual-migrations/
  // stock-audit-fixes.sql aren't there yet), stop here. Carrying on with
  // an empty list would treat every product as new and insert duplicates.
  if (invErr) {
    throw new Error(`Could not read inventory for TikTok sync (has stock-audit-fixes.sql been run?): ${invErr.message}`);
  }
  type InvRow = {
    id: string;
    name: string | null;
    stock: number | null;
    tiktok_product_id: string | null;
    tiktok_sku_id: string | null;
    tiktok_stock_synced: number | null;
    tiktok_delisted_at: string | null;
  };
  const invRows = ((existingInv ?? []) as unknown) as InvRow[];
  const norm = (v: string | null | undefined) => String(v ?? "").trim().toLowerCase();
  // Exact match: one Bossify row per TikTok SKU (variant).
  const invBySkuId = new Map<string, InvRow>();
  // Rows linked before tiktok_sku_id existed: product known, variant not yet.
  const legacyByProductId = new Map<string, InvRow[]>();
  // Rows never linked to TikTok — candidates for first-time linking by name.
  const unlinkedByName = new Map<string, InvRow>();
  for (const it of invRows) {
    if (it.tiktok_sku_id) {
      invBySkuId.set(it.tiktok_sku_id, it);
    } else if (it.tiktok_product_id) {
      const list = legacyByProductId.get(it.tiktok_product_id) ?? [];
      list.push(it);
      legacyByProductId.set(it.tiktok_product_id, list);
    } else if (it.name) {
      unlinkedByName.set(norm(it.name), it);
    }
  }
  // A Bossify row can stand for only one SKU per run — stops two SKUs that
  // happen to resolve to the same name from both writing onto one row.
  const claimed = new Set<string>();

  // Statuses that mean a product is no longer actually sellable on TikTok —
  // deleted, or deactivated by the seller/TikTok, or frozen. TikTok's
  // product search still returns the id of a DELETED product (there's no
  // separate "deleted" event to react to instead), so without this check
  // every productId coming back from searchTikTokProducts was being treated
  // as "seen", a deleted product's detail got re-fetched and its stale
  // price/stock written right back over the Bossify row as if nothing had
  // changed, and the delisted-reconciliation below — whose whole job is to
  // catch exactly this — never got the chance to run for it. DRAFT/PENDING/
  // FAILED are deliberately left out: those are products that were never
  // live to begin with, not previously-live ones that disappeared, so
  // calling them "delisted" would be misleading.
  const NON_LIVE_STATUSES = new Set(["DELETED", "SELLER_DEACTIVATED", "PLATFORM_DEACTIVATED", "FREEZE"]);

  const imported: string[] = [];
  let linked = 0;
  let refreshed = 0;
  let relisted = 0;
  // Built incrementally below, one productId at a time, ONLY once that
  // product's detail confirms it's still genuinely live — not simply
  // copied from the raw search result ids (see NON_LIVE_STATUSES above for
  // why that was wrong). Used below to find linked inventory rows that
  // dropped OUT of the catalog entirely.
  const seenTiktokIds = new Set<string>();

  // Every productId is re-fetched on every sync run, including ones already
  // linked, so price stays current and stock CHANGES on TikTok keep flowing
  // into Bossify.
  for (const productId of productIds) {
    let detail;
    try {
      detail = await getTikTokProduct(accessToken, c.platform_shop_cipher, productId);
    } catch {
      continue; // skip products we can't fetch detail for; retried next sync
    }
    if (detail.status && NON_LIVE_STATUSES.has(detail.status.toUpperCase())) {
      // Not currently sellable (most commonly: deleted on TikTok). Leave it
      // OUT of seenTiktokIds so the delisted-reconciliation below flags any
      // Bossify row still linked to it, and don't touch that row's
      // price/stock here — it's stale the moment the product is gone.
      continue;
    }
    seenTiktokIds.add(productId);
    // A product can have multiple SKUs (variants); Bossify inventory is
    // per-item, so each SKU becomes its own inventory row, named
    // "<product title> (<seller_sku>)" when there's more than one SKU.
    const multiSku = (detail.skus ?? []).length > 1;
    // Pull one representative image for the whole product (first main
    // image) — Bossify's inventory is per-SKU but doesn't need a separate
    // photo per variant for this to be useful visually.
    const imageUrl = detail.main_images?.[0]?.urls?.[0] ?? detail.main_images?.[0]?.thumb_urls?.[0] ?? null;

    for (const sku of detail.skus ?? []) {
      const name = multiSku && sku.seller_sku ? `${detail.title} (${sku.seller_sku})` : detail.title;
      const price = Number(sku.price?.tax_exclusive_price ?? 0);
      // TikTok's own stock for this SKU, summed across warehouses since a
      // SKU's stock can be split. One-way: Bossify never writes stock back
      // to TikTok.
      const tiktokStock = (sku.inventory ?? []).reduce((s, w) => s + Number(w.quantity ?? 0), 0);

      // Find this SKU's Bossify row: by SKU id (exact), else a row linked to
      // this product before SKU ids were stored, else an unlinked row with
      // the same name (first-time link).
      let row: InvRow | undefined = sku.id ? invBySkuId.get(sku.id) : undefined;
      let match: "sku" | "legacy" | "name" | null = row ? "sku" : null;
      if (!row) {
        const legacy = (legacyByProductId.get(productId) ?? []).filter((r) => !claimed.has(r.id));
        row = legacy.find((r) => norm(r.name) === norm(name)) ?? (!multiSku && legacy.length === 1 ? legacy[0] : undefined);
        if (row) match = "legacy";
      }
      if (!row) {
        const byName = unlinkedByName.get(norm(name));
        if (byName && !claimed.has(byName.id)) {
          row = byName;
          match = "name";
        }
      }

      if (!row || !match) {
        await supabaseAdmin.from("inventory" as any).insert({
          user_id: userId,
          name,
          price,
          cost_price: 0, // deliberately not guessed — seller fills this in
          packaging_cost: 0,
          stock: tiktokStock,
          image_url: imageUrl,
          tiktok_product_id: productId,
          tiktok_sku_id: sku.id ?? null,
          tiktok_stock_synced: tiktokStock,
        } as any);
        imported.push(name);
        continue;
      }
      claimed.add(row.id);

      // STOCK — apply TikTok's CHANGE since the last sync, never overwrite.
      // Overwriting wiped out every manual deduction the seller made for
      // sales through other channels (offline, WhatsApp...), because
      // TikTok's own number never moved for those sales.
      //   sku    : stock += (TikTok now − TikTok at last sync)
      //   name   : first-time link — keep the seller's own count, just
      //            record TikTok's number as the starting point
      //   legacy : first sync since SKU ids were stored, no starting point
      //            yet. Single-variant product: keep Bossify's count (it may
      //            hold manual edits). Multi-variant product: the old sync
      //            wrote every variant's stock onto ONE row and never
      //            refreshed the others, so those counts are already wrong —
      //            take TikTok's number once, then go change-based.
      let newStock: number | null = null;
      let oldStock: number | null = null;
      if (match === "sku" && row.tiktok_stock_synced != null) {
        const delta = tiktokStock - Number(row.tiktok_stock_synced);
        if (delta !== 0) {
          // Re-read right before writing so a manual edit made while this
          // sync was running isn't lost.
          const { data: fresh } = await supabaseAdmin.from("inventory" as any).select("stock").eq("id", row.id).maybeSingle();
          oldStock = Number((fresh as any)?.stock ?? row.stock ?? 0);
          newStock = Math.max(0, oldStock + delta);
        }
      } else if (match === "legacy" && multiSku) {
        oldStock = Number(row.stock ?? 0);
        newStock = tiktokStock;
      }

      const update: Record<string, unknown> = {
        price,
        image_url: imageUrl,
        tiktok_product_id: productId,
        tiktok_sku_id: sku.id ?? null,
        tiktok_stock_synced: tiktokStock,
        // Seeing it this sync means it's live on TikTok right now — clear
        // any previous delisted flag (covers the re-listed case).
        tiktok_delisted_at: null,
      };
      if (newStock !== null) update.stock = newStock;
      await supabaseAdmin.from("inventory" as any).update(update as any).eq("id", row.id);

      // Leave a trail in Inventory History, so a stock change caused by the
      // sync can be told apart from one the seller made. Never blocks the sync.
      if (newStock !== null && oldStock !== null && newStock !== oldStock) {
        try {
          await supabaseAdmin.from("inventory_audit_log" as any).insert({
            user_id: userId,
            product_id: row.id,
            product_name: row.name ?? name,
            field_name: "stock",
            old_value: String(oldStock),
            new_value: String(newStock),
            source: "tiktok_sync",
          } as any);
        } catch {
          // non-fatal
        }
      }

      if (row.tiktok_delisted_at) relisted++;
      if (match === "name") linked++;
      else refreshed++;
    }
  }

  // Deletion reconciliation — any inventory row still linked to a
  // tiktok_product_id that this sync did NOT see in TikTok's catalog has
  // been removed or deactivated on TikTok's side. Flag it (don't touch
  // stock/price/name, don't delete the row) so the seller can see it and
  // decide what to do, while historical orders/reports stay intact. Every
  // variant row of the product is flagged, not just one of them.
  let delisted = 0;
  for (const inv of invRows) {
    if (!inv.tiktok_product_id || inv.tiktok_delisted_at) continue;
    if (seenTiktokIds.has(inv.tiktok_product_id)) continue;
    await supabaseAdmin
      .from("inventory" as any)
      .update({ tiktok_delisted_at: new Date().toISOString() } as any)
      .eq("id", inv.id);
    delisted++;
  }

  return { imported, linked, refreshed, delisted, relisted, total: productIds.length };
}