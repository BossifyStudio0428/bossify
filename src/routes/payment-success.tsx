import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription, type Plan } from "@/contexts/SubscriptionContext";

export const Route = createFileRoute("/payment-success")({
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search.session_id === "string" ? search.session_id : "",
  }),
  component: PaymentSuccessPage,
});

async function activateStripeSession(sessionId: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.access_token)
    throw new Error("Please sign in again to activate your plan.");
  const res = await fetch(`${supabaseUrl}/functions/v1/activate-stripe-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
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

function isPaidPlan(plan: Plan | undefined) {
  return plan === "starter" || plan === "pro" || plan === "lifetime";
}

function PaymentSuccessPage() {
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
          const currentPlan = (isPaidPlan(latest?.plan) ? latest?.plan : await fetchCurrentPlan()) ?? undefined;
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
    const t = setTimeout(() => navigate({ to: "/" }), 3000);
    return () => clearTimeout(t);
  }, [confirmedPlan, navigate]);

  const planName =
    confirmedPlan === "pro"
      ? "Pro"
      : confirmedPlan === "lifetime"
        ? "Lifetime"
        : confirmedPlan === "starter"
          ? "Starter"
          : "";

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="mx-auto h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center">
          {confirmedPlan ? (
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          ) : (
            <Loader2 className="h-10 w-10 text-emerald-600 animate-spin" />
          )}
        </div>
        <h1 className="mt-5 text-2xl font-bold">
          {confirmedPlan ? `Payment successful! Welcome to ${planName}!` : "Activating your plan…"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {confirmedPlan
            ? "Redirecting you to Home…"
            : activationError
              ? "Still syncing your payment. Please wait here."
              : "This usually takes a few seconds."}
        </p>
      </div>
    </div>
  );
}
