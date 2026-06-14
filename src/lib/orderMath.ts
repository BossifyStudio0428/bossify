type MoneyLike = number | string | null | undefined;

export type ProfitOrder = {
  amount?: MoneyLike;
  cost?: MoneyLike;
  gross_profit?: MoneyLike;
};

const money = (value: MoneyLike) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
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