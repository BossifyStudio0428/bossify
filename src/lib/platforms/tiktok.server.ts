// TikTok Shop integration helpers.
// Docs: https://partner.tiktokshop.com/docv2/page/64f199709b2c4302c5e0e7c1

import { createHmac } from "crypto";

export const TIKTOK_AUTH_BASE = "https://services.tiktokshop.com/open/authorize";
export const TIKTOK_TOKEN_URL = "https://auth.tiktok-shops.com/api/v2/token/get";
export const TIKTOK_REFRESH_URL = "https://auth.tiktok-shops.com/api/v2/token/refresh";
export const TIKTOK_API_BASE = "https://open-api.tiktokglobalshop.com";
export const TIKTOK_AUTHORIZED_SHOPS_PATH = "/authorization/202309/shops";

export type TikTokTokenResponse = {
  access_token: string;
  refresh_token: string;
  access_token_expire_in: number;
  refresh_token_expire_in: number;
  open_id: string;
  seller_name?: string;
};

export type TikTokShop = {
  id: string;
  name: string;
  region: string;
  seller_type?: string;
  cipher?: string;
  code?: string;
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

function signTikTokRequest(path: string, params: Record<string, string>, body?: string): string {
  const { appSecret } = getTikTokCreds();
  const sortedKeys = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort();
  const concatenated = sortedKeys.map((k) => `${k}${params[k]}`).join("");
  // POST requests with a JSON body must include the raw body in the
  // signature (between the sorted params and the trailing secret) — GET
  // requests (Order Detail, Get Authorized Shops) never exercised this
  // path, which is why the omission wasn't caught until Search Products.
  const base = `${path}${concatenated}${body ?? ""}`;
  const wrapped = `${appSecret}${base}${appSecret}`;
  return createHmac("sha256", appSecret).update(wrapped).digest("hex");
}

export async function getTikTokAuthorizedShops(accessToken: string): Promise<TikTokShop[]> {
  const { appKey } = getTikTokCreds();
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const params: Record<string, string> = {
    app_key: appKey,
    timestamp,
  };
  const sign = signTikTokRequest(TIKTOK_AUTHORIZED_SHOPS_PATH, params);

  const u = new URL(TIKTOK_API_BASE + TIKTOK_AUTHORIZED_SHOPS_PATH);
  u.searchParams.set("app_key", appKey);
  u.searchParams.set("timestamp", timestamp);
  u.searchParams.set("sign", sign);

  const res = await fetch(u.toString(), {
    method: "GET",
    headers: {
      "x-tts-access-token": accessToken,
      "content-type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`TikTok get authorized shops failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    code: number;
    data: { shops: TikTokShop[] };
    message?: string;
  };
  if (json.code !== 0) {
    throw new Error(`TikTok get authorized shops error: ${json.message ?? "unknown"}`);
  }
  return json.data.shops ?? [];
}

export const TIKTOK_ORDER_DETAIL_PATH = "/order/202309/orders";
export const TIKTOK_ORDER_FINANCE_PATH_PREFIX = "/finance/202501/orders";

// ------------------------------------------------------------
// Order line item / payment shapes, based on TikTok Shop API
// v202309 (confirmed against a maintained community Go SDK —
// field names below are real, not guessed).
// ------------------------------------------------------------
export type TikTokPayment = {
  currency: string;
  sub_total: string;
  shipping_fee: string;
  seller_discount: string;
  platform_discount: string;
  total_amount: string;
  original_total_product_price: string;
  original_shipping_fee: string;
  shipping_fee_seller_discount: string;
  shipping_fee_platform_discount: string;
  tax?: string;
};

export type TikTokOrderLineItem = {
  id: string;
  sku_id: string;
  product_id: string;
  product_name: string;
  sku_image?: string;
  package_id?: string;
  package_status?: string;
  is_gift?: boolean;
  original_price: string;
  platform_discount?: string;
  seller_discount?: string;
  sale_price?: string;
};

export type TikTokOrderDetail = {
  id: string;
  status: string;
  is_cod?: boolean;
  // Confirmed real field (2026-09-16): a stable per-buyer identifier —
  // NOT their name/email/phone (TikTok never exposes those to sellers),
  // but the SAME buyer's orders always share this same value. This is
  // the only reliable way to detect a repeat buyer without knowing who
  // they actually are.
  user_id?: string;
  payment: TikTokPayment;
  line_items: TikTokOrderLineItem[];
  paid_time?: number;
  update_time?: number;
  shipping_type?: string;
  tracking_number?: string;
};

/**
 * Get Order Detail (v202309). Fetches up to 50 order IDs at once.
 * Requires the `seller.order.info` scope (confirmed active for Bossify).
 */
export async function getTikTokOrderDetail(
  accessToken: string,
  shopCipher: string,
  orderIds: string[],
): Promise<TikTokOrderDetail[]> {
  const { appKey } = getTikTokCreds();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params: Record<string, string> = {
    app_key: appKey,
    shop_cipher: shopCipher,
    ids: orderIds.join(","),
    timestamp,
  };
  const sign = signTikTokRequest(TIKTOK_ORDER_DETAIL_PATH, params);

  const u = new URL(TIKTOK_API_BASE + TIKTOK_ORDER_DETAIL_PATH);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("sign", sign);

  const res = await fetch(u.toString(), {
    method: "GET",
    headers: { "x-tts-access-token": accessToken, "content-type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`TikTok get order detail failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { code: number; data: { orders: TikTokOrderDetail[] }; message?: string };
  if (json.code !== 0) {
    throw new Error(`TikTok get order detail error: ${json.message ?? "unknown"}`);
  }
  return json.data.orders ?? [];
}

/**
 * Confirmed real response shape (2026-09-12) for Get Transactions by
 * Order. Values are all "0" until the order actually settles (ships,
 * is delivered, and the return window closes) — an order still
 * AWAITING_SHIPMENT genuinely has no fee data yet. That's TikTok's own
 * settlement timeline, not a bug in this integration.
 */
export type TikTokFinanceTransactions = {
  order_id: string;
  revenue_amount: string;
  settlement_amount: string;
  fee_and_tax_amount: string;
  shipping_cost_amount: string;
  sku_transactions: unknown[];
};

/**
 * Get Transactions by Order (Finance API, v202501). Requires the
 * `seller.finance.info` scope (confirmed active for Bossify). Response
 * field names confirmed against a real payload — see
 * TikTokFinanceTransactions above.
 */
export async function getTikTokOrderTransactions(
  accessToken: string,
  shopCipher: string,
  orderId: string,
): Promise<TikTokFinanceTransactions | null> {
  const { appKey } = getTikTokCreds();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const path = `${TIKTOK_ORDER_FINANCE_PATH_PREFIX}/${orderId}/statement_transactions`;
  const params: Record<string, string> = {
    app_key: appKey,
    shop_cipher: shopCipher,
    timestamp,
  };
  const sign = signTikTokRequest(path, params);

  const u = new URL(TIKTOK_API_BASE + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("sign", sign);

  const res = await fetch(u.toString(), {
    method: "GET",
    headers: { "x-tts-access-token": accessToken, "content-type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`TikTok get order transactions failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { code: number; data: TikTokFinanceTransactions; message?: string };
  if (json.code !== 0) return null;
  return json.data;
}

/** @deprecated Use getTikTokOrderTransactions — kept for the raw-storage call site until fully migrated. */
export async function getTikTokOrderTransactionsRaw(
  accessToken: string,
  shopCipher: string,
  orderId: string,
): Promise<unknown> {
  return getTikTokOrderTransactions(accessToken, shopCipher, orderId);
}

/**
 * Refresh an expired/expiring TikTok access token using the stored
 * refresh token. Refresh tokens are long-lived but access tokens expire.
 */
export async function refreshTikTokAccessToken(refreshToken: string): Promise<TikTokTokenResponse> {
  const { appKey, appSecret } = getTikTokCreds();
  const u = new URL(TIKTOK_REFRESH_URL);
  u.searchParams.set("app_key", appKey);
  u.searchParams.set("app_secret", appSecret);
  u.searchParams.set("refresh_token", refreshToken);
  u.searchParams.set("grant_type", "refresh_token");
  const res = await fetch(u.toString(), { method: "GET" });
  if (!res.ok) {
    throw new Error(`TikTok token refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { code: number; data: TikTokTokenResponse; message?: string };
  if (json.code !== 0) {
    throw new Error(`TikTok token refresh error: ${json.message ?? "unknown"}`);
  }
  return json.data;
}
export const TIKTOK_PRODUCT_SEARCH_PATH = "/product/202502/products/search";
export const TIKTOK_PRODUCT_DETAIL_PATH_PREFIX = "/product/202309/products";

export type TikTokProductSku = {
  id: string;
  seller_sku?: string;
  price: { tax_exclusive_price: string; currency?: string };
  // Confirmed field names from TikTok Shop API docs — a SKU's stock can
  // be split across multiple warehouses, so this is a list; we sum
  // `quantity` across all of them for a single "stock" number.
  inventory?: Array<{ warehouse_id?: string; quantity?: number }>;
};

export type TikTokProductDetail = {
  id: string;
  title: string;
  skus: TikTokProductSku[];
  // Confirmed real field name/shape (2026-09-12): array of image objects,
  // each with thumb_urls (small) and urls (full-size).
  main_images?: Array<{ urls?: string[]; thumb_urls?: string[] }>;
};

/**
 * Search Products (v202309). Lists product IDs for this shop, paginated.
 * Requires `seller.product.basic` / `seller.global_product.info` scope
 * (confirmed active for Bossify). The exact response shape for this
 * endpoint is NOT independently verified against a real payload yet
 * (unlike Get Product below) — this function is defensive about the
 * `products` array's exact field names and should be checked against
 * a real response the first time it runs.
 */
export async function searchTikTokProducts(
  accessToken: string,
  shopCipher: string,
  shopId: string,
  pageToken?: string,
): Promise<{ productIds: string[]; nextPageToken: string | null }> {
  const { appKey } = getTikTokCreds();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  // Confirmed against a real, working request via TikTok's own API Testing
  // Tool (2026-09-12): page_size, shop_id, and version are all signed query
  // params here — NOT body fields. Body stays an empty JSON object.
  const params: Record<string, string> = {
    app_key: appKey,
    shop_cipher: shopCipher,
    shop_id: shopId,
    timestamp,
    version: "202502",
    page_size: "50",
    ...(pageToken ? { page_token: pageToken } : {}),
  };
  const bodyStr = "{}";
  const sign = signTikTokRequest(TIKTOK_PRODUCT_SEARCH_PATH, params, bodyStr);
  const u = new URL(TIKTOK_API_BASE + TIKTOK_PRODUCT_SEARCH_PATH);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("access_token", accessToken); // present in URL but excluded from the signature itself
  u.searchParams.set("sign", sign);

  const res = await fetch(u.toString(), {
    method: "POST",
    headers: { "x-tts-access-token": accessToken, "content-type": "application/json" },
    body: bodyStr,
  });
  if (!res.ok) {
    throw new Error(`TikTok search products failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    code: number;
    message?: string;
    data: { products?: Array<{ id: string }>; next_page_token?: string; total_count?: number };
  };
  if (json.code !== 0) {
    throw new Error(`TikTok search products error: ${json.message ?? "unknown"}`);
  }
  const productIds = (json.data.products ?? []).map((p) => p.id).filter(Boolean);
  return { productIds, nextPageToken: json.data.next_page_token || null };
}

/**
 * Get Product (v202309) — single product detail. Field names confirmed
 * against real TikTok Shop API documentation (title, skus[].seller_sku,
 * skus[].price.tax_exclusive_price).
 */
export async function getTikTokProduct(
  accessToken: string,
  shopCipher: string,
  productId: string,
): Promise<TikTokProductDetail> {
  const { appKey } = getTikTokCreds();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const path = `${TIKTOK_PRODUCT_DETAIL_PATH_PREFIX}/${productId}`;
  const params: Record<string, string> = { app_key: appKey, shop_cipher: shopCipher, timestamp };
  const sign = signTikTokRequest(path, params);
  const u = new URL(TIKTOK_API_BASE + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("sign", sign);

  const res = await fetch(u.toString(), {
    method: "GET",
    headers: { "x-tts-access-token": accessToken, "content-type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`TikTok get product failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { code: number; message?: string; data: TikTokProductDetail };
  if (json.code !== 0) {
    throw new Error(`TikTok get product error: ${json.message ?? "unknown"}`);
  }
  return json.data;
}

export function verifyTikTokWebhook(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const { appKey, appSecret } = getTikTokCreds();
  const expected = createHmac("sha256", appSecret).update(appKey + rawBody).digest("hex");
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export function mapTikTokStatus(
  s: string,
  isCod?: boolean,
): "Unpaid" | "Paid" | "Pending" | "Shipped" | "Delivered" | "Cancelled" | "Refunded" {
  const status = s.toUpperCase();
  // COD (cash on delivery): the buyer hasn't actually paid anything until
  // the courier collects cash on delivery. Showing "Paid" while the order
  // is merely confirmed/awaiting shipment is misleading — only mark it
  // Paid once it's genuinely delivered or completed.
  if (isCod && (status === "AWAITING_SHIPMENT" || status === "ON_HOLD")) {
    return "Unpaid";
  }
  switch (status) {
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