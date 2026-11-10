// Server-only Stripe helpers shared by the Stripe API routes.
import "@tanstack/react-start/server-only";
import Stripe from "stripe";

export const PRICE_IDS: Record<string, string> = {
  // Monthly/yearly — live RM pricing (2026-11 pitch-deck pricing: Free RM0 /
  // Pro RM19.90 / Business RM49.90, annual = 10x monthly). The old RM59/
  // RM99/RM129 Starter/Pro/Business prices (and their Products) were
  // archived in Stripe the same day these were created — confirmed no real
  // subscribers were ever on them, so this was a clean swap, not a
  // migration. Starter itself is no longer part of the pricing structure at
  // all (see plans.tsx — its card doesn't render) and isn't replaced here.
  "pro:monthly":      "price_1UaCGyHkpW03osRDpPykZxSF", // RM 19.90
  "pro:yearly":       "price_1UaCGzHkpW03osRDR4Y3eLhi", // RM 199
  "business:monthly": "price_1UaCGzHkpW03osRD5xNvXQk1", // RM 49.90
  "business:yearly":  "price_1UaCH0HkpW03osRDEZ1ZNTuS", // RM 499
  // Lifetime / Team — dormant (HIDE_TEAM_PLAN / Lifetime card both hidden
  // in plans.tsx). Their underlying Stripe prices were archived in the
  // same cleanup as Starter/old Pro/old Business above; left here only so
  // a pre-existing Lifetime/Team subscriber's stored price id still
  // resolves via priceToPlan() below — these are not used to start any new
  // checkout (the UI never surfaces them), so an archived price id here is
  // harmless. Do not reuse these ids for anything new.
  "lifetime:one":     "price_1TYR1lHkpW03osRD3sRkqZcL",
  "team_starter:monthly": "price_1TamtmHkpW03osRDhcMkc9bH",
  "team_starter:yearly": "price_1TamuIHkpW03osRDENjsHuL0",
  "team_pro:monthly": "price_1TamucHkpW03osRDVEwu8wmD",
  "team_pro:yearly": "price_1Tamv6HkpW03osRDzhg1ksUP",
  "team_business:monthly": "price_1TamveHkpW03osRDx8m6JVZj",
  "team_business:yearly": "price_1TamvwHkpW03osRDjjB4ILBg",
};

export type PlanInfo = {
  plan: "starter" | "pro" | "business" | "lifetime" | "team_starter" | "team_pro" | "team_business";
  cycle: "monthly" | "yearly" | "one";
};

export const PRICE_TO_PLAN: Record<string, PlanInfo> = {
  price_1UaCGyHkpW03osRDpPykZxSF: { plan: "pro",      cycle: "monthly" },
  price_1UaCGzHkpW03osRDR4Y3eLhi: { plan: "pro",      cycle: "yearly" },
  price_1UaCGzHkpW03osRD5xNvXQk1: { plan: "business", cycle: "monthly" },
  price_1UaCH0HkpW03osRDEZ1ZNTuS: { plan: "business", cycle: "yearly" },
  price_1TYR1lHkpW03osRD3sRkqZcL: { plan: "lifetime", cycle: "one" },
  price_1TamtmHkpW03osRDhcMkc9bH: { plan: "team_starter", cycle: "monthly" },
  price_1TamuIHkpW03osRDENjsHuL0: { plan: "team_starter", cycle: "yearly" },
  price_1TamucHkpW03osRDVEwu8wmD: { plan: "team_pro", cycle: "monthly" },
  price_1Tamv6HkpW03osRDzhg1ksUP: { plan: "team_pro", cycle: "yearly" },
  price_1TamveHkpW03osRDx8m6JVZj: { plan: "team_business", cycle: "monthly" },
  price_1TamvwHkpW03osRDjjB4ILBg: { plan: "team_business", cycle: "yearly" },
};

export function getStripe(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured");
  // Cloudflare Workers runtime: Node's `http` module is stubbed, so the
  // Stripe SDK's default HTTP client hangs/crashes. Use the fetch-based
  // client so requests actually go out.
  return new Stripe(secret, {
    apiVersion: "2024-11-20.acacia" as any,
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function priceToPlan(priceId: string | null | undefined): PlanInfo | null {
  return priceId ? PRICE_TO_PLAN[priceId] ?? null : null;
}