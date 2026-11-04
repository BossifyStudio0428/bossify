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
  refreshed: number; // already-linked items (matched by tiktok_product_id) whose price/stock were re-pulled this sync
  delisted: number; // previously-linked items whose tiktok_product_id no longer appears on TikTok this sync — flagged, not removed
  relisted: number; // previously-flagged items that reappeared in TikTok's catalog this sync
  total: number;
};

/**
 * Pulls this seller's TikTok product catalog and mirrors it into Bossify
 * inventory: name, price, and stock come straight from TikTok (real,
 * one-way sync — Bossify never writes back to TikTok). Cost price is
 * deliberately NOT guessed — new items are created with cost_price = 0
 * and returned in `imported` so the UI can prompt the seller to fill in
 * the real cost before relying on their profit numbers.
 *
 * If a Bossify inventory item already exists with a matching name, it's
 * linked (tagged with tiktok_product_id, price/stock refreshed) instead
 * of duplicated — this also makes future TikTok order matching more
 * reliable, since order line items can then match by product_id instead
 * of only by name.
 *
 * Deletion reconciliation: TikTok's product list simply stops returning a
 * product once it's deleted/deactivated in Seller Center — there's no
 * explicit "deleted" event. So after refreshing everything we can still
 * see, we also check for Bossify inventory rows that are linked
 * (tiktok_product_id set) but whose ID did NOT show up in this sync's
 * catalog at all, and flag them with tiktok_delisted_at. We deliberately
 * never delete or hide the row itself — historical orders/reports may
 * reference it, and the seller decides what to do with it from here. If
 * a flagged product reappears later (re-listed on TikTok), the flag is
 * cleared automatically the next time it's seen.
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

  const { data: existingInv } = await supabaseAdmin
    .from("inventory" as any)
    .select("id,name,tiktok_product_id,tiktok_delisted_at")
    .eq("user_id", userId);
  const invByName = new Map<string, { id: string }>();
  const invByTikTokId = new Map<string, { id: string; delisted: boolean }>();
  for (const it of (existingInv ?? []) as any[]) {
    if (it.name) invByName.set(String(it.name).trim().toLowerCase(), { id: it.id });
    if (it.tiktok_product_id) invByTikTokId.set(it.tiktok_product_id, { id: it.id, delisted: !!it.tiktok_delisted_at });
  }

  const imported: string[] = [];
  let linked = 0;
  let refreshed = 0;
  let relisted = 0;
  // productIds this sync actually saw in TikTok's catalog — used below to
  // find linked inventory rows that dropped OUT of the catalog entirely.
  const seenTiktokIds = new Set(productIds);

  // IMPORTANT: every productId is re-fetched and re-written on every sync
  // run, including ones already linked (tiktok_product_id already set).
  // This used to `continue`/skip already-linked products entirely, which
  // meant price/stock were only ever pulled ONCE, at first-link time, and
  // silently went stale forever after — contradicting this function's own
  // "price/stock refreshed" doc comment above and causing Bossify's stock
  // count to permanently diverge from TikTok's real stock. Fixed by always
  // fetching detail and writing the latest price/stock, matching by
  // tiktok_product_id when already linked (stable) and falling back to a
  // name match only for first-time linking.
  for (const productId of productIds) {
    let detail;
    try {
      detail = await getTikTokProduct(accessToken, c.platform_shop_cipher, productId);
    } catch {
      continue; // skip products we can't fetch detail for; retried next sync
    }
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
      // One-way sync only: TikTok's stock is the source of truth here.
      // Bossify never writes stock back to TikTok — this just mirrors it
      // so the seller doesn't have to check two places. Summed across
      // warehouses since a SKU's stock can be split.
      const stock = (sku.inventory ?? []).reduce((s, w) => s + Number(w.quantity ?? 0), 0);
      const alreadyLinked = invByTikTokId.get(productId);
      const existingByName = alreadyLinked ? undefined : invByName.get(name.trim().toLowerCase());
      if (alreadyLinked) {
        // Seeing it again this sync means it's live on TikTok right now —
        // clear any previous delisted flag (covers the re-listed case).
        if (alreadyLinked.delisted) relisted++;
        await supabaseAdmin
          .from("inventory" as any)
          .update({ price, stock, image_url: imageUrl, tiktok_delisted_at: null } as any)
          .eq("id", alreadyLinked.id);
        refreshed++;
      } else if (existingByName) {
        await supabaseAdmin
          .from("inventory" as any)
          .update({ tiktok_product_id: productId, price, stock, image_url: imageUrl } as any)
          .eq("id", existingByName.id);
        linked++;
      } else {
        await supabaseAdmin.from("inventory" as any).insert({
          user_id: userId,
          name,
          price,
          cost_price: 0, // deliberately not guessed — seller fills this in
          packaging_cost: 0,
          stock,
          image_url: imageUrl,
          tiktok_product_id: productId,
        } as any);
        imported.push(name);
      }
    }
  }

  // Deletion reconciliation — any inventory row still linked to a
  // tiktok_product_id that this sync did NOT see in TikTok's catalog has
  // been removed or deactivated on TikTok's side. Flag it (don't touch
  // stock/price/name, don't delete the row) so the seller can see it and
  // decide what to do, while historical orders/reports stay intact.
  let delisted = 0;
  for (const [tid, inv] of invByTikTokId) {
    if (seenTiktokIds.has(tid) || inv.delisted) continue;
    await supabaseAdmin
      .from("inventory" as any)
      .update({ tiktok_delisted_at: new Date().toISOString() } as any)
      .eq("id", inv.id);
    delisted++;
  }

  return { imported, linked, refreshed, delisted, relisted, total: productIds.length };
}