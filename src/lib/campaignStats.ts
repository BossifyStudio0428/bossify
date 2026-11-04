import { supabase } from "@/integrations/supabase/client";
import { orderContributionProfit } from "@/lib/orderMath";
import { fetchPeriodAdjustments } from "@/lib/refundAdjustments";

// Shared by /campaigns, /campaigns/$campaignId, and the home-page campaign
// banner so they all read the same saved data and compute period totals
// the same way — do not duplicate this math into any caller.
//
// Campaigns used to be a single hardcoded slot (11.11 only) stored as 4
// columns on `profiles`. Sellers run more than one sale event a year
// (11.11, 12.12, CNY, payday sales, ...), so this is now a proper
// `campaigns` table — sellers create as many as they want and can look
// back at how each one performed. See campaigns_migration.sql for the
// schema. The old profiles.campaign_* columns are no longer read or
// written by the app (left in place, unused, rather than risk a
// destructive column drop on an existing database).

export type Campaign = {
  id: string;
  name: string;
  start: string;
  end: string;
  targetRevenue: number | null;
  createdAt: string;
};
export type PeriodStats = { revenue: number; cost: number; profit: number; count: number };

type OrderFinRow = {
  amount: number | null;
  cost: number | null;
  gross_profit: number | null;
  platform_fee_amount: number | null;
  shipping_cost: number | null;
  affiliate_commission: number | null;
  financial_status: string | null;
  created_at: string;
};

// Date-input strings ("YYYY-MM-DD") turned into local-midnight ISO
// boundaries, so a campaign "start" includes all of that day and the
// exclusive "to" bound on a query includes all of the end day too.
export function dayStartISO(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toISOString();
}
export function dayAfterISO(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}
export function daysBetweenInclusive(startStr: string, endStr: string): number {
  const start = new Date(`${startStr}T00:00:00`);
  const end = new Date(`${endStr}T00:00:00`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}
// Local-calendar day arithmetic — avoids the UTC round-trip that
// toISOString().slice(0, 10) would introduce (which can shift the date by
// one day depending on the seller's timezone offset).
export function addDaysToDateStr(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function pctChange(current: number, baseline: number): number {
  if (baseline === 0) return current > 0 ? 100 : current < 0 ? -100 : 0;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

function mapCampaignRow(r: any): Campaign {
  return {
    id: r.id,
    name: r.name ?? "",
    start: r.start_date ?? "",
    end: r.end_date ?? "",
    targetRevenue: r.target_revenue != null ? Number(r.target_revenue) : null,
    createdAt: r.created_at ?? "",
  };
}

const CAMPAIGN_COLUMNS = "id,name,start_date,end_date,target_revenue,created_at";

export async function fetchCampaigns(userId: string): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from("campaigns" as any)
    .select(CAMPAIGN_COLUMNS)
    .eq("user_id", userId)
    .order("start_date", { ascending: false });
  if (error) {
    console.error("[campaignStats] fetchCampaigns failed", error.message);
    return [];
  }
  return ((data ?? []) as any[]).map(mapCampaignRow);
}

export async function fetchCampaign(userId: string, id: string): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from("campaigns" as any)
    .select(CAMPAIGN_COLUMNS)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapCampaignRow(data);
}

export async function createCampaign(
  userId: string,
  input: { name: string; start: string; end: string; targetRevenue: number | null },
): Promise<Campaign> {
  const { data, error } = await supabase
    .from("campaigns" as any)
    .insert({
      user_id: userId,
      name: input.name.trim() || "Untitled",
      start_date: input.start,
      end_date: input.end,
      target_revenue: input.targetRevenue,
    })
    .select(CAMPAIGN_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create campaign");
  return mapCampaignRow(data);
}

export async function updateCampaign(
  id: string,
  input: { name: string; start: string; end: string; targetRevenue: number | null },
): Promise<void> {
  const { error } = await supabase
    .from("campaigns" as any)
    .update({
      name: input.name.trim() || "Untitled",
      start_date: input.start,
      end_date: input.end,
      target_revenue: input.targetRevenue,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Cascades to that campaign's campaign_promotions rows via the FK (see
 * campaigns_migration.sql) — no separate cleanup needed here. */
export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabase.from("campaigns" as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Same Contribution-Profit math /profit uses: sum order-level contribution
 * profit over [fromISO, toISO), then net out refunds/returns dated inside
 * that window (never rewriting the original order's own numbers). */
export async function fetchPeriodStats(userId: string, fromISO: string, toISO: string): Promise<PeriodStats> {
  const [{ data, error }, adj] = await Promise.all([
    supabase
      .from("orders")
      .select("amount,cost,gross_profit,status,created_at,platform_fee_amount,shipping_cost,affiliate_commission,financial_status")
      .eq("user_id", userId)
      .eq("status", "Paid")
      .gte("created_at", fromISO)
      .lt("created_at", toISO),
    fetchPeriodAdjustments(userId, fromISO, toISO),
  ]);
  if (error) console.error("[campaignStats] orders fetch failed", error.message);
  const complete = ((data ?? []) as OrderFinRow[]).filter((o) => o.financial_status !== "pending");
  let revenue = 0;
  let cost = 0;
  let profit = 0;
  for (const o of complete) {
    revenue += Number(o.amount ?? 0);
    cost += Number(o.cost ?? 0);
    profit += orderContributionProfit(o);
  }
  revenue -= adj.revenueReversed;
  cost -= adj.cogsReversed;
  profit -= adj.revenueReversed - adj.cogsReversed;
  return { revenue, cost, profit, count: complete.length };
}