import { supabase } from "@/integrations/supabase/client";

export type PeriodAdjustments = {
  revenueReversed: number;
  cogsReversed: number;
  count: number;
};

/**
 * Sums refund/return adjustments whose created_at falls within [from, to)
 * — this is what makes a refund show up in the period it actually
 * happened, instead of retroactively editing the original sale's numbers
 * (which live untouched on the `orders` row).
 *
 * Every report/dashboard that shows a period's revenue or profit should
 * call this and subtract the result, on top of summing `orders` rows as
 * they already do.
 */
export async function fetchPeriodAdjustments(
  userId: string,
  fromISO: string,
  toISO: string,
): Promise<PeriodAdjustments> {
  const { data, error } = await supabase
    .from("order_adjustments" as any)
    .select("revenue_reversed,cogs_reversed")
    .eq("user_id", userId)
    .gte("created_at", fromISO)
    .lt("created_at", toISO);
  if (error || !data) return { revenueReversed: 0, cogsReversed: 0, count: 0 };
  const rows = data as any[];
  return {
    revenueReversed: rows.reduce((s, r) => s + Number(r.revenue_reversed ?? 0), 0),
    cogsReversed: rows.reduce((s, r) => s + Number(r.cogs_reversed ?? 0), 0),
    count: rows.length,
  };
}