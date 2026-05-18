import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Check, X, Sparkles, Crown, Rocket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useSubscription, FREE_LIMITS } from "@/contexts/SubscriptionContext";
import { notifySituation } from "@/lib/autoNotify";
import {
  isNativeBillingAvailable,
  purchasePlan,
  purchaseLifetime,
  purchaseStarter,
  restorePurchases,
  queryProductDetailsSafe,
  FALLBACK_PRICES,
  LIFETIME_FALLBACK_PRICE,
  LIFETIME_PRODUCT_ID,
  SUBSCRIPTION_ID,
  BASE_PLAN_IDS,
  STARTER_PRODUCT_IDS,
  STARTER_FALLBACK_PRICES,
  type BillingError,
} from "@/lib/billing";

export const Route = createFileRoute("/plans")({ component: PlansPage });

function PlansPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isPro, isStarter, isLifetime, plan, ordersUsed, sub, refresh, syncFromStore, activeBillingPlan } = useSubscription();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [submittingPlan, setSubmittingPlan] = useState<"pro" | "lifetime" | "starter" | null>(null);
  const [storePrices, setStorePrices] = useState<Record<"monthly" | "annual" | "lifetime" | "starter_monthly" | "starter_annual", string>>({
    monthly: FALLBACK_PRICES.monthly,
    annual: FALLBACK_PRICES.annual,
    lifetime: LIFETIME_FALLBACK_PRICE,
    starter_monthly: STARTER_FALLBACK_PRICES.monthly,
    starter_annual: STARTER_FALLBACK_PRICES.annual,
  });
  // Loading state for the Google Play price sync. `true` while a fetch is
  // in flight; flips to `false` once we get a real (non-placeholder) price
  // back. Drives the "Fetching price…" hint and the Retry button.
  const [pricesLoading, setPricesLoading] = useState(true);
  const [priceRetryTick, setPriceRetryTick] = useState(0);

  // Pull each user's locally-formatted price from Google Play (MYR / USD /
  // INR / IDR / etc.) so the UI matches what the store will charge.
  const loadPrices = (): Promise<void> => {
    setPricesLoading(true);
    return queryProductDetailsSafe()
      .then((result) => {
        console.info("[billing] plans price result", result);
        setStorePrices((prev) => {
          const next = { ...prev };
          for (const p of result.prices) next[p.plan] = p.formattedPrice;
          return next;
        });
        // We consider prices "loaded" only if at least one is a real
        // store-formatted price (not the "—" placeholder).
        const hasReal = result.prices.some((p) => p.formattedPrice && p.formattedPrice !== "—");
        const hasMissing = result.prices.some((p) => !p.formattedPrice || p.formattedPrice === "—");
        if (hasReal && !result.stale) setPricesLoading(false);
        if (result.nativeAvailable && (result.fallback || result.stale || !hasReal || hasMissing)) setPriceRetryTick((n) => n + 1);
      })
      .catch((error) => {
        console.error("[billing] plans price fetch failed", error);
        if (isNativeBillingAvailable()) setPriceRetryTick((n) => n + 1);
      });
  };

  useEffect(() => {
    let cancelled = false;
    const load = () => { if (!cancelled) void loadPrices(); };
    // Fetch immediately, then again after the store has had time to finish
    // its first sync with Google Play (cold start can take a few seconds
    // before localized prices are available).
    load();
    const t1 = setTimeout(load, 1500);
    const t2 = setTimeout(load, 4000);
    // Stop the spinner after a reasonable window even if nothing came back
    // (e.g. running on web preview / plugin missing) so the Retry button
    // becomes available instead of spinning forever.
    const tStop = setTimeout(() => { if (!cancelled) setPricesLoading(false); }, 6000);
    // Also refresh when the user brings the app back to the foreground —
    // catches the case where they changed the price in Play Console
    // moments earlier.
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(tStop);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const price = storePrices[billing];
  const lifetimePrice = storePrices.lifetime;
  const starterPrice = billing === "monthly" ? storePrices.starter_monthly : storePrices.starter_annual;
  const period = billing === "monthly" ? t("per_month") : t("per_year");
  // True when a given displayed price is still the "—" placeholder (i.e.
  // Google Play hasn't returned a real formatted price yet).
  const isPlaceholder = (p: string) => !p || p === "—";
  useEffect(() => {
    if (!priceRetryTick || !isNativeBillingAvailable()) return;
    const needsPrice = Object.values(storePrices).some((p) => isPlaceholder(p));
    if (!needsPrice) return;
    const delay = Math.min(30000, 2500 * priceRetryTick);
    const retry = setTimeout(() => void loadPrices(), delay);
    return () => clearTimeout(retry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceRetryTick, storePrices]);
  const fetchingLabel = t("fetching_price");
  // Renders price text OR an inline loading pill, so users never see a bare
  // "—" without explanation.
  const renderPrice = (p: string, className: string) =>
    isPlaceholder(p) ? (
      <span className={`${className} inline-flex items-center gap-1.5 text-muted-foreground`}>
        <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />
        <span className="text-sm font-medium">{fetchingLabel}</span>
      </span>
    ) : (
      <span className={className}>{p}</span>
    );
  // Button label that swaps the "— price" tail for the loading hint when
  // the price isn't ready, so CTAs don't read "Upgrade to Pro — —".
  const buttonPriceTail = (p: string) => (isPlaceholder(p) ? ` — ${fetchingLabel}` : ` — ${p}`);

  const freeRows: { ok: boolean; label: string }[] = [
    { ok: true, label: t("free_orders_per_month") },
    { ok: true, label: t("free_inventory_count") },
    { ok: true, label: t("todays_revenue") + " · " + t("recent_orders") },
    { ok: true, label: "WhatsApp " + t("order_template") },
    { ok: false, label: t("sales_reports") },
    { ok: false, label: t("export_pdf") },
    { ok: false, label: t("remind_all_unpaid") },
    { ok: false, label: t("wa_template") },
  ];

  const proRows = [
    t("unlimited_orders_feat"),
    t("unlimited_inventory_feat"),
    t("full_reports_feat"),
    t("export_pdf"),
    t("wa_template"),
    t("remind_all_unpaid"),
    t("priority_support_feat"),
  ];

  const handleGooglePlayPurchase = async () => {
    if (!user) return;
    if (!isNativeBillingAvailable()) {
      toast.message(t("google_play_only_android"));
      return;
    }
    setSubmittingPlan("pro");
    try {
      await purchasePlan(
        billing,
        async (receipt) => {
          console.log("[billing] Purchase approved, receipt:", JSON.stringify(receipt));
          const expiresAt = new Date();
          if (billing === "monthly") expiresAt.setMonth(expiresAt.getMonth() + 1);
          else expiresAt.setFullYear(expiresAt.getFullYear() + 1);
          const { data: upserted, error: upsertError } = await supabase.from("subscriptions").upsert({
            user_id: user.id,
            plan: "pro",
            status: "active",
            provider: "google_play",
            provider_product_id: `${receipt.productId || SUBSCRIPTION_ID}:${receipt.basePlanId ?? BASE_PLAN_IDS[billing]}`,
            provider_transaction_id: receipt.transactionId,
            provider_purchase_token: receipt.purchaseToken ?? null,
            current_period_end: receipt.currentPeriodEnd ?? expiresAt.toISOString(),
          }, { onConflict: "user_id" }).select("*").maybeSingle();
          console.log("[billing] Upsert result:", { upserted, upsertError });
          if (upsertError) {
            console.error("[billing] Failed to persist Pro plan:", upsertError);
            toast.error(`${t("billing_unknown_error")}: ${upsertError.message}`);
            return;
          }
          // Pull the freshly written row so isPro flips before we toast.
          await refresh();
          toast.success(t("welcome_to_pro"));
          notifySituation({
            kind: "milestone",
            title: "Welcome to Pro ✦",
            body: "Your Bossify Pro is active now.",
            link: "/plans",
            prefKey: "notif_milestone",
            dedupeKey: `pro_${receipt.transactionId || receipt.purchaseToken || billing}`,
          }).catch(() => {});
          console.log("[billing] Plan upgrade complete");
        },
        (err: BillingError) => {
          if (err.code === "item_unavailable") toast.message(t("billing_item_unavailable"));
          else if (err.code === "user_cancelled") toast.message(t("billing_user_cancelled"));
          else if (err.code === "not_android") toast.message(t("google_play_only_android"));
          else toast.error(t("billing_unknown_error"));
        },
      );
    } finally {
      // Always reconcile with Play and reset the button — whether the user
      // completed, cancelled, or hit an error. This prevents the UI from
      // getting stuck on "..." after a cancelled purchase.
      try { await syncFromStore(); } catch {}
      try { await refresh(); } catch {}
      setSubmittingPlan(null);
    }
  };

  const handleLifetimePurchase = async () => {
    if (!user) return;
    if (!isNativeBillingAvailable()) {
      toast.message(t("google_play_only_android"));
      return;
    }
    setSubmittingPlan("lifetime");
    try {
      await purchaseLifetime(
        async (receipt) => {
          const { error: upsertError } = await supabase.from("subscriptions").upsert({
            user_id: user.id,
            plan: "lifetime",
            status: "active",
            provider: "google_play",
            provider_product_id: LIFETIME_PRODUCT_ID,
            provider_transaction_id: receipt.transactionId,
            provider_purchase_token: receipt.purchaseToken ?? null,
            lifetime_purchase_date: new Date().toISOString(),
            lifetime_google_token: receipt.purchaseToken ?? null,
            current_period_end: null,
          }, { onConflict: "user_id" });
          if (upsertError) {
            console.error("[billing] Failed to persist Lifetime plan:", upsertError);
            toast.error(`${t("billing_unknown_error")}: ${upsertError.message}`);
            return;
          }
          await refresh();
          toast.success(t("welcome_to_lifetime"));
          notifySituation({
            kind: "milestone",
            title: t("welcome_to_lifetime"),
            body: t("never_pay_again"),
            link: "/plans",
            prefKey: "notif_milestone",
            dedupeKey: `lifetime_${receipt.transactionId || receipt.purchaseToken || "owned"}`,
          }).catch(() => {});
        },
        (err: BillingError) => {
          if (err.code === "item_unavailable") toast.message(t("billing_item_unavailable"));
          else if (err.code === "user_cancelled") toast.message(t("billing_user_cancelled"));
          else if (err.code === "not_android") toast.message(t("google_play_only_android"));
          else toast.error(t("billing_unknown_error"));
        },
      );
    } finally {
      try { await syncFromStore(); } catch {}
      try { await refresh(); } catch {}
      setSubmittingPlan(null);
    }
  };

  const handleStarterPurchase = async () => {
    if (!user) return;
    if (!isNativeBillingAvailable()) {
      toast.message(t("google_play_only_android"));
      return;
    }
    setSubmittingPlan("starter");
    try {
      await purchaseStarter(
        billing,
        async (receipt) => {
          const expiresAt = new Date();
          if (billing === "monthly") expiresAt.setMonth(expiresAt.getMonth() + 1);
          else expiresAt.setFullYear(expiresAt.getFullYear() + 1);
          const { error: upsertError } = await supabase.from("subscriptions").upsert({
            user_id: user.id,
            plan: "starter",
            status: "active",
            provider: "google_play",
            provider_product_id: `${receipt.productId}:${billing}`,
            provider_transaction_id: receipt.transactionId,
            provider_purchase_token: receipt.purchaseToken ?? null,
            current_period_end: receipt.currentPeriodEnd ?? expiresAt.toISOString(),
          }, { onConflict: "user_id" });
          if (upsertError) {
            console.error("[billing] Failed to persist Starter plan:", upsertError);
            toast.error(`${t("billing_unknown_error")}: ${upsertError.message}`);
            return;
          }
          await refresh();
          toast.success(t("welcome_to_starter"));
          notifySituation({
            kind: "milestone",
            title: t("welcome_to_starter"),
            body: t("starter_plan"),
            link: "/plans",
            prefKey: "notif_milestone",
            dedupeKey: `starter_${receipt.transactionId || receipt.purchaseToken || billing}`,
          }).catch(() => {});
        },
        (err: BillingError) => {
          if (err.code === "item_unavailable") toast.message(t("billing_item_unavailable"));
          else if (err.code === "user_cancelled") toast.message(t("billing_user_cancelled"));
          else if (err.code === "not_android") toast.message(t("google_play_only_android"));
          else toast.error(t("billing_unknown_error"));
        },
      );
    } finally {
      try { await syncFromStore(); } catch {}
      try { await refresh(); } catch {}
      setSubmittingPlan(null);
    }
  };

  return (
    <div className="px-5 pt-10 pb-10 space-y-5">
      <header className="flex items-center gap-2">
        <Link to="/profile" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("choose_plan")}</h1>
          <p className="text-xs text-muted-foreground">{t("choose_plan_sub")}</p>
        </div>
      </header>

      {/* Current plan banner */}
      <div className={`rounded-2xl p-4 border ${isLifetime ? "bg-gradient-to-br from-amber-200/40 to-yellow-100/30 border-amber-400/60" : isPro ? "bg-gradient-to-br from-primary/15 to-primary/5 border-primary/40" : "bg-card border-border/60"}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase font-semibold text-muted-foreground">{t("current_plan")}</p>
            <p className="text-lg font-bold mt-0.5 flex items-center gap-2">
              {isLifetime ? (<>{t("plan_badge_lifetime")} <Crown className="h-4 w-4 text-amber-500" /></>)
                : isPro ? (<>{t("pro_plan")} <Sparkles className="h-4 w-4 text-primary" /></>)
                : isStarter ? (<>{t("starter_plan")} <Rocket className="h-4 w-4 text-sky-500" /></>)
                : t("free_plan")}
            </p>
          </div>
          {isLifetime ? (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">{t("active_badge")}</span>
          ) : isPro ? (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">{t("active_badge")}</span>
          ) : isStarter ? (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-sky-100 text-sky-700">{t("active_badge")}</span>
          ) : (
            <div className="text-right">
              <p className="text-sm font-bold text-foreground">{ordersUsed} / {FREE_LIMITS.ordersPerMonth}</p>
              <p className="text-[10px] text-muted-foreground">{t("free_limit")}</p>
            </div>
          )}
        </div>
        {sub?.status === "pending" && (
          <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">{t("payment_pending")}</p>
        )}
      </div>

      {/* Billing toggle */}
      <div className="flex p-1 bg-muted rounded-2xl">
        {(["monthly", "annual"] as const).map((b) => (
          <button key={b} onClick={() => setBilling(b)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${billing === b ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
            {b === "monthly" ? t("monthly") : <>{t("annual")} <span className="text-[10px] text-emerald-600 font-bold ml-1">{t("save_30")}</span></>}
          </button>
        ))}
      </div>

      {/* Price sync banner — only shown while we still don't have any real
          formatted price from Google Play. Gives the user clear feedback
          (instead of a bare "—") and a manual Retry button. */}
      {(isPlaceholder(price) || isPlaceholder(lifetimePrice) || isPlaceholder(starterPrice)) && (
        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/40 px-3 py-2.5 text-xs">
          {pricesLoading ? (
            <span className="h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" aria-hidden />
          ) : (
            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" aria-hidden />
          )}
          <span className="flex-1 text-muted-foreground">{t("fetching_price_hint")}</span>
          <button
            type="button"
            onClick={() => void loadPrices()}
            disabled={pricesLoading}
            className="font-semibold text-primary disabled:opacity-50"
          >
            {t("retry_price")}
          </button>
        </div>
      )}

      {/* Free card */}
      <section className="rounded-3xl bg-card border border-border/60 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">{t("free_plan")}</h2>
          <p className="text-xl font-bold">{`RM 0`}<span className="text-xs text-muted-foreground font-normal"> {t("per_month")}</span></p>
        </div>
        <ul className="mt-4 space-y-2">
          {freeRows.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              {r.ok ? <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /> : <X className="h-4 w-4 text-muted-foreground/60 shrink-0 mt-0.5" />}
              <span className={r.ok ? "text-foreground" : "text-muted-foreground line-through"}>{r.label}</span>
            </li>
          ))}
        </ul>
        {plan === "free" && (
          <button disabled className="mt-5 w-full py-3 rounded-2xl bg-muted text-muted-foreground font-semibold text-sm">
            {t("current_plan")}
          </button>
        )}
      </section>

      {/* Starter card */}
      <section className="relative rounded-3xl p-[2px] bg-gradient-to-br from-sky-400 via-teal-400 to-cyan-500">
        <div className="rounded-[calc(1.5rem-2px)] bg-card p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold flex items-center gap-1">{t("starter_plan")} <Rocket className="h-4 w-4 text-sky-500" /></h2>
            <p className="text-xl font-bold text-sky-600">
              {renderPrice(starterPrice, "text-sky-600")}
              {!isPlaceholder(starterPrice) && (
                <span className="text-xs text-muted-foreground font-normal"> {period}</span>
              )}
            </p>
          </div>
          <ul className="mt-4 space-y-2">
            {[
              t("starter_orders_per_month"),
              t("starter_products_count"),
              t("basic_sales_reports"),
              "WhatsApp " + t("order_template"),
            ].map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" />
                <span className="text-foreground">{r}</span>
              </li>
            ))}
          </ul>
          {isLifetime || isPro ? (
            <button disabled className="mt-5 w-full py-3 rounded-2xl bg-muted text-muted-foreground font-semibold text-sm">
              {isLifetime ? `${t("plan_badge_lifetime")} ✓` : `${t("pro_plan")} ✓`}
            </button>
          ) : isStarter && activeBillingPlan === billing ? (
            <button disabled className="mt-5 w-full py-3 rounded-2xl bg-sky-100 text-sky-700 font-semibold text-sm">
              {t("current_plan")} ✓
            </button>
          ) : (
            <button
              onClick={handleStarterPurchase}
              disabled={submittingPlan !== null || isPlaceholder(starterPrice)}
              className="mt-5 w-full py-3 rounded-2xl bg-gradient-to-r from-sky-500 to-teal-500 text-white font-bold text-sm shadow-[var(--shadow-soft)] active:scale-[0.99] transition disabled:opacity-60"
            >
              {submittingPlan === "starter" ? "..." : `${t("start_starter_plan")}${buttonPriceTail(starterPrice)}`}
            </button>
          )}
        </div>
      </section>

      {/* Pro card */}
      <section className="relative rounded-3xl p-[2px] bg-gradient-to-br from-primary via-primary/70 to-primary/40">
        <div className="rounded-[calc(1.5rem-2px)] bg-card p-5">
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2.5 py-1 rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow">
            {t("most_popular")}
          </span>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold flex items-center gap-1">{t("pro_plan")} <Sparkles className="h-4 w-4 text-primary" /></h2>
            <p className="text-xl font-bold text-primary">
              {renderPrice(price, "text-primary")}
              {!isPlaceholder(price) && (
                <span className="text-xs text-muted-foreground font-normal"> {period}</span>
              )}
            </p>
          </div>
          <ul className="mt-4 space-y-2">
            {proRows.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span className="text-foreground">{r}</span>
              </li>
            ))}
          </ul>
          {isLifetime ? (
            <button disabled className="mt-5 w-full py-3 rounded-2xl bg-amber-100 text-amber-700 font-semibold text-sm">
              {t("plan_badge_lifetime")} ✓
            </button>
          ) : isPro && activeBillingPlan === billing ? (
            <button disabled className="mt-5 w-full py-3 rounded-2xl bg-emerald-100 text-emerald-700 font-semibold text-sm">
              {t("current_plan")} ✓
            </button>
          ) : (
            <button
              onClick={handleGooglePlayPurchase}
              disabled={submittingPlan !== null || isPlaceholder(price)}
              className="mt-5 w-full py-3 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-sm shadow-[var(--shadow-soft)] active:scale-[0.99] transition disabled:opacity-60"
            >
              {submittingPlan === "pro" ? "..." : `${t("upgrade_to_pro")}${buttonPriceTail(price)}`}
            </button>
          )}
        </div>
      </section>

      {/* Lifetime card */}
      <section className="relative rounded-3xl p-[2px] bg-gradient-to-br from-amber-400 via-amber-300 to-yellow-500">
        <div className="rounded-[calc(1.5rem-2px)] bg-card p-5">
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow">
            {t("best_value")}
          </span>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold flex items-center gap-1">{t("lifetime_plan")} <Crown className="h-4 w-4 text-amber-500" /></h2>
            <p className="text-xl font-bold text-amber-600">
              {renderPrice(lifetimePrice, "text-amber-600")}
              {!isPlaceholder(lifetimePrice) && (
                <span className="text-xs text-muted-foreground font-normal"> · {t("one_time_payment")}</span>
              )}
            </p>
          </div>
          <ul className="mt-4 space-y-2">
            {proRows.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <span className="text-foreground">{r}</span>
              </li>
            ))}
            <li className="flex items-start gap-2 text-sm">
              <Check className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <span className="text-foreground font-semibold">{t("never_pay_again")}</span>
            </li>
          </ul>
          {isLifetime ? (
            <button disabled className="mt-5 w-full py-3 rounded-2xl bg-amber-100 text-amber-700 font-semibold text-sm">
              ✓ {t("already_active")}
            </button>
          ) : (
            <button
              onClick={handleLifetimePurchase}
              disabled={submittingPlan !== null || isPlaceholder(lifetimePrice)}
              className="mt-5 w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 text-white font-bold text-sm shadow-[var(--shadow-soft)] active:scale-[0.99] transition disabled:opacity-60"
            >
              {submittingPlan === "lifetime" ? "..." : `${t("get_lifetime_access")}${buttonPriceTail(lifetimePrice)}`}
            </button>
          )}
        </div>
      </section>

      <button
        onClick={async () => {
          if (!isNativeBillingAvailable()) {
            toast.message(t("restore_only_android"));
            return;
          }
          await restorePurchases(
            async (receipts) => {
              if (!receipts.length) {
                toast.message(t("no_purchase_found"));
                return;
              }
              if (user) {
                // Lifetime wins — it's a stronger entitlement than a subscription.
                const lifetimeR = receipts.find((r) => r.productId === LIFETIME_PRODUCT_ID);
                const proR = receipts.find((r) => r.productId === SUBSCRIPTION_ID);
                const starterR = receipts.find(
                  (r) => r.productId === STARTER_PRODUCT_IDS.monthly || r.productId === STARTER_PRODUCT_IDS.annual,
                );
                if (lifetimeR) {
                  const { error: restoreError } = await supabase.from("subscriptions").upsert({
                    user_id: user.id,
                    plan: "lifetime",
                    status: "active",
                    provider: "google_play",
                    provider_product_id: LIFETIME_PRODUCT_ID,
                    provider_transaction_id: lifetimeR.transactionId,
                    provider_purchase_token: lifetimeR.purchaseToken ?? null,
                    lifetime_purchase_date: sub?.lifetime_purchase_date ?? new Date().toISOString(),
                    lifetime_google_token: lifetimeR.purchaseToken ?? null,
                    current_period_end: null,
                  }, { onConflict: "user_id" });
                  if (restoreError) {
                    console.error("[billing] Restore upsert failed:", restoreError);
                    toast.error(`${t("billing_unknown_error")}: ${restoreError.message}`);
                    return;
                  }
                  await refresh();
                  toast.success(t("lifetime_restored"));
                  notifySituation({
                    kind: "milestone",
                    title: t("welcome_to_lifetime"),
                    body: t("lifetime_restored"),
                    link: "/plans",
                    prefKey: "notif_milestone",
                    dedupeKey: `lifetime_${lifetimeR.transactionId || lifetimeR.purchaseToken || "restored"}`,
                  }).catch(() => {});
                  return;
                }
                if (proR) {
                  const { error: restoreError } = await supabase.from("subscriptions").upsert({
                    user_id: user.id,
                    plan: "pro",
                    status: "active",
                    provider: "google_play",
                    provider_product_id: `${proR.productId}:${proR.basePlanId ?? "monthly"}`,
                    provider_transaction_id: proR.transactionId,
                    provider_purchase_token: proR.purchaseToken ?? null,
                    current_period_end: proR.currentPeriodEnd ?? null,
                  }, { onConflict: "user_id" });
                  if (restoreError) {
                    console.error("[billing] Restore upsert failed:", restoreError);
                    toast.error(`${t("billing_unknown_error")}: ${restoreError.message}`);
                    return;
                  }
                  await refresh();
                  toast.success(t("pro_restored"));
                  notifySituation({
                    kind: "milestone",
                    title: "Pro Restored ✦",
                    body: "Your Bossify Pro access is active.",
                    link: "/plans",
                    prefKey: "notif_milestone",
                    dedupeKey: `pro_${proR.transactionId || proR.purchaseToken || "restored"}`,
                  }).catch(() => {});
                  return;
                }
                if (starterR) {
                  const cycle = starterR.productId === STARTER_PRODUCT_IDS.annual ? "annual" : "monthly";
                  const { error: restoreError } = await supabase.from("subscriptions").upsert({
                    user_id: user.id,
                    plan: "starter",
                    status: "active",
                    provider: "google_play",
                    provider_product_id: `${starterR.productId}:${cycle}`,
                    provider_transaction_id: starterR.transactionId,
                    provider_purchase_token: starterR.purchaseToken ?? null,
                    current_period_end: starterR.currentPeriodEnd ?? null,
                  }, { onConflict: "user_id" });
                  if (restoreError) {
                    toast.error(`${t("billing_unknown_error")}: ${restoreError.message}`);
                    return;
                  }
                  await refresh();
                  toast.success(t("starter_restored"));
                }
              }
            },
            (err) => {
              if (err.code === "item_unavailable") toast.message(t("no_purchase_found"));
              else toast.error(t("billing_unknown_error"));
            },
          );
        }}
        className="w-full text-xs text-muted-foreground underline py-2"
      >
        {t("restore_purchases")}
      </button>

    </div>
  );
}