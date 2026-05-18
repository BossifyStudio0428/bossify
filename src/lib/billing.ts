// Google Play Billing helper backed by cordova-plugin-purchase (CC.Fovea).
//
// The plugin is auto-loaded by Capacitor on Android (npx cap sync picks up
// the cordova package from package.json and exposes window.CdvPurchase at
// runtime). On web / preview none of the native code runs and we fall back
// to the MYR fallback prices so the UI still renders.

// Google Play Console subscription product IDs.
// Bossify uses ONE subscription with TWO base plans (Google's recommended
// modern setup). Create these in Play Console → Monetize → Subscriptions:
//
//   Subscription product ID:  bossify_pro
//     Base plan #1 ID:        monthly   (RM 49 / month, auto-renewing)
//     Base plan #2 ID:        annual    (RM 399 / year, auto-renewing)
//
// Google Play will automatically convert RM 49 / RM 399 to each user's local
// currency at checkout (USD, IDR, PHP, INR, etc.). The store-localized price
// strings are fetched at runtime via queryProductDetails() and shown in the
// Plans UI, so the in-app price always matches what the user will be charged.
export const SUBSCRIPTION_ID = "bossify_pro";
export const BASE_PLAN_IDS = {
  monthly: "monthly",
  annual: "annual",
} as const;

export type BillingPlan = keyof typeof BASE_PLAN_IDS;

/** Fallback prices (MYR) when the store hasn't returned localized values yet. */
export const FALLBACK_PRICES: Record<BillingPlan, string> = {
  // Neutral placeholder — the real, locally-formatted price comes from
  // Google Play (queryProductDetails). Never hardcode an MYR amount here
  // because users in other countries see their own currency from the store.
  monthly: "—",
  annual: "—",
};

/** One-time, non-consumable Lifetime product. */
export const LIFETIME_PRODUCT_ID = "bossify_lifetime";
export const LIFETIME_FALLBACK_PRICE = "—";

/**
 * Starter Plan — separate subscription SKUs (not base plans of `bossify_pro`).
 * Limits: 40 orders / month, 25 products.
 */
export const STARTER_PRODUCT_IDS: Record<BillingPlan, string> = {
  monthly: "bossify_starter_monthly",
  annual: "bossify_starter_yearly",
};
export const STARTER_FALLBACK_PRICES: Record<BillingPlan, string> = {
  monthly: "—",
  annual: "—",
};

export type PurchaseReceipt = {
  productId: string;
  transactionId: string;
  purchaseToken?: string;
  basePlanId?: BillingPlan;
  currentPeriodEnd?: string;
};

export type BillingErrorCode =
  | "not_android"      // Running on web / preview
  | "item_unavailable" // Product not configured in Play Console yet
  | "user_cancelled"
  | "unknown";

export type BillingError = { code: BillingErrorCode; message: string };

/** True only when the app is running inside the Android (Capacitor) shell. */
export function isNativeBillingAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  };
  const cap = w.Capacitor;
  if (!cap) return false;
  try {
    if (typeof cap.isNativePlatform === "function" && !cap.isNativePlatform()) return false;
    if (typeof cap.getPlatform === "function") return cap.getPlatform() === "android";
    return true;
  } catch {
    return false;
  }
  return false;
}

/** Localized price string for a base plan, as returned by Google Play. */
export type ProductPrice = {
  /**
   * "monthly" / "annual" → Pro subscription base plans.
   * "lifetime" → one-time Lifetime product.
   * "starter_monthly" / "starter_annual" → Starter subscription SKUs.
   */
  plan: BillingPlan | "lifetime" | "starter_monthly" | "starter_annual";
  /** e.g. "RM 49.00", "$11.99", "₹999" — already formatted by the store. */
  formattedPrice: string;
  /** ISO 4217 currency code, e.g. "MYR", "USD". */
  currency: string;
};

export type BillingPriceFetchResult = {
  prices: ProductPrice[];
  fallback: boolean;
  stale: boolean;
  error?: string;
  attemptId: string;
  nativeAvailable: boolean;
  pluginAvailable: boolean;
};

// ---------------------------------------------------------------------------
// cordova-plugin-purchase integration
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = any;

let _initPromise: Promise<AnyStore | null> | null = null;
let _approvedHandlers: Array<(r: PurchaseReceipt) => void> = [];

const LEGACY_LIFETIME_PRICE_RE = /(?:^|\b)(?:RM|MYR)\s*1[\s,.]?499(?:[.,]00)?\b/i;

function createBillingAttemptId(scope: string): string {
  return `${scope}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function serializeBillingError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    return { code: e.code, message: e.message, details: e.details, raw: e };
  }
  return { message: String(error) };
}

function billingLog(level: "info" | "warn" | "error", message: string, data: Record<string, unknown> = {}) {
  const payload = { at: new Date().toISOString(), ...data };
  const logger = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  logger(`[billing] ${message}`, payload);
}

function isLegacyLifetimePrice(price?: string): boolean {
  return !!price && LEGACY_LIFETIME_PRICE_RE.test(price.replace(/\u00a0/g, " "));
}

function compactOfferSnapshot(offer: AnyStore) {
  return {
    id: offer?.id,
    basePlanId: offer?.basePlanId,
    offerToken: offer?.offerToken ? "present" : undefined,
    owned: !!offer?.owned,
    price: offer?.price,
    formattedPrice: offer?.formattedPrice,
    currency: offer?.currency ?? offer?.priceCurrencyCode,
    pricingPhases: (offer?.pricingPhases ?? []).slice(0, 3).map((phase: AnyStore) => ({
      price: phase?.price,
      formattedPrice: phase?.formattedPrice,
      currency: phase?.currency ?? phase?.priceCurrencyCode,
      billingPeriod: phase?.billingPeriod,
      recurrenceMode: phase?.recurrenceMode,
    })),
  };
}

function compactProductSnapshot(product: AnyStore) {
  if (!product) return null;
  return {
    id: product?.id,
    title: product?.title,
    type: product?.type,
    state: product?.state,
    owned: !!product?.owned,
    pricing: product?.pricing ? {
      price: product.pricing?.price,
      formattedPrice: product.pricing?.formattedPrice,
      currency: product.pricing?.currency ?? product.pricing?.priceCurrencyCode,
    } : undefined,
    offerCount: product?.offers?.length ?? 0,
    offers: (product?.offers ?? []).slice(0, 4).map(compactOfferSnapshot),
  };
}

function planFromText(value?: string | null): BillingPlan | undefined {
  if (!value) return undefined;
  if (value.includes(BASE_PLAN_IDS.annual)) return "annual";
  if (value.includes(BASE_PLAN_IDS.monthly)) return "monthly";
  return undefined;
}

function isoFromDate(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function receiptFromTransaction(transaction: AnyStore, fallbackPlan?: BillingPlan): PurchaseReceipt {
  const product = transaction?.products?.[0] ?? {};
  const basePlanId = planFromText(product.offerId) ?? fallbackPlan;
  return {
    productId: product.id ?? SUBSCRIPTION_ID,
    transactionId: transaction?.id ?? transaction?.transactionId ?? transaction?.purchaseId ?? "",
    purchaseToken: transaction?.purchaseToken,
    basePlanId,
    currentPeriodEnd: isoFromDate(transaction?.expirationDate),
  };
}

function inferOwnedPlan(product: AnyStore): BillingPlan | undefined {
  const txPlan = planFromText(product?.transaction?.products?.[0]?.offerId);
  if (txPlan) return txPlan;
  const ownedOffer = product?.offers?.find?.((offer: AnyStore) => offer?.owned);
  return planFromText(ownedOffer?.id ?? ownedOffer?.basePlanId);
}

function getStore(): AnyStore | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cdv = (window as any).CdvPurchase;
  return cdv?.store ?? null;
}

/**
 * Initialize the Play Billing connection. Safe to call many times — only the
 * first call actually registers products and connects to Google Play. Call
 * once at app start (AppShell) so prices are ready by the time the user
 * opens the Plans page.
 */
export function initBilling(): Promise<AnyStore | null> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const attemptId = createBillingAttemptId("init");
    const nativeAvailable = isNativeBillingAvailable();
    billingLog("info", "init start", { attemptId, nativeAvailable });
    if (!nativeAvailable) {
      billingLog("warn", "init skipped: native Android billing unavailable", { attemptId });
      _initPromise = null;
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cdv = (window as any).CdvPurchase;
    if (!cdv?.store) {
      billingLog("warn", "init skipped: CdvPurchase store missing", { attemptId, cdvKeys: cdv ? Object.keys(cdv) : [] });
      _initPromise = null;
      return null;
    }
    const store = cdv.store as AnyStore;
    try {
      billingLog("info", "registering products", {
        attemptId,
        products: [SUBSCRIPTION_ID, LIFETIME_PRODUCT_ID, STARTER_PRODUCT_IDS.monthly, STARTER_PRODUCT_IDS.annual],
      });
      store.register([
        {
          id: SUBSCRIPTION_ID,
          type: cdv.ProductType.PAID_SUBSCRIPTION,
          platform: cdv.Platform.GOOGLE_PLAY,
        },
        {
          id: LIFETIME_PRODUCT_ID,
          type: cdv.ProductType.NON_CONSUMABLE,
          platform: cdv.Platform.GOOGLE_PLAY,
        },
        {
          id: STARTER_PRODUCT_IDS.monthly,
          type: cdv.ProductType.PAID_SUBSCRIPTION,
          platform: cdv.Platform.GOOGLE_PLAY,
        },
        {
          id: STARTER_PRODUCT_IDS.annual,
          type: cdv.ProductType.PAID_SUBSCRIPTION,
          platform: cdv.Platform.GOOGLE_PLAY,
        },
      ]);

      // Approved → collect receipt → finish so Google marks the order
      // acknowledged. Listeners can react via onPurchaseApproved().
      store.when().approved((transaction: AnyStore) => {
        try {
          const receipt = receiptFromTransaction(transaction);
          for (const h of _approvedHandlers) { try { h(receipt); } catch {} }
          transaction.finish?.();
        } catch (e) { console.warn("approved handler failed", e); }
      });

      await store.initialize([cdv.Platform.GOOGLE_PLAY]);
      await store.update();
      billingLog("info", "init complete", { attemptId });
      return store;
    } catch (e) {
      billingLog("error", "init failed", { attemptId, error: serializeBillingError(e) });
      _initPromise = null;
      return null;
    }
  })();
  _initPromise = _initPromise.then(
    (store) => {
      if (!store) _initPromise = null;
      return store;
    },
    (error) => {
      _initPromise = null;
      throw error;
    },
  );
  return _initPromise;
}

/** Subscribe to "purchase approved" events globally. */
export function onPurchaseApproved(handler: (r: PurchaseReceipt) => void): () => void {
  _approvedHandlers.push(handler);
  return () => { _approvedHandlers = _approvedHandlers.filter((h) => h !== handler); };
}

/**
 * Ask Google Play for the user's locally-formatted prices. Falls back to MYR
 * defaults whenever the plugin isn't running (web preview, plugin missing,
 * or product not yet approved by Google).
 */
export async function queryProductDetailsSafe(): Promise<BillingPriceFetchResult> {
  const attemptId = createBillingAttemptId("prices");
  const nativeAvailable = isNativeBillingAvailable();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pluginAvailable = typeof window !== "undefined" && !!(window as any).CdvPurchase?.store;
  billingLog("info", "price fetch start", { attemptId, nativeAvailable, pluginAvailable });
  const store = await initBilling();
  if (!store) {
    const reason = nativeAvailable ? "STORE_UNAVAILABLE" : "NOT_ANDROID";
    billingLog("warn", "price fetch fallback: store unavailable", { attemptId, reason, nativeAvailable, pluginAvailable });
    return { prices: fallbackPrices(), fallback: true, stale: false, error: reason, attemptId, nativeAvailable, pluginAvailable };
  }
  try {
    // Force a fresh fetch from Google Play so we always reflect the latest
    // Play Console prices (not a stale plugin cache). Safe to call often.
    try {
      await store.update();
      billingLog("info", "store.update complete", { attemptId });
    } catch (updateError) {
      billingLog("warn", "store.update failed, reading current store cache", { attemptId, error: serializeBillingError(updateError) });
    }

    // Pull a localized price string from whichever shape the plugin exposes
    // for a given product type. Subscriptions usually expose
    // `offers[].pricingPhases[].price`, while one-time/non-consumable
    // products in cordova-plugin-purchase v13 sometimes expose
    // `pricing.price` directly on the product, or `offers[0].pricingPhases`
    // with a single phase. We try all of them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const readPrice = (product: any, offer?: any): { price?: string; currency?: string } => {
      const phase = offer?.pricingPhases?.[0];
      if (phase?.price) return { price: phase.price, currency: phase.currency };
      if (phase?.formattedPrice) return { price: phase.formattedPrice, currency: phase.priceCurrencyCode ?? phase.currency };
      if (offer?.price) return { price: offer.price, currency: offer.currency };
      if (offer?.formattedPrice) return { price: offer.formattedPrice, currency: offer.priceCurrencyCode };
      const p = product?.pricing;
      if (p?.price) return { price: p.price, currency: p.currency };
      if (p?.formattedPrice) return { price: p.formattedPrice, currency: p.priceCurrencyCode ?? p.currency };
      if (product?.price) return { price: product.price, currency: product.currency };
      if (product?.formattedPrice) return { price: product.formattedPrice, currency: product.priceCurrencyCode };
      return {};
    };

    const product = store.get(SUBSCRIPTION_ID);
    billingLog("info", "product snapshots after update", {
      attemptId,
      pro: compactProductSnapshot(product),
      lifetime: compactProductSnapshot(store.get(LIFETIME_PRODUCT_ID)),
      starterMonthly: compactProductSnapshot(store.get(STARTER_PRODUCT_IDS.monthly)),
      starterAnnual: compactProductSnapshot(store.get(STARTER_PRODUCT_IDS.annual)),
    });
    const out: ProductPrice[] = [];
    let stale = false;
    for (const offer of product?.offers ?? []) {
      // Match the Play Console base plan id to our local BillingPlan key.
      const offerId: string | undefined = offer.id || offer.basePlanId;
      let plan: BillingPlan | null = null;
      if (offerId?.includes(BASE_PLAN_IDS.monthly)) plan = "monthly";
      else if (offerId?.includes(BASE_PLAN_IDS.annual)) plan = "annual";
      if (!plan) continue;
      const { price, currency } = readPrice(product, offer);
      if (!price) {
        billingLog("warn", "missing pro offer price", { attemptId, offer: compactOfferSnapshot(offer) });
        continue;
      }
      out.push({
        plan,
        formattedPrice: price,
        currency: currency ?? "MYR",
      });
    }
    // Lifetime one-time product price.
    try {
      const lifetime = store.get(LIFETIME_PRODUCT_ID);
      const lifetimeOffer = lifetime?.offers?.[0];
      const { price, currency } = readPrice(lifetime, lifetimeOffer);
      if (price) {
        if (isLegacyLifetimePrice(price)) {
          stale = true;
          billingLog("warn", "Google Play returned legacy lifetime price; keeping loading state instead of showing stale 1499", {
            attemptId,
            productId: LIFETIME_PRODUCT_ID,
            price,
            product: compactProductSnapshot(lifetime),
          });
        } else {
          out.push({
            plan: "lifetime",
            formattedPrice: price,
            currency: currency ?? "MYR",
          });
        }
      }
    } catch {}
    // Backfill any missing plan with the fallback so the UI never shows blank.
    for (const p of Object.keys(BASE_PLAN_IDS) as BillingPlan[]) {
      if (!out.find((x) => x.plan === p)) {
        out.push({ plan: p, formattedPrice: FALLBACK_PRICES[p], currency: "MYR" });
      }
    }
    if (!out.find((x) => x.plan === "lifetime")) {
      out.push({ plan: "lifetime", formattedPrice: LIFETIME_FALLBACK_PRICE, currency: "MYR" });
    }
    // Starter subscription SKUs (separate products, one base plan each).
    for (const billing of ["monthly", "annual"] as BillingPlan[]) {
      const key = (billing === "monthly" ? "starter_monthly" : "starter_annual") as
        | "starter_monthly"
        | "starter_annual";
      try {
        const starter = store.get(STARTER_PRODUCT_IDS[billing]);
        const starterOffer = starter?.offers?.[0];
        const { price, currency } = readPrice(starter, starterOffer);
        if (price) {
          out.push({
            plan: key,
            formattedPrice: price,
            currency: currency ?? "MYR",
          });
          continue;
        }
      } catch {}
      out.push({ plan: key, formattedPrice: STARTER_FALLBACK_PRICES[billing], currency: "MYR" });
    }
    const hasRealPrice = out.some((p) => p.formattedPrice && p.formattedPrice !== "—");
    const isFallback = !hasRealPrice;
    billingLog(isFallback || stale ? "warn" : "info", "price fetch complete", { attemptId, fallback: isFallback, stale, prices: out });
    return { prices: out, fallback: isFallback, stale, error: stale ? "STALE_LEGACY_PRICE" : undefined, attemptId, nativeAvailable, pluginAvailable };
  } catch (e) {
    billingLog("error", "price fetch failed", { attemptId, error: serializeBillingError(e) });
    return { prices: fallbackPrices(), fallback: true, stale: false, error: "PRICE_FETCH_FAILED", attemptId, nativeAvailable, pluginAvailable };
  }
}

export async function queryProductDetails(): Promise<ProductPrice[]> {
  const result = await queryProductDetailsSafe();
  return result.prices;
}

function fallbackPrices(): ProductPrice[] {
  const subs = (Object.keys(BASE_PLAN_IDS) as BillingPlan[]).map((plan) => ({
    plan,
    formattedPrice: FALLBACK_PRICES[plan],
    currency: "MYR",
  } as ProductPrice));
  subs.push({ plan: "lifetime", formattedPrice: LIFETIME_FALLBACK_PRICE, currency: "MYR" });
  subs.push({ plan: "starter_monthly", formattedPrice: STARTER_FALLBACK_PRICES.monthly, currency: "MYR" });
  subs.push({ plan: "starter_annual", formattedPrice: STARTER_FALLBACK_PRICES.annual, currency: "MYR" });
  return subs;
}

async function tryNativePurchase(_subscriptionId: string, basePlanId: string): Promise<PurchaseReceipt> {
  const store = await initBilling();
  if (!store) {
    throw { code: "item_unavailable", message: "Google Play Billing not available" } as BillingError;
  }
  const product = store.get(_subscriptionId);
  if (!product) {
    throw { code: "item_unavailable", message: "Subscription not yet approved by Google Play" } as BillingError;
  }
  // Pick the offer whose id matches the requested base plan.
  const offer =
    product.offers?.find((o: AnyStore) => (o.id || o.basePlanId)?.includes(basePlanId)) ??
    product.offers?.[0];
  if (!offer) {
    throw { code: "item_unavailable", message: "Base plan not configured" } as BillingError;
  }
  return await new Promise<PurchaseReceipt>((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      unsub();
      fn();
    };
    const unsub = onPurchaseApproved((r) => done(() => resolve(r)));
    // Safety timeout — if Google Play accepts the order but the `approved`
    // event never fires (cached purchase, slow propagation, plugin quirk),
    // re-check ownership after 45s and resolve/reject based on real state.
    // Prevents the Plans button from being stuck on "..." forever.
    timeoutId = setTimeout(async () => {
      try {
        await store.update?.();
        const fresh = store.get(_subscriptionId);
        const owned: boolean = !!(fresh?.owned || fresh?.offers?.some?.((o: AnyStore) => o?.owned));
        if (owned) {
          const tx = fresh.transaction ?? {};
          done(() => resolve(receiptFromTransaction(tx, planFromText(basePlanId))));
          return;
        }
      } catch {}
      done(() => reject({ code: "unknown", message: "Purchase timed out" } as BillingError));
    }, 45000);
    try {
      const orderResult = offer.order ? offer.order() : store.order(offer);
      Promise.resolve(orderResult).then((err: AnyStore) => {
        if (!err) return;
        const code: string | undefined = err?.code;
        if (code === "PaymentCancelled" || code === "PAYMENT_CANCELLED" || /cancel/i.test(err?.message ?? "")) {
          done(() => reject({ code: "user_cancelled", message: "Cancelled" } as BillingError));
        } else {
          done(() => reject({ code: "unknown", message: err?.message ?? "Purchase failed" } as BillingError));
        }
      }).catch((err: AnyStore) => {
        const code: string | undefined = err?.code;
        if (code === "PaymentCancelled" || code === "PAYMENT_CANCELLED" || /cancel/i.test(err?.message ?? "")) {
          done(() => reject({ code: "user_cancelled", message: "Cancelled" } as BillingError));
        } else {
          done(() => reject({ code: "unknown", message: err?.message ?? "Purchase failed" } as BillingError));
        }
      });
    } catch (err) {
      done(() => reject({ code: "unknown", message: (err as Error)?.message ?? "Purchase failed" } as BillingError));
    }
  });
}

async function tryNativeRestore(): Promise<PurchaseReceipt[]> {
  const store = await initBilling();
  if (!store) return [];
  try {
    await store.restorePurchases();
    const out: PurchaseReceipt[] = [];
    const sub = store.get(SUBSCRIPTION_ID);
    if (sub?.owned || sub?.offers?.some?.((o: AnyStore) => o?.owned)) {
      out.push({
        productId: SUBSCRIPTION_ID,
        transactionId: sub.transaction?.id ?? "",
        purchaseToken: sub.transaction?.purchaseToken,
        basePlanId: inferOwnedPlan(sub),
        currentPeriodEnd: isoFromDate(sub.transaction?.expirationDate),
      });
    }
    const lifetime = store.get(LIFETIME_PRODUCT_ID);
    if (lifetime?.owned) {
      out.push({
        productId: LIFETIME_PRODUCT_ID,
        transactionId: lifetime.transaction?.id ?? "",
        purchaseToken: lifetime.transaction?.purchaseToken,
      });
    }
    for (const billing of ["monthly", "annual"] as BillingPlan[]) {
      const id = STARTER_PRODUCT_IDS[billing];
      const s = store.get(id);
      if (s?.owned || s?.offers?.some?.((o: AnyStore) => o?.owned)) {
        out.push({
          productId: id,
          transactionId: s.transaction?.id ?? "",
          purchaseToken: s.transaction?.purchaseToken,
          basePlanId: billing,
          currentPeriodEnd: isoFromDate(s.transaction?.expirationDate),
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Re-query Google Play for the user's owned subscriptions WITHOUT prompting
 * the user. Safe to call on app launch, on app resume, and after a purchase
 * attempt (whether it succeeded or was cancelled). Returns the active
 * subscription receipt or `null` if the user does not currently own Pro.
 */
export async function verifyActiveSubscription(): Promise<PurchaseReceipt | null> {
  if (!isNativeBillingAvailable()) return null;
  const store = await initBilling();
  if (!store) return null;
  try {
    // Pull fresh owned-product state from Google Play.
    try { await store.restorePurchases(); } catch {}
    try { await store.update(); } catch {}
    const product = store.get(SUBSCRIPTION_ID);
    if (!product) return null;
    // Plugin exposes either `.owned` (boolean) or per-offer ownership.
    const owned: boolean = !!(product.owned || product.offers?.some?.((o: AnyStore) => o?.owned));
    if (!owned) return null;
    const tx = product.transaction ?? {};
    return {
      productId: SUBSCRIPTION_ID,
      transactionId: tx.id ?? tx.transactionId ?? "",
      purchaseToken: tx.purchaseToken,
      basePlanId: inferOwnedPlan(product),
      currentPeriodEnd: isoFromDate(tx.expirationDate),
    };
  } catch {
    return null;
  }
}

/**
 * Check whether the user owns the one-time Lifetime product. Safe to call
 * silently on app launch / resume.
 */
export async function verifyLifetimeOwnership(): Promise<PurchaseReceipt | null> {
  if (!isNativeBillingAvailable()) return null;
  const store = await initBilling();
  if (!store) return null;
  try {
    try { await store.restorePurchases(); } catch {}
    try { await store.update(); } catch {}
    const product = store.get(LIFETIME_PRODUCT_ID);
    if (!product?.owned) return null;
    const tx = product.transaction ?? {};
    return {
      productId: LIFETIME_PRODUCT_ID,
      transactionId: tx.id ?? tx.transactionId ?? "",
      purchaseToken: tx.purchaseToken,
    };
  } catch {
    return null;
  }
}

/**
 * Check whether the user owns either Starter subscription (monthly or annual).
 */
export async function verifyActiveStarter(): Promise<PurchaseReceipt | null> {
  if (!isNativeBillingAvailable()) return null;
  const store = await initBilling();
  if (!store) return null;
  try {
    try { await store.restorePurchases(); } catch {}
    try { await store.update(); } catch {}
    for (const billing of ["annual", "monthly"] as BillingPlan[]) {
      const id = STARTER_PRODUCT_IDS[billing];
      const product = store.get(id);
      if (!product) continue;
      const owned: boolean = !!(product.owned || product.offers?.some?.((o: AnyStore) => o?.owned));
      if (!owned) continue;
      const tx = product.transaction ?? {};
      return {
        productId: id,
        transactionId: tx.id ?? tx.transactionId ?? "",
        purchaseToken: tx.purchaseToken,
        basePlanId: billing,
        currentPeriodEnd: isoFromDate(tx.expirationDate),
      };
    }
    return null;
  } catch {
    return null;
  }
}

// --- Public API ------------------------------------------------------------

export async function purchasePlan(
  plan: BillingPlan,
  onSuccess: (receipt: PurchaseReceipt) => Promise<void> | void,
  onError: (err: BillingError) => void,
): Promise<void> {
  if (!isNativeBillingAvailable()) {
    onError({ code: "not_android", message: "Not running inside Android app" });
    return;
  }
  const basePlanId = BASE_PLAN_IDS[plan];
  try {
    const receipt = await tryNativePurchase(SUBSCRIPTION_ID, basePlanId);
    await onSuccess(receipt);
  } catch (e) {
    const err = e as Partial<BillingError> | undefined;
    const code: BillingErrorCode = err?.code ?? "unknown";
    onError({ code, message: err?.message ?? "Purchase failed" });
  }
}

/**
 * Purchase a Starter Plan subscription. Each Starter billing cycle is a
 * SEPARATE Google Play product (unlike Pro, which uses base plans), so we
 * order the matching SKU directly.
 */
export async function purchaseStarter(
  billing: BillingPlan,
  onSuccess: (receipt: PurchaseReceipt) => Promise<void> | void,
  onError: (err: BillingError) => void,
): Promise<void> {
  if (!isNativeBillingAvailable()) {
    onError({ code: "not_android", message: "Not running inside Android app" });
    return;
  }
  const productId = STARTER_PRODUCT_IDS[billing];
  try {
    const receipt = await tryNativePurchase(productId, "");
    // Tag with billing cycle so the caller can persist it as plan_billing_cycle.
    await onSuccess({ ...receipt, productId, basePlanId: billing });
  } catch (e) {
    const err = e as Partial<BillingError> | undefined;
    onError({ code: err?.code ?? "unknown", message: err?.message ?? "Purchase failed" });
  }
}

/**
 * Purchase the one-time Lifetime (non-consumable) product. Mirrors
 * `purchasePlan` for subscriptions but targets the lifetime SKU.
 */
export async function purchaseLifetime(
  onSuccess: (receipt: PurchaseReceipt) => Promise<void> | void,
  onError: (err: BillingError) => void,
): Promise<void> {
  if (!isNativeBillingAvailable()) {
    onError({ code: "not_android", message: "Not running inside Android app" });
    return;
  }
  const store = await initBilling();
  if (!store) {
    onError({ code: "item_unavailable", message: "Google Play Billing not available" });
    return;
  }
  const product = store.get(LIFETIME_PRODUCT_ID);
  if (!product) {
    onError({ code: "item_unavailable", message: "Lifetime product not yet approved by Google Play" });
    return;
  }
  const offer = product.offers?.[0];
  if (!offer) {
    onError({ code: "item_unavailable", message: "Lifetime offer not configured" });
    return;
  }
  try {
    const receipt = await new Promise<PurchaseReceipt>((resolve, reject) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        unsub();
        fn();
      };
      const unsub = onPurchaseApproved((r) => {
        if (r.productId === LIFETIME_PRODUCT_ID) done(() => resolve(r));
      });
      timeoutId = setTimeout(async () => {
        try {
          await store.update?.();
          const fresh = store.get(LIFETIME_PRODUCT_ID);
          if (fresh?.owned) {
            const tx = fresh.transaction ?? {};
            done(() => resolve({
              productId: LIFETIME_PRODUCT_ID,
              transactionId: tx.id ?? tx.transactionId ?? "",
              purchaseToken: tx.purchaseToken,
            }));
            return;
          }
        } catch {}
        done(() => reject({ code: "unknown", message: "Purchase timed out" } as BillingError));
      }, 45000);
      try {
        const orderResult = offer.order ? offer.order() : store.order(offer);
        Promise.resolve(orderResult).then((err: AnyStore) => {
          if (!err) return;
          const code: string | undefined = err?.code;
          if (code === "PaymentCancelled" || code === "PAYMENT_CANCELLED" || /cancel/i.test(err?.message ?? "")) {
            done(() => reject({ code: "user_cancelled", message: "Cancelled" } as BillingError));
          } else {
            done(() => reject({ code: "unknown", message: err?.message ?? "Purchase failed" } as BillingError));
          }
        }).catch((err: AnyStore) => {
          const code: string | undefined = err?.code;
          if (code === "PaymentCancelled" || code === "PAYMENT_CANCELLED" || /cancel/i.test(err?.message ?? "")) {
            done(() => reject({ code: "user_cancelled", message: "Cancelled" } as BillingError));
          } else {
            done(() => reject({ code: "unknown", message: err?.message ?? "Purchase failed" } as BillingError));
          }
        });
      } catch (err) {
        done(() => reject({ code: "unknown", message: (err as Error)?.message ?? "Purchase failed" } as BillingError));
      }
    });
    await onSuccess(receipt);
  } catch (e) {
    const err = e as Partial<BillingError> | undefined;
    onError({ code: err?.code ?? "unknown", message: err?.message ?? "Purchase failed" });
  }
}

export async function restorePurchases(
  onRestored: (receipts: PurchaseReceipt[]) => Promise<void> | void,
  onError: (err: BillingError) => void,
): Promise<void> {
  if (!isNativeBillingAvailable()) {
    onError({ code: "not_android", message: "Not running inside Android app" });
    return;
  }
  try {
    const receipts = await tryNativeRestore();
    await onRestored(receipts);
  } catch (e) {
    const err = e as Partial<BillingError> | undefined;
    onError({ code: err?.code ?? "unknown", message: err?.message ?? "Restore failed" });
  }
}