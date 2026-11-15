import "@tanstack/react-start/server-only";

import { externalSupabaseAdmin as supabaseAdmin } from "@/integrations/supabase/external-admin.server";
import { encryptToken, decryptToken } from "@/lib/platforms/crypto.server";
import {
  getTikTokOrderDetail,
  getTikTokOrderTransactions,
  refreshTikTokAccessToken,
  type TikTokOrderDetail,
} from "@/lib/platforms/tiktok.server";
import { calculateOrderFinancials, type OrderItemInput } from "@/lib/orderMath";
import { mapTikTokStatus } from "@/lib/platforms/tiktok.server";

const BATCH_SIZE = 20; // orders processed per sync run
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh if expiring within 5 min

type SyncResult = {
  processed: number;
  completed: number;
  upgraded: number; // orders whose fee moved from estimate to real settlement data
  skipped: Array<{ orderId: string; reason: string }>;
};

/**
 * Finds this user's pending TikTok placeholder orders, fetches their real
 * detail from TikTok's Order Detail API, matches line items to Bossify
 * inventory, and — only when the match is reliable — runs them through
 * calculateOrderFinancials() and marks them financial_status = "complete".
 *
 * Platform fee uses REAL TikTok data (fee_and_tax_amount from the Finance
 * API) once an order has settled (shipped, delivered, return window
 * closed). Before settlement, TikTok genuinely has no fee data yet, so we
 * fall back to the seller's configured % estimate — same methodology
 * already used for manual/CSV orders — and record which source was used
 * in platform_metadata.platform_fee_source ("real" vs "estimate").
 *
 * Never fabricates cost: if a line item's product can't be reliably
 * matched to a Bossify inventory item by name, the WHOLE order stays
 * "pending" with a diagnostic reason in last_error, and can be retried
 * once the seller fixes the product name / adds the missing product.
 */
export async function syncPendingTikTokOrders(userId: string): Promise<SyncResult> {
  const result: SyncResult = { processed: 0, completed: 0, upgraded: 0, skipped: [] };

  const { data: conn, error: connErr } = await supabaseAdmin
    .from("platform_connections" as any)
    .select("*")
    .eq("user_id", userId)
    .eq("platform", "tiktok")
    .maybeSingle();
  if (connErr || !conn) {
    throw new Error("No TikTok Shop connection found for this user.");
  }
  const c = conn as any;
  if (!c.platform_shop_cipher) {
    throw new Error(
      "This TikTok connection is missing shop_cipher (it was connected before the fix). " +
        "Disconnect and reconnect TikTok Shop once to resolve this.",
    );
  }

  // Refresh the access token if it's expired or close to expiring.
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

  // Mark this as an attempted sync now that the connection is confirmed
  // valid — this is what "Last synced: X ago" shows, whether or not there
  // turned out to be any pending orders to process.
  await supabaseAdmin
    .from("platform_connections" as any)
    .update({ last_synced_at: new Date().toISOString() } as any)
    .eq("id", c.id);

  const { data: pendingOrders } = await supabaseAdmin
    .from("orders" as any)
    .select("id, platform_order_id")
    .eq("user_id", userId)
    .eq("order_source", "tiktok")
    .eq("financial_status", "pending")
    .limit(BATCH_SIZE);

  const orders = (pendingOrders ?? []) as unknown as Array<{ id: string; platform_order_id: string | null }>;
  if (orders.length === 0) return result;

  const orderIds = orders.map((o) => o.platform_order_id).filter((x): x is string => !!x);
  if (orderIds.length === 0) return result;

  const { data: profile } = await supabaseAdmin
    .from("profiles" as any)
    .select("platform_fee_percent")
    .eq("id", userId)
    .maybeSingle();
  const platformFeePercent = Number((profile as any)?.platform_fee_percent ?? 0);

  const { data: inventory } = await supabaseAdmin
    .from("inventory" as any)
    .select("id,name,cost_price,packaging_cost,tiktok_product_id,tiktok_sku_id")
    .eq("user_id", userId);
  const invByName = new Map<string, { id: string; cost_price: number; packaging_cost: number }>();
  const invByTikTokId = new Map<string, { id: string; cost_price: number; packaging_cost: number }>();
  // Per-variant (S / M / L ...) match. All variants of one TikTok product
  // share tiktok_product_id, so matching by product id alone could charge
  // an order the cost of the wrong variant.
  const invBySkuId = new Map<string, { id: string; cost_price: number; packaging_cost: number }>();
  for (const it of (inventory ?? []) as any[]) {
    const row = { id: it.id, cost_price: Number(it.cost_price ?? 0), packaging_cost: Number(it.packaging_cost ?? 0) };
    if (it.name) invByName.set(String(it.name).trim().toLowerCase(), row);
    if (it.tiktok_product_id) invByTikTokId.set(it.tiktok_product_id, row);
    if (it.tiktok_sku_id) invBySkuId.set(String(it.tiktok_sku_id), row);
  }

  let detailList: TikTokOrderDetail[] = [];
  try {
    detailList = await getTikTokOrderDetail(accessToken, c.platform_shop_cipher, orderIds);
  } catch (e) {
    // Network / API failure — every order in this batch stays pending
    // and can be retried on the next sync run.
    const msg = e instanceof Error ? e.message : String(e);
    for (const o of orders) {
      await supabaseAdmin
        .from("orders" as any)
        .update({ last_error: `TikTok Get Order Detail API call failed: ${msg}` } as any)
        .eq("id", o.id);
      result.skipped.push({ orderId: o.platform_order_id ?? o.id, reason: `API error: ${msg}` });
    }
    return result;
  }

  const detailById = new Map(detailList.map((d) => [d.id, d]));

  for (const localOrder of orders) {
    result.processed++;
    const platformOrderId = localOrder.platform_order_id;
    const detail = platformOrderId ? detailById.get(platformOrderId) : undefined;
    if (!detail) {
      await supabaseAdmin
        .from("orders" as any)
        .update({
          last_error: `TikTok Order Detail API did not return this order (platform_order_id=${platformOrderId}). It may be a test/sandbox order ID that doesn't exist as a real order, or the order isn't visible via this API yet.`,
        } as any)
        .eq("id", localOrder.id);
      result.skipped.push({ orderId: platformOrderId ?? localOrder.id, reason: "Order detail not returned by TikTok yet" });
      continue;
    }

    // Cancelled before fulfillment: no revenue, no COGS, no line-item
    // matching needed. Refunds/partial refunds are a known gap — see the
    // note above calculateOrderFinancials() in this file; TikTok's own
    // status here doesn't distinguish "cancelled" from "refunded after
    // shipment" cleanly, so anything that isn't a clean pre-fulfillment
    // cancellation is left as "pending" with a diagnostic reason rather
    // than guessed at.
    const mappedStatus = mapTikTokStatus(detail.status ?? "", detail.is_cod);
    if (mappedStatus === "Cancelled") {
      await supabaseAdmin
        .from("orders" as any)
        .update({
          amount: 0,
          cost: 0,
          gross_profit: 0,
          platform_fee_amount: 0,
          financial_status: "cancelled",
          status: "Cancelled" as any,
          last_error: null,
        } as any)
        .eq("id", localOrder.id);
      await supabaseAdmin.from("order_items" as any).delete().eq("order_id", localOrder.id);
      result.completed++;
      continue;
    }
    if (mappedStatus === "Refunded") {
      await supabaseAdmin
        .from("orders" as any)
        .update({
          last_error:
            "TikTok reports this order as refunded, but Bossify doesn't yet have a reliable way to split partial refunds from the Order Detail API. Kept as pending — needs the Finance API refund breakdown (future work).",
        } as any)
        .eq("id", localOrder.id);
      result.skipped.push({ orderId: platformOrderId!, reason: "Refunded — needs refund data model (not yet built)" });
      continue;
    }

    // Match every line item to Bossify inventory by product name. If ANY
    // line item can't be reliably matched, don't guess its cost — keep
    // the whole order pending rather than complete it with a fabricated
    // RM0 cost for that line.
    const engineItems: (OrderItemInput & { productId: string | null; productName: string })[] = [];
    let unmatched: string | null = null;
    for (const li of detail.line_items ?? []) {
      // Prefer matching by TikTok product_id (set via "Import products from
      // TikTok" or a prior order) — far more reliable than name-matching,
      // which breaks on the smallest wording difference.
      // Exact variant first (tiktok_sku_id, filled in by the product sync),
      // then the product, then the name.
      const match =
        (li.sku_id ? invBySkuId.get(String(li.sku_id)) : undefined) ??
        invByTikTokId.get(li.product_id) ??
        invByName.get(String(li.product_name).trim().toLowerCase());
      if (!match) {
        unmatched = li.product_name;
        break;
      }
      engineItems.push({
        quantity: 1, // TikTok Order Detail returns one line_item per physical unit.
        unitPriceAtSale: Number(li.sale_price ?? li.original_price ?? 0),
        unitCostAtSale: match.cost_price,
        packagingCostAtSale: match.packaging_cost,
        productId: match.id,
        productName: li.product_name,
      });
    }
    if (unmatched) {
      await supabaseAdmin
        .from("orders" as any)
        .update({ last_error: `Could not match TikTok product "${unmatched}" to any Bossify inventory item by name.` } as any)
        .eq("id", localOrder.id);
      result.skipped.push({ orderId: platformOrderId!, reason: `Unmatched SKU: ${unmatched}` });
      continue;
    }
    if (engineItems.length === 0) {
      result.skipped.push({ orderId: platformOrderId!, reason: "No line items in order detail" });
      continue;
    }

    const payment = detail.payment;
    const sellerDiscount = Number(payment?.seller_discount ?? 0);
    const deliveryFeeCharged = Number(payment?.shipping_fee ?? 0);

    // Real Finance data only exists once TikTok has settled the order
    // (shipped, delivered, return window closed) — an order that's still
    // AWAITING_SHIPMENT genuinely has no fee breakdown yet, confirmed
    // against a real payload (2026-09-12): fee_and_tax_amount and
    // shipping_cost_amount both come back "0" pre-settlement, not because
    // of a parsing bug. We use the real numbers when TikTok has actually
    // calculated them, and fall back to the seller's configured % estimate
    // otherwise — same methodology manual orders already use.
    let finance: Awaited<ReturnType<typeof getTikTokOrderTransactions>> = null;
    try {
      finance = await getTikTokOrderTransactions(accessToken, c.platform_shop_cipher, detail.id);
    } catch {
      finance = null;
    }
    const financeSettled = finance && Number(finance.settlement_amount) > 0;
    const realPlatformFee = financeSettled ? Number(finance!.fee_and_tax_amount) : null;
    const realShippingCost = financeSettled ? Number(finance!.shipping_cost_amount) : null;

    const financials = calculateOrderFinancials({
      items: engineItems,
      sellerDiscount,
      deliveryFeeCharged,
      shippingCost: realShippingCost ?? 0,
      platformFeePercent, // Only used as the estimate fallback below when real data isn't settled yet.
      affiliateCommission: 0, // Not separable from fee_and_tax_amount without further real-data confirmation.
    });
    const platformFeeAmount = realPlatformFee ?? financials.platformFeeAmount;

    const productSummary = engineItems.map((it) => it.productName).join(", ");

    // Buyer details TikTok sends with the order, when it sends them. A
    // masked phone (with "*") is useless for calling or WhatsApp, so it's
    // left out; names and addresses are kept as TikTok gives them.
    const buyer = tiktokBuyerDetails(detail);

    // Replace order_items with the real, matched line items BEFORE the
    // order is marked complete: the stock trigger runs on that update and
    // moves stock by these line items (products not linked to TikTok go
    // down; TikTok-linked ones are left to the product sync).
    await supabaseAdmin.from("order_items" as any).delete().eq("order_id", localOrder.id);
    await supabaseAdmin.from("order_items" as any).insert(
      engineItems.map((it) => ({
        order_id: localOrder.id,
        product_id: it.productId,
        product_name: it.productName,
        quantity: it.quantity,
        unit_price_at_sale: it.unitPriceAtSale,
        unit_cost_at_sale: it.unitCostAtSale,
        packaging_cost_at_sale: it.packagingCostAtSale,
      })),
    );

    const { error: updErr } = await supabaseAdmin
      .from("orders" as any)
      .update({
        amount: financials.netRevenue,
        cost: financials.cogs,
        gross_profit: financials.grossProfit,
        seller_discount: sellerDiscount,
        delivery_fee_charged: deliveryFeeCharged,
        shipping_cost: realShippingCost ?? 0,
        platform_fee_percent_at_sale: platformFeePercent,
        platform_fee_amount: platformFeeAmount,
        affiliate_commission: 0,
        financial_status: "complete",
        platform_buyer_id: detail.user_id ?? null,
        ...(buyer.name ? { customer_name: buyer.name } : {}),
        ...(buyer.phone ? { phone: buyer.phone } : {}),
        ...(buyer.address ? { delivery_address: buyer.address } : {}),
        // Corrects the webhook's initial guess: a COD order isn't truly
        // "Paid" until it's delivered (cash collected on delivery), which
        // mapTikTokStatus now accounts for using the real is_cod flag.
        status: mappedStatus,
        product: productSummary,
        product_summary: productSummary,
        quantity: engineItems.length,
        platform_metadata: { order_detail: detail, finance_transactions: finance, platform_fee_source: financeSettled ? "real" : "estimate" },
        last_error: null,
      } as any)
      .eq("id", localOrder.id);
    if (updErr) {
      result.skipped.push({ orderId: platformOrderId!, reason: `DB update failed: ${updErr.message}` });
      continue;
    }


    // Make sure this TikTok buyer has a row in the customer list. TikTok
    // gives no name/phone, so the row is keyed by the buyer id and named
    // "TikTok #<last 6>"; an existing row is never renamed (the seller may
    // have given it a real name). Totals are recalculated from orders by
    // the customers page, so only last_order_at is kept fresh here.
    // Never blocks the order sync (e.g. if tiktok-customers.sql hasn't run).
    if (detail.user_id) {
      try {
        await upsertTikTokCustomer(userId, String(detail.user_id), buyer);
      } catch {
        // non-fatal
      }
    }

    result.completed++;
  }

  // --- Settlement re-check pass ---
  // A completed order sitting on an ESTIMATED fee never gets revisited by
  // the loop above (it only looks at financial_status = "pending"). Real
  // settlement from TikTok typically lands well after an order completes
  // (after delivery + the return window closes), so without this pass
  // "estimate" would in practice almost never become "real". Re-fetching
  // an order that's already real is impossible here by construction (the
  // query below only selects estimate-flagged orders), so this can't
  // double-count or re-process an order twice in one run.
  const { data: estimateOrders } = await supabaseAdmin
    .from("orders" as any)
    .select("id, platform_order_id, amount, cost, seller_discount, delivery_fee_charged, platform_fee_percent_at_sale, platform_metadata")
    .eq("user_id", userId)
    .eq("order_source", "tiktok")
    .eq("financial_status", "complete")
    .not("platform_order_id", "is", null)
    .contains("platform_metadata", { platform_fee_source: "estimate" } as any)
    .limit(BATCH_SIZE);

  for (const row of ((estimateOrders ?? []) as any[])) {
    try {
      const finance = await getTikTokOrderTransactions(accessToken, c.platform_shop_cipher, row.platform_order_id);
      const nowSettled = finance && Number(finance.settlement_amount) > 0;
      if (!nowSettled) continue; // still not settled — leave as estimate, try again next sync

      const realPlatformFee = Number(finance!.fee_and_tax_amount);
      const realShippingCost = Number(finance!.shipping_cost_amount);
      // Recompute contribution profit with the now-real fee, replacing
      // (never adding to) the previous estimate.
      const grossProfit = Number(row.amount) - Number(row.cost);
      const contributionProfit = grossProfit - realPlatformFee - realShippingCost;

      await supabaseAdmin
        .from("orders" as any)
        .update({
          platform_fee_amount: realPlatformFee,
          shipping_cost: realShippingCost,
          gross_profit: grossProfit,
          platform_metadata: {
            ...(row.platform_metadata ?? {}),
            platform_fee_source: "real",
            settlement_upgraded_at: new Date().toISOString(),
          },
        } as any)
        .eq("id", row.id);

      result.upgraded++;
    } catch {
      // Non-fatal: this order just stays on its estimate until the next sync run.
      continue;
    }
  }

  return result;
}

type TikTokBuyer = { name: string | null; phone: string | null; address: string | null };

function clean(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t : null;
}

/** Name / phone / address from a TikTok order, when TikTok includes them. */
function tiktokBuyerDetails(detail: TikTokOrderDetail): TikTokBuyer {
  const ra = detail.recipient_address;
  if (!ra) return { name: null, phone: null, address: null };
  const name = clean(ra.name) ?? clean([ra.first_name, ra.last_name].filter(Boolean).join(" "));
  const rawPhone = clean(ra.phone_number);
  const phone = rawPhone && !rawPhone.includes("*") ? rawPhone.replace(/[^\d+]/g, "") || null : null;
  const district = (ra.district_info ?? [])
    .map((d) => clean(d.address_name))
    .filter(Boolean)
    .join(", ");
  const address =
    clean(ra.full_address) ??
    clean([ra.address_detail ?? [ra.address_line1, ra.address_line2].filter(Boolean).join(" "), district, ra.postal_code].filter(Boolean).join(", "));
  return { name, phone, address };
}

/**
 * Makes sure this TikTok buyer has a row in the customer list, keyed by
 * TikTok's buyer id. A new row takes TikTok's recipient name, or
 * "TikTok #<last 6>" when there is none. An existing row keeps a name the
 * seller typed; only the auto "TikTok #" placeholder is upgraded to a real
 * name. Phone fills in only when empty; address follows the latest order.
 * Totals are recalculated from orders by the customers page.
 */
async function upsertTikTokCustomer(userId: string, buyerId: string, buyer: TikTokBuyer) {
  const now = new Date().toISOString();
  const placeholder = `TikTok #${buyerId.slice(-6)}`;
  // customers.address comes from stock-audit-round2.sql; fall back without it.
  let withAddress = true;
  let read = await supabaseAdmin
    .from("customers" as any)
    .select("id,name,phone,address")
    .eq("user_id", userId)
    .eq("platform_buyer_id", buyerId)
    .maybeSingle();
  if (read.error) {
    withAddress = false;
    read = await supabaseAdmin
      .from("customers" as any)
      .select("id,name,phone")
      .eq("user_id", userId)
      .eq("platform_buyer_id", buyerId)
      .maybeSingle();
    if (read.error) return; // tiktok-customers.sql not applied — skip quietly
  }
  const existing = read.data as any;
  if (existing) {
    const update: Record<string, unknown> = { last_order_at: now };
    if (buyer.name && String(existing.name ?? "").startsWith("TikTok #")) update.name = buyer.name;
    if (buyer.phone && !existing.phone) update.phone = buyer.phone;
    if (withAddress && buyer.address) update.address = buyer.address;
    await supabaseAdmin.from("customers" as any).update(update as any).eq("id", existing.id);
    return;
  }
  const row: Record<string, unknown> = {
    user_id: userId,
    name: buyer.name ?? placeholder,
    phone: buyer.phone,
    source: "tiktok",
    platform_buyer_id: buyerId,
    total_orders: 0,
    total_spent: 0,
    last_order_at: now,
  };
  if (withAddress && buyer.address) row.address = buyer.address;
  await supabaseAdmin.from("customers" as any).insert(row as any);
}
