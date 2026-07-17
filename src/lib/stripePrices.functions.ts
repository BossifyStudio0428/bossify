// Web (Stripe) dynamic price fetcher. Mirrors the shape Google Play Billing
// returns for the Android path so the /plans UI can use one merge routine
// regardless of platform. On any failure it returns an empty map — callers
// keep their MYR fallbacks from src/lib/billing.ts so the page never breaks.
import { createServerFn } from "@tanstack/react-start";

// Same key set as the `PriceKey` union in src/routes/plans.tsx.
export type StripePriceKey =
  | "monthly"
  | "annual"
  | "lifetime"
  | "starter_monthly"
  | "starter_annual"
  | "business_monthly"
  | "business_annual"
  | "team_starter_monthly"
  | "team_starter_annual"
  | "team_pro_monthly"
  | "team_pro_annual"
  | "team_business_monthly"
  | "team_business_annual";

export type StripePriceMap = Partial<Record<StripePriceKey, string>>;

// Best-effort per-worker-instance cache. Prices rarely change; a 1h TTL keeps
// the /plans render fast without hammering Stripe.
const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { at: number; data: StripePriceMap } | null = null;

export const fetchStripePrices = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ prices: StripePriceMap; error?: string }> => {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return { prices: cache.data };
    }
    try {
      const { PRICE_IDS, PRICE_TO_PLAN, getStripe } = await import(
        "./stripe.server"
      );
      const stripe = getStripe();
      const ids = Object.values(PRICE_IDS);
      const priceObjs = await Promise.all(
        ids.map((id) => stripe.prices.retrieve(id)),
      );
      const map: StripePriceMap = {};
      for (const p of priceObjs) {
        const info = PRICE_TO_PLAN[p.id];
        if (!info) continue;
        const key = stripeKeyFor(info.plan, info.cycle);
        if (!key) continue;
        const formatted = formatMoney(p.unit_amount, p.currency);
        if (formatted) map[key] = formatted;
      }
      cache = { at: Date.now(), data: map };
      return { prices: map };
    } catch (e) {
      console.error("[fetchStripePrices] failed:", e);
      return { prices: {}, error: e instanceof Error ? e.message : String(e) };
    }
  },
);

function stripeKeyFor(
  plan:
    | "starter"
    | "pro"
    | "business"
    | "lifetime"
    | "team_starter"
    | "team_pro"
    | "team_business",
  cycle: "monthly" | "yearly" | "one",
): StripePriceKey | null {
  if (plan === "pro") return cycle === "monthly" ? "monthly" : cycle === "yearly" ? "annual" : null;
  if (plan === "lifetime") return "lifetime";
  if (plan === "starter") return cycle === "monthly" ? "starter_monthly" : cycle === "yearly" ? "starter_annual" : null;
  if (plan === "business") return cycle === "monthly" ? "business_monthly" : cycle === "yearly" ? "business_annual" : null;
  const suffix = cycle === "monthly" ? "monthly" : cycle === "yearly" ? "annual" : null;
  if (!suffix) return null;
  return `${plan}_${suffix}` as StripePriceKey;
}

function formatMoney(amountMinor: number | null, currency: string | null): string | null {
  if (amountMinor == null || !currency) return null;
  const cur = currency.toUpperCase();
  const major = amountMinor / 100;
  // Match existing fallback style ("RM 49") — hide decimals for whole values,
  // otherwise fall back to Intl currency formatting for the user's currency.
  if (cur === "MYR") {
    const whole = Math.round(major) === major;
    return whole
      ? `RM ${major.toLocaleString("en-MY", { maximumFractionDigits: 0 })}`
      : `RM ${major.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: Math.round(major) === major ? 0 : 2,
    }).format(major);
  } catch {
    return `${cur} ${major}`;
  }
}