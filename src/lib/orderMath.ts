type MoneyLike = number | string | null | undefined;

const money = (value: MoneyLike) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// Round to 2 decimal places to avoid floating-point drift (0.1 + 0.2 style bugs)
// accumulating across many line items / period sums.
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ============================================================
// LEGACY (kept for backward compatibility — existing order
// creation paths and reports still use these until they're
// migrated to the new engine below).
// ============================================================

export type ProfitOrder = {
  amount?: MoneyLike;
  cost?: MoneyLike;
  gross_profit?: MoneyLike;
};

export function orderCost(order: ProfitOrder) {
  return money(order.cost);
}

export function orderGrossProfit(order: ProfitOrder) {
  const amount = money(order.amount);
  const cost = orderCost(order);
  const stored = Number(order.gross_profit);
  if (Number.isFinite(stored) && (stored !== 0 || cost > 0 || amount === 0)) return stored;
  return amount - cost;
}

export function orderProfitMargin(revenue: number, grossProfit: number) {
  return revenue > 0 ? (grossProfit / revenue) * 100 : 0;
}

// ============================================================
// FINANCIAL ENGINE v1 — single source of truth for order
// economics. All order-creation paths (manual entry, public
// order form, CSV import, order edit) must call
// calculateOrderFinancials() instead of computing cost/profit
// inline. Reports/dashboard/PDF/alerts read the stored
// snapshot values via orderContributionProfit() — they never
// recompute revenue or cost from scratch.
// ============================================================

export type OrderItemInput = {
  quantity: number;
  unitPriceAtSale: MoneyLike;
  unitCostAtSale: MoneyLike;
  packagingCostAtSale: MoneyLike;
};

export type OrderFinancialsInput = {
  items: OrderItemInput[];
  sellerDiscount?: MoneyLike;
  deliveryFeeCharged?: MoneyLike;
  shippingCost?: MoneyLike;
  /** Fixed % applied to net revenue for manual/CSV orders (from profiles.platform_fee_percent). */
  platformFeePercent?: MoneyLike;
  /** Real fee amount, when known (e.g. from TikTok Order Detail API). Overrides platformFeePercent when provided. */
  platformFeeAmount?: MoneyLike;
  affiliateCommission?: MoneyLike;
};

export type OrderFinancials = {
  grossMerchandiseAmount: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  platformFeeAmount: number;
  shippingCost: number;
  affiliateCommission: number;
  /** Order-level economics before period operating expenses. This is what
   * loss-making-product alerts should check — not grossProfit, and never
   * net of company-wide operating expenses. */
  contributionProfit: number;
};

/**
 * Calculates the full order-level financial breakdown for one order.
 * Call this at order-creation time (and re-run on edit) — the result
 * is what gets written to `orders` and `order_items` as historical
 * snapshots. Never recompute this later from live product master data.
 */
export function calculateOrderFinancials(input: OrderFinancialsInput): OrderFinancials {
  const items = input.items ?? [];

  const grossMerchandiseAmount = round2(
    items.reduce((sum, it) => sum + money(it.unitPriceAtSale) * Math.max(1, it.quantity || 1), 0),
  );

  const sellerDiscount = money(input.sellerDiscount);
  const deliveryFeeCharged = money(input.deliveryFeeCharged);
  const netRevenue = round2(grossMerchandiseAmount - sellerDiscount + deliveryFeeCharged);

  const cogs = round2(
    items.reduce((sum, it) => {
      const qty = Math.max(1, it.quantity || 1);
      return sum + (money(it.unitCostAtSale) + money(it.packagingCostAtSale)) * qty;
    }, 0),
  );

  const grossProfit = round2(netRevenue - cogs);

  const platformFeeAmount = round2(
    input.platformFeeAmount != null
      ? money(input.platformFeeAmount)
      : netRevenue * (money(input.platformFeePercent) / 100),
  );

  const shippingCost = round2(money(input.shippingCost));
  const affiliateCommission = round2(money(input.affiliateCommission));

  const contributionProfit = round2(grossProfit - platformFeeAmount - shippingCost - affiliateCommission);

  return {
    grossMerchandiseAmount,
    netRevenue,
    cogs,
    grossProfit,
    platformFeeAmount,
    shippingCost,
    affiliateCommission,
    contributionProfit,
  };
}

// ------------------------------------------------------------
// Read-side: derive Contribution Profit from a STORED order row
// (i.e. the columns written by calculateOrderFinancials above).
// Use this in reports/dashboard/alerts — never re-derive revenue
// or cost independently.
// ------------------------------------------------------------

export type StoredOrderFinancials = {
  amount?: MoneyLike; // net revenue, as stored
  cost?: MoneyLike; // COGS, as stored
  gross_profit?: MoneyLike;
  platform_fee_amount?: MoneyLike;
  shipping_cost?: MoneyLike;
  affiliate_commission?: MoneyLike;
  financial_status?: string | null;
};

export function orderContributionProfit(order: StoredOrderFinancials): number {
  const grossProfit = orderGrossProfit(order);
  return round2(
    grossProfit - money(order.platform_fee_amount) - money(order.shipping_cost) - money(order.affiliate_commission),
  );
}

/** True if this order should be counted in P&L / reports at all.
 * TikTok placeholder orders (financial_status = "pending") are excluded
 * until real order detail data arrives — never show them as RM0 in reports. */
export function isFinanciallyComplete(order: StoredOrderFinancials): boolean {
  return order.financial_status !== "pending";
}

// ------------------------------------------------------------
// Period-level P&L
// ------------------------------------------------------------

export type OperatingExpenseInput = {
  amount: MoneyLike;
};

export type PeriodPnLResult = {
  totalContributionProfit: number;
  totalOperatingExpenses: number;
  netProfit: number;
  orderCount: number;
};

/**
 * Aggregates Contribution Profit across a set of orders (already
 * filtered by the caller for the selected date range and the
 * paid_orders/all_orders report_basis toggle), then subtracts
 * period operating expenses. Orders with financial_status = "pending"
 * are always excluded regardless of what the caller passes in.
 */
export function calculatePeriodPnL(
  orders: StoredOrderFinancials[],
  operatingExpenses: OperatingExpenseInput[],
): PeriodPnLResult {
  const eligible = orders.filter(isFinanciallyComplete);

  const totalContributionProfit = round2(
    eligible.reduce((sum, o) => sum + orderContributionProfit(o), 0),
  );

  const totalOperatingExpenses = round2(
    operatingExpenses.reduce((sum, e) => sum + money(e.amount), 0),
  );

  const netProfit = round2(totalContributionProfit - totalOperatingExpenses);

  return {
    totalContributionProfit,
    totalOperatingExpenses,
    netProfit,
    orderCount: eligible.length,
  };
}

// ============================================================
// REFUNDS / RETURNS — immutable adjustment log, not a rewrite
// of the original order. Each adjustment reverses some revenue
// and (depending on the scenario) some COGS, dated on the day
// the refund/return actually happened — so past periods' reports
// stay honest instead of being silently edited.
// ============================================================

export type AdjustmentType =
  | "cancel_before_ship"   // order cancelled before it ever shipped
  | "refund_no_return"     // money refunded, buyer keeps the goods
  | "return_resellable"    // goods came back in sellable condition
  | "return_damaged"       // goods came back but can't be resold
  | "partial_refund";      // a custom partial amount, seller-specified

/**
 * The 4 fixed scenarios reverse revenue and COGS by a fixed rule, using
 * the order's own already-stored amount/cost as the full-order baseline.
 * "partial_refund" is deliberately NOT covered here — the caller supplies
 * the exact revenue/COGS amounts directly, since a partial by definition
 * has no fixed rule to derive them from.
 */
export function calculateAdjustment(
  type: Exclude<AdjustmentType, "partial_refund">,
  order: { amount: MoneyLike; cost: MoneyLike },
): { revenueReversed: number; cogsReversed: number; restocked: boolean } {
  const amount = money(order.amount);
  const cost = money(order.cost);
  switch (type) {
    case "cancel_before_ship":
      // Sale never truly completed — reverse both sides fully, and the
      // goods never left, so they go back into sellable stock.
      return { revenueReversed: amount, cogsReversed: cost, restocked: true };
    case "refund_no_return":
      // Money back, but the goods are gone for good (buyer keeps them,
      // lost in transit, etc) — cost already incurred, keep it, no restock.
      return { revenueReversed: amount, cogsReversed: 0, restocked: false };
    case "return_resellable":
      // Goods are back on the shelf — reverse both sides, restock.
      return { revenueReversed: amount, cogsReversed: cost, restocked: true };
    case "return_damaged":
      // Goods are back but worthless — revenue reversed, cost stays
      // incurred (it was genuinely spent), no restock (can't resell it).
      return { revenueReversed: amount, cogsReversed: 0, restocked: false };
  }
}

// ============================================================
// WEIGHTED AVERAGE COST — updated each time stock is received.
// Past orders' unit_cost_at_sale snapshots are never touched by
// this — only future sales use the new weighted average.
// ============================================================

/**
 * Rolls a new stock receipt into the existing weighted-average cost.
 * If there's no existing stock (or it's zero/negative), the new
 * receipt's own unit cost simply becomes the new cost — there's
 * nothing to average against yet.
 */
export function calculateWeightedAverageCost(input: {
  existingStock: MoneyLike;
  existingCostPrice: MoneyLike;
  quantityReceived: MoneyLike;
  unitLandedCost: MoneyLike;
}): number {
  const existingStock = Math.max(0, money(input.existingStock));
  const existingCostPrice = money(input.existingCostPrice);
  const quantityReceived = money(input.quantityReceived);
  const unitLandedCost = money(input.unitLandedCost);
  if (existingStock <= 0) return round2(unitLandedCost);
  const totalValue = existingStock * existingCostPrice + quantityReceived * unitLandedCost;
  const totalUnits = existingStock + quantityReceived;
  return totalUnits > 0 ? round2(totalValue / totalUnits) : round2(unitLandedCost);
}

/** unit_landed_cost = (purchase amount + freight/duty/etc) ÷ quantity received. */
export function calculateUnitLandedCost(purchaseAmount: MoneyLike, landedExtraCosts: MoneyLike, quantityReceived: MoneyLike): number {
  const qty = money(quantityReceived);
  if (qty <= 0) return 0;
  return round2((money(purchaseAmount) + money(landedExtraCosts)) / qty);
}