// Server-only Stripe helpers shared by the Stripe API routes.
import "@tanstack/react-start/server-only";
import Stripe from "stripe";

export const PRICE_IDS: Record<string, string> = {
  "starter:monthly": "price_1TYQzgHkpW03osRD7GNJFs4D",
  "starter:yearly": "price_1TYR0LHkpW03osRDPHKAU9BF",
  "pro:monthly": "price_1TYR0xHkpW03osRD8sRq0tO2",
  "pro:yearly": "price_1TYR1LHkpW03osRDJrShdU7c",
  "lifetime:one": "price_1TYR1lHkpW03osRD3sRkqZcL",
  // TODO: replace with real IDs created in Stripe Dashboard.
  "business:monthly": "price_PLACEHOLDER_business_monthly",
  "business:yearly": "price_PLACEHOLDER_business_yearly",
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
  price_1TYQzgHkpW03osRD7GNJFs4D: { plan: "starter", cycle: "monthly" },
  price_1TYR0LHkpW03osRDPHKAU9BF: { plan: "starter", cycle: "yearly" },
  price_1TYR0xHkpW03osRD8sRq0tO2: { plan: "pro", cycle: "monthly" },
  price_1TYR1LHkpW03osRDJrShdU7c: { plan: "pro", cycle: "yearly" },
  price_1TYR1lHkpW03osRD3sRkqZcL: { plan: "lifetime", cycle: "one" },
  price_PLACEHOLDER_business_monthly: { plan: "business", cycle: "monthly" },
  price_PLACEHOLDER_business_yearly:  { plan: "business", cycle: "yearly" },
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