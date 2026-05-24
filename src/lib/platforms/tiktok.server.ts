// TikTok Shop integration helpers.
// Docs: https://partner.tiktokshop.com/docv2/page/64f199709b2c4302c5e0e7c1
//
// Requires the seller's region to be picked when initiating OAuth.
// We pass it via the OAuth `state` (see oauth-state.server.ts) and store
// it on platform_connections.platform_shop_id-adjacent metadata if needed.

import { createHmac } from "crypto";

export const TIKTOK_AUTH_BASE = "https://services.tiktokshop.com/open/authorize";
export const TIKTOK_TOKEN_URL = "https://auth.tiktok-shops.com/api/v2/token/get";
export const TIKTOK_REFRESH_URL = "https://auth.tiktok-shops.com/api/v2/token/refresh";

export type TikTokTokenResponse = {
  access_token: string;
  refresh_token: string;
  access_token_expire_in: number; // seconds
  refresh_token_expire_in: number;
  open_id: string;
  seller_name?: string;
};

export function getTikTokCreds() {
  const appKey = process.env.TIKTOK_APP_KEY;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new Error(
      "TikTok Shop credentials are not configured yet. " +
        "Add TIKTOK_APP_KEY and TIKTOK_APP_SECRET in project secrets " +
        "after your TikTok Shop Partner application is approved."
    );
  }
  return { appKey, appSecret };
}

export function buildTikTokAuthUrl(input: { state: string; redirectUri: string }): string {
  const { appKey } = getTikTokCreds();
  const u = new URL(TIKTOK_AUTH_BASE);
  u.searchParams.set("app_key", appKey);
  u.searchParams.set("state", input.state);
  u.searchParams.set("redirect_uri", input.redirectUri);
  return u.toString();
}

export async function exchangeTikTokCode(code: string): Promise<TikTokTokenResponse> {
  const { appKey, appSecret } = getTikTokCreds();
  const u = new URL(TIKTOK_TOKEN_URL);
  u.searchParams.set("app_key", appKey);
  u.searchParams.set("app_secret", appSecret);
  u.searchParams.set("auth_code", code);
  u.searchParams.set("grant_type", "authorized_code");
  const res = await fetch(u.toString(), { method: "GET" });
  if (!res.ok) {
    throw new Error(`TikTok token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { code: number; data: TikTokTokenResponse; message?: string };
  if (json.code !== 0) {
    throw new Error(`TikTok token exchange error: ${json.message ?? "unknown"}`);
  }
  return json.data;
}

// Webhook signature: HMAC-SHA256 of (app_key + body) using app_secret,
// compared against header `Authorization` (TikTok Shop convention).
export function verifyTikTokWebhook(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const { appKey, appSecret } = getTikTokCreds();
  const expected = createHmac("sha256", appSecret).update(appKey + rawBody).digest("hex");
  // constant-time compare
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

// Map TikTok order status to our orders.status enum.
export function mapTikTokStatus(s: string): "Unpaid" | "Paid" | "Pending" | "Shipped" | "Delivered" | "Cancelled" | "Refunded" {
  switch (s.toUpperCase()) {
    case "UNPAID": return "Unpaid";
    case "AWAITING_SHIPMENT":
    case "PAID":
    case "ON_HOLD": return "Paid";
    case "AWAITING_COLLECTION":
    case "PARTIALLY_SHIPPING":
    case "IN_TRANSIT": return "Shipped";
    case "DELIVERED":
    case "COMPLETED": return "Delivered";
    case "CANCELLED": return "Cancelled";
    case "REFUNDED": return "Refunded";
    default: return "Pending";
  }
}