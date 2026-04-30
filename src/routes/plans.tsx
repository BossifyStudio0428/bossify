import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Check, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useSubscription, FREE_LIMITS } from "@/contexts/SubscriptionContext";

export const Route = createFileRoute("/plans")({ component: PlansPage });

function PlansPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isPro, plan, ordersUsed, sub, refresh } = useSubscription();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [paymentSheet, setPaymentSheet] = useState(false);
  const [bankSheet, setBankSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const price = billing === "monthly" ? "RM 19" : "RM 159";
  const period = billing === "monthly" ? t("per_month") : t("per_year");

  const freeRows: { ok: boolean; label: string }[] = [
    { ok: true, label: `30 ${t("orders").toLowerCase()} / ${t("monthly").toLowerCase()}` },
    { ok: true, label: `10 ${t("inventory").toLowerCase()}` },
    { ok: true, label: t("todays_revenue") + " · " + t("recent_orders") },
    { ok: true, label: "WhatsApp " + t("order_template") },
    { ok: false, label: t("sales_reports") },
    { ok: false, label: t("export_pdf") },
    { ok: false, label: t("remind_all_unpaid") },
    { ok: false, label: t("wa_template") },
  ];

  const proRows = [
    "Unlimited " + t("orders").toLowerCase(),
    "Unlimited " + t("inventory").toLowerCase(),
    "Full " + t("sales_reports").toLowerCase(),
    t("export_pdf"),
    t("wa_template"),
    t("remind_all_unpaid"),
    "Priority support ✦",
  ];

  const submitManualPayment = async () => {
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("admin_requests").insert({
      user_id: user.id,
      type: "upgrade_request",
      status: "pending",
      notes: `Plan: ${billing} (${price})`,
    });
    if (!error) {
      await supabase.from("subscriptions").update({ status: "pending" }).eq("user_id", user.id);
      toast.success(t("payment_submitted"));
      await refresh();
      setBankSheet(false);
      setPaymentSheet(false);
    } else {
      toast.error(error.message);
    }
    setSubmitting(false);
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
      <div className={`rounded-2xl p-4 border ${isPro ? "bg-gradient-to-br from-primary/15 to-primary/5 border-primary/40" : "bg-card border-border/60"}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase font-semibold text-muted-foreground">{t("current_plan")}</p>
            <p className="text-lg font-bold mt-0.5 flex items-center gap-2">
              {isPro ? (<>{t("pro_plan")} <Sparkles className="h-4 w-4 text-primary" /></>) : t("free_plan")}
            </p>
          </div>
          {isPro ? (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">{t("active_badge")}</span>
          ) : (
            <div className="text-right">
              <p className="text-sm font-bold text-foreground">{ordersUsed} / {FREE_LIMITS.ordersPerMonth}</p>
              <p className="text-[10px] text-muted-foreground">{t("orders_used")}</p>
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

      {/* Free card */}
      <section className="rounded-3xl bg-card border border-border/60 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">{t("free_plan")}</h2>
          <p className="text-xl font-bold">RM 0<span className="text-xs text-muted-foreground font-normal"> {t("per_month")}</span></p>
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

      {/* Pro card */}
      <section className="relative rounded-3xl p-[2px] bg-gradient-to-br from-primary via-primary/70 to-primary/40">
        <div className="rounded-[calc(1.5rem-2px)] bg-card p-5">
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2.5 py-1 rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow">
            {t("most_popular")}
          </span>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold flex items-center gap-1">{t("pro_plan")} <Sparkles className="h-4 w-4 text-primary" /></h2>
            <p className="text-xl font-bold text-primary">{price}<span className="text-xs text-muted-foreground font-normal"> {period}</span></p>
          </div>
          <ul className="mt-4 space-y-2">
            {proRows.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span className="text-foreground">{r}</span>
              </li>
            ))}
          </ul>
          {isPro ? (
            <button disabled className="mt-5 w-full py-3 rounded-2xl bg-emerald-100 text-emerald-700 font-semibold text-sm">
              {t("current_plan")} ✓
            </button>
          ) : (
            <button
              onClick={() => setPaymentSheet(true)}
              className="mt-5 w-full py-3 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-sm shadow-[var(--shadow-soft)] active:scale-[0.99] transition"
            >
              {t("upgrade_to_pro")} →
            </button>
          )}
        </div>
      </section>

      <button
        onClick={async () => { await refresh(); toast.success(t("restore_purchases")); }}
        className="w-full text-xs text-muted-foreground underline py-2"
      >
        {t("restore_purchases")}
      </button>

      {/* Payment method bottom sheet */}
      {paymentSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in" onClick={() => setPaymentSheet(false)}>
          <div className="w-full max-w-[390px] bg-card rounded-t-3xl p-5 space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto h-1 w-10 rounded-full bg-muted" />
            <p className="text-sm font-semibold py-2">{t("payment_method")}</p>
            <button disabled className="w-full flex items-center gap-3 p-3 rounded-2xl bg-muted/50 text-muted-foreground text-sm">
              <span className="text-lg">💳</span><span className="flex-1 text-left">Online Banking / DuitNow</span><span className="text-[10px]">{t("coming_soon")}</span>
            </button>
            <button disabled className="w-full flex items-center gap-3 p-3 rounded-2xl bg-muted/50 text-muted-foreground text-sm">
              <span className="text-lg">📱</span><span className="flex-1 text-left">Touch 'n Go eWallet</span><span className="text-[10px]">{t("coming_soon")}</span>
            </button>
            <button onClick={() => { setPaymentSheet(false); setBankSheet(true); }}
              className="w-full flex items-center gap-3 p-3 rounded-2xl bg-primary/10 text-primary text-sm font-semibold">
              <span className="text-lg">🏦</span><span className="flex-1 text-left">{t("manual_transfer")}</span>→
            </button>
          </div>
        </div>
      )}

      {/* Bank details sheet */}
      {bankSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in" onClick={() => setBankSheet(false)}>
          <div className="w-full max-w-[390px] bg-card rounded-t-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto h-1 w-10 rounded-full bg-muted" />
            <p className="text-sm font-semibold">{t("bank_details")}</p>
            <div className="rounded-2xl bg-muted/40 p-4 space-y-2 text-sm">
              <Row k="Bank" v="Maybank" />
              <Row k={t("account_number")} v="5121 8888 8888" />
              <Row k={t("account_holder")} v="Bossify Sdn Bhd" />
              <Row k="Amount" v={`${price} (${billing === "monthly" ? t("monthly") : t("annual")})`} />
              <Row k="Reference" v={user?.email ?? "—"} />
            </div>
            <p className="text-[11px] text-muted-foreground">{t("payment_pending")}</p>
            <button onClick={submitManualPayment} disabled={submitting}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-60">
              {submitting ? t("saving") : t("i_have_paid")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground text-xs">{k}</span>
      <span className="font-semibold text-foreground text-xs text-right">{v}</span>
    </div>
  );
}