import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Check, X, Sparkles, Crown, Rocket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { useSubscription, FREE_LIMITS } from "@/contexts/SubscriptionContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
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

async function startStripeCheckout(opts: {
  userId: string;
  planType: "starter" | "pro" | "lifetime";
  billingCycle: "monthly" | "annual" | "one";
}) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${supabaseUrl}/functions/v1/create-stripe-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${session?.access_token ?? anonKey}`,
    },
    body: JSON.stringify(opts),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Checkout failed (${res.status}): ${text.slice(0, 200)}`);
  let payload: { url?: string; error?: string };
  try { payload = JSON.parse(text); } catch { throw new Error(`Invalid response: ${text.slice(0, 200)}`); }
  if (payload.error) throw new Error(payload.error);
  if (!payload.url) throw new Error("No checkout URL returned");
  // Stripe Checkout refuses to render inside iframes (preview/embeds),
  // so open the hosted page in the top-level window / new tab.
  const opened = window.open(payload.url, "_blank", "noopener,noreferrer");
  if (!opened) {
    // Popup blocked — fall back to top-frame navigation.
    if (window.top && window.top !== window.self) {
      window.top.location.href = payload.url;
    } else {
      window.location.href = payload.url;
    }
  }
}

function PlansPage() {
  const { t, lang } = useI18n();
  const { type: bizType } = useBusinessType();
  const eff = (bizType ?? "retail") as
    | "retail" | "fnb" | "education" | "beauty" | "property" | "freelance";
  const { user } = useAuth();
  const { isPro, isStarter, isLifetime, plan, ordersUsed, sub, refresh, syncFromStore, activeBillingPlan } = useSubscription();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [scope, setScope] = useState<"individual" | "team">("individual");
  const [submittingPlan, setSubmittingPlan] = useState<"pro" | "lifetime" | "starter" | null>(null);
  const [lifetimeConfirmOpen, setLifetimeConfirmOpen] = useState(false);
  const [storePrices, setStorePrices] = useState<Record<"monthly" | "annual" | "lifetime" | "starter_monthly" | "starter_annual", string>>({
    monthly: FALLBACK_PRICES.monthly,
    annual: FALLBACK_PRICES.annual,
    lifetime: LIFETIME_FALLBACK_PRICE,
    starter_monthly: STARTER_FALLBACK_PRICES.monthly,
    starter_annual: STARTER_FALLBACK_PRICES.annual,
  });

  // Pull locally-formatted prices from Google Play in the background and
  // overwrite the fallbacks once they arrive. No loading UI — fallback
  // prices (RM 49 / RM 399 / RM 2,999 / RM 19 / RM 159) render instantly.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      queryProductDetailsSafe()
        .then((result) => {
          if (cancelled) return;
          setStorePrices((prev) => {
            const next = { ...prev };
            for (const p of result.prices) {
              if (p.formattedPrice && p.formattedPrice !== "—") next[p.plan] = p.formattedPrice;
            }
            return next;
          });
        })
        .catch(() => {});
    };
    load();
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const price = storePrices[billing];
  const lifetimePrice = storePrices.lifetime;
  const starterPrice = billing === "monthly" ? storePrices.starter_monthly : storePrices.starter_annual;
  const period = billing === "monthly" ? t("per_month") : t("per_year");

  // Per-business-type feature keys. Pricing & savings are NOT touched.
  const FREE: Record<typeof eff, TKey[]> = {
    retail:    ["free_orders_per_month", "free_inventory_count", "pf_basic_dashboard", "pf_wa_order_confirms"],
    fnb:       ["free_orders_per_month", "free_inventory_count", "pf_basic_dashboard", "pf_wa_order_confirms"],
    education: ["pf_cases_20", "pf_services_10", "pf_basic_dashboard", "pf_wa_confirm_tpl"],
    beauty:    ["pf_appointments_20", "pf_services_10", "pf_basic_dashboard", "pf_wa_confirm_tpl"],
    property:  ["pf_leads_20", "pf_packages_10", "pf_basic_dashboard", "pf_followup_reminders"],
    freelance: ["pf_projects_20", "pf_services_10", "pf_basic_dashboard", "pf_wa_confirm_tpl"],
  };
  const STARTER: Record<typeof eff, TKey[]> = {
    retail:    ["starter_orders_per_month", "starter_products_count", "basic_sales_reports", "ps_wa_confirmations"],
    fnb:       ["starter_orders_per_month", "starter_products_count", "basic_sales_reports", "ps_wa_confirmations"],
    education: ["ps_cases_40", "ps_services_25", "ps_basic_case_reports", "ps_uni_insights_basic", "ps_wa_confirmations"],
    beauty:    ["ps_appointments_40", "ps_services_25", "ps_basic_appointment_reports", "ps_wa_confirmations"],
    property:  ["ps_leads_40", "ps_packages_25", "ps_basic_lead_reports", "pf_followup_reminders"],
    freelance: ["ps_projects_40", "ps_services_25", "ps_basic_project_reports", "ps_wa_confirmations"],
  };
  const PRO: Record<typeof eff, TKey[]> = {
    retail:    ["unlimited_orders_feat", "pp_unlimited_products", "full_reports_feat", "export_pdf", "wa_template", "remind_all_unpaid", "priority_support_feat"],
    fnb:       ["unlimited_orders_feat", "pp_unlimited_products", "full_reports_feat", "export_pdf", "wa_template", "remind_all_unpaid", "priority_support_feat"],
    education: ["pp_unlimited_cases", "pp_unlimited_services", "pp_full_case_reports", "pp_uni_insights_full", "pp_client_comparison", "export_pdf", "wa_template", "priority_support_feat"],
    beauty:    ["pp_unlimited_appointments", "pp_unlimited_services", "pp_full_appointment_reports", "pp_client_analytics", "export_pdf", "wa_template", "remind_all_unpaid", "priority_support_feat"],
    property:  ["pp_unlimited_leads", "pp_unlimited_packages", "pp_full_lead_reports", "pp_followup_analytics", "export_pdf", "priority_support_feat"],
    freelance: ["pp_unlimited_projects", "pp_unlimited_services", "pp_full_project_reports", "pp_client_analytics", "export_pdf", "wa_template", "priority_support_feat"],
  };

  const freePositive: TKey[] = FREE[eff];
  const freeRows: { ok: boolean; label: string }[] = [
    { ok: true, label: "1 台设备 / 1 device" },
    ...freePositive.map((k) => ({ ok: true, label: t(k) })),
    // upsell hints (what you don't get on Free)
    { ok: false, label: t("sales_reports") },
    { ok: false, label: t("export_pdf") },
    { ok: false, label: t("wa_template") },
  ];
  const starterRows = ["2 台设备 / 2 devices", ...STARTER[eff].map((k) => t(k))];
  const proRows = PRO[eff].map((k) => t(k));

  const handleGooglePlayPurchase = async () => {
    if (!user) return;
    if (!isNativeBillingAvailable()) {
      setSubmittingPlan("pro");
      try {
        await startStripeCheckout({ userId: user.id, planType: "pro", billingCycle: billing });
      } catch (e) {
        toast.error((e as Error).message);
        setSubmittingPlan(null);
      }
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
      setSubmittingPlan("lifetime");
      try {
        await startStripeCheckout({ userId: user.id, planType: "lifetime", billingCycle: "one" });
      } catch (e) {
        toast.error((e as Error).message);
        setSubmittingPlan(null);
      }
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
            lifetime_email: user.email ?? null,
            lifetime_activated_at: new Date().toISOString(),
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
      setSubmittingPlan("starter");
      try {
        await startStripeCheckout({ userId: user.id, planType: "starter", billingCycle: billing });
      } catch (e) {
        toast.error((e as Error).message);
        setSubmittingPlan(null);
      }
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

      {/* Scope toggle: Individual vs Team */}
      <div className="flex p-1 bg-muted rounded-2xl">
        {(["individual", "team"] as const).map((s) => {
          const label =
            s === "individual"
              ? lang === "zh" ? "个人 Individual" : lang === "ms" ? "Individu / Individual" : "Individual 个人"
              : lang === "zh" ? "团队 Team" : lang === "ms" ? "Pasukan / Team" : "Team 团队";
          return (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${scope === s ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          );
        })}
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

      {scope === "individual" && (<>
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
              <span className="text-sky-600">{starterPrice}</span>
              <span className="text-xs text-muted-foreground font-normal"> {period}</span>
            </p>
          </div>
          <ul className="mt-4 space-y-2">
            {starterRows.map((r, i) => (
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
              disabled={submittingPlan !== null}
              className="mt-5 w-full py-3 rounded-2xl bg-gradient-to-r from-sky-500 to-teal-500 text-white font-bold text-sm shadow-[var(--shadow-soft)] active:scale-[0.99] transition disabled:opacity-60"
            >
              {submittingPlan === "starter" ? "..." : `${t("start_starter_plan")} — ${starterPrice}`}
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
              <span className="text-primary">{price}</span>
              <span className="text-xs text-muted-foreground font-normal"> {period}</span>
            </p>
          </div>
          <ul className="mt-4 space-y-2">
            <li className="flex items-start gap-2 text-sm">
              <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span className="text-foreground">3 台设备 / 3 devices</span>
            </li>
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
              disabled={submittingPlan !== null}
              className="mt-5 w-full py-3 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-sm shadow-[var(--shadow-soft)] active:scale-[0.99] transition disabled:opacity-60"
            >
              {submittingPlan === "pro" ? "..." : `${t("upgrade_to_pro")} — ${price}`}
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
              <span className="text-amber-600">{lifetimePrice}</span>
              <span className="text-xs text-muted-foreground font-normal"> · {t("one_time_payment")}</span>
            </p>
          </div>
          <ul className="mt-4 space-y-2">
            <li className="flex items-start gap-2 text-sm">
              <Check className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <span className="text-foreground">5 台设备 / 5 devices</span>
            </li>
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
              onClick={() => setLifetimeConfirmOpen(true)}
              disabled={submittingPlan !== null}
              className="mt-5 w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 text-white font-bold text-sm shadow-[var(--shadow-soft)] active:scale-[0.99] transition disabled:opacity-60"
            >
              {submittingPlan === "lifetime" ? "..." : `${t("get_lifetime_access")} — ${lifetimePrice}`}
            </button>
          )}
          <Link to="/terms" className="mt-3 block text-center text-[11px] text-muted-foreground underline">
            {t("terms_of_use")}
          </Link>
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
                  // Account lock: lifetime is bound to ONE email. If this
                  // device's logged-in email differs from the original
                  // purchaser's email, do NOT restore.
                  if (
                    sub?.lifetime_email &&
                    user.email &&
                    sub.lifetime_email.toLowerCase() !== user.email.toLowerCase()
                  ) {
                    toast.error(t("lifetime_restore_mismatch"));
                    return;
                  }
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
                    lifetime_email: sub?.lifetime_email ?? user.email ?? null,
                    lifetime_activated_at: sub?.lifetime_activated_at ?? new Date().toISOString(),
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

      {lifetimeConfirmOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-fade-in p-5"
          onClick={() => setLifetimeConfirmOpen(false)}
        >
          <div
            className="w-full max-w-[360px] bg-card rounded-3xl p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              {t("confirm_lifetime_title")}
            </h2>
            <p className="mt-3 text-[13px] text-foreground leading-relaxed">
              {t("confirm_lifetime_intro")}
            </p>
            <ul className="mt-3 space-y-2 text-[13px] text-foreground">
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" /><span>{t("confirm_lifetime_b1").replace("{email}", user?.email ?? "—")}</span></li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" /><span>{t("confirm_lifetime_b2")}</span></li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" /><span>{t("confirm_lifetime_b3")}</span></li>
              <li className="flex items-start gap-2"><Check className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" /><span>{t("confirm_lifetime_b4")}</span></li>
            </ul>
            <p className="mt-3 text-[12px] text-muted-foreground">{t("confirm_lifetime_ask")}</p>
            <Link
              to="/terms"
              className="mt-2 block text-[11px] text-primary underline"
            >
              {t("terms_of_use")}
            </Link>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setLifetimeConfirmOpen(false)}
                className="flex-1 py-3 rounded-2xl bg-muted text-foreground font-semibold text-sm"
              >
                {t("cancel")}
              </button>
              <button
                onClick={() => {
                  setLifetimeConfirmOpen(false);
                  handleLifetimePurchase();
                }}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 text-white font-bold text-sm shadow-[var(--shadow-soft)]"
              >
                {t("i_agree_purchase")}
              </button>
            </div>
          </div>
        </div>
      )}
      </>)}

      {scope === "team" && <TeamPlansSection lang={lang} billing={billing} />}

    </div>
  );
}