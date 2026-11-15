import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription, type Plan } from "@/contexts/SubscriptionContext";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/payment-success")({
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search.session_id === "string" ? search.session_id : "",
  }),
  component: PaymentSuccessPage,
});

async function activateStripeSession(sessionId: string) {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.access_token)
    throw new Error("Please sign in again to activate your plan.");
  const res = await fetch(`/api/public/stripe/activate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ sessionId }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Activation failed (${res.status})`);
  return JSON.parse(text) as Promise<{ activated?: boolean; plan?: string }>;
}

async function fetchCurrentPlan() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data?.plan as Plan | undefined;
}

// Bug fix (2026-11): "business" was missing here, so a Business buyer
// paying via Stripe never resolved as a paid plan — the confirmPayment
// poll loop in confirmPayment() below never found a match, leaving the
// page stuck on "Activating your plan…" forever even though the backend
// had already written plan: "business" to their subscription row.
function isPaidPlan(plan: Plan | undefined) {
  return plan === "starter" || plan === "pro" || plan === "business" || plan === "lifetime";
}

function PaymentSuccessPage() {
  const { lang } = useI18n();
  const navigate = useNavigate();
  const { session_id: sessionId } = Route.useSearch();
  const { plan, refresh } = useSubscription();
  const [confirmedPlan, setConfirmedPlan] = useState<Plan | null>(isPaidPlan(plan) ? plan : null);
  const [activationError, setActivationError] = useState("");

  useEffect(() => {
    if (isPaidPlan(plan)) setConfirmedPlan(plan);
  }, [plan]);

  useEffect(() => {
    let cancelled = false;
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    async function confirmPayment() {
      setActivationError("");
      for (let attempt = 0; attempt < 30 && !cancelled; attempt += 1) {
        try {
          if (sessionId) await activateStripeSession(sessionId);
          const latest = await refresh();
          const currentPlan =
            (isPaidPlan(latest?.plan) ? latest?.plan : await fetchCurrentPlan()) ?? undefined;
          if (isPaidPlan(currentPlan)) {
            if (!cancelled) setConfirmedPlan(currentPlan);
            return;
          }
        } catch (error) {
          console.error("stripe session activation failed", error);
          if (!cancelled) setActivationError((error as Error).message);
        }
        await wait(1500);
      }
    }

    if (!confirmedPlan) confirmPayment();
    return () => {
      cancelled = true;
    };
  }, [sessionId, confirmedPlan, refresh]);

  // Once we have a paid plan, redirect home after 3s.
  useEffect(() => {
    if (!confirmedPlan) return;
    const isTeam =
      confirmedPlan === "team_starter" ||
      confirmedPlan === "team_pro" ||
      confirmedPlan === "team_business";
    const t = setTimeout(
      () => navigate({ to: isTeam ? "/team/welcome" : "/" }),
      isTeam ? 1500 : 3000,
    );
    return () => clearTimeout(t);
  }, [confirmedPlan, navigate]);

  const planName =
    confirmedPlan === "pro"
      ? "Pro"
      : confirmedPlan === "business"
        ? "Business"
        : confirmedPlan === "lifetime"
          ? "Lifetime"
          : confirmedPlan === "starter"
            ? "Starter"
            : "";

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="mx-auto h-20 w-20 rounded-full bg-emerald-500/15 flex items-center justify-center">
          {confirmedPlan ? (
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          ) : (
            <Loader2 className="h-10 w-10 text-emerald-600 animate-spin" />
          )}
        </div>
        <h1 className="mt-5 text-2xl font-bold">
          {confirmedPlan
            ? (lang === "zh" ? `付款成功！欢迎使用 ${planName}！` : lang === "ms" ? `Bayaran berjaya! Selamat datang ke ${planName}!` : `Payment successful! Welcome to ${planName}!`)
            : (lang === "zh" ? "正在开通你的方案…" : lang === "ms" ? "Mengaktifkan pelan anda…" : "Activating your plan…")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {confirmedPlan
            ? (lang === "zh" ? "正在带你回首页…" : lang === "ms" ? "Membawa anda ke Laman Utama…" : "Redirecting you to Home…")
            : activationError
              ? (lang === "zh" ? "还在确认你的付款，请在这里稍等。" : lang === "ms" ? "Masih menyegerak bayaran anda. Sila tunggu di sini." : "Still syncing your payment. Please wait here.")
              : (lang === "zh" ? "通常只要几秒钟。" : lang === "ms" ? "Biasanya mengambil beberapa saat." : "This usually takes a few seconds.")}
        </p>
      </div>
    </div>
  );
}
