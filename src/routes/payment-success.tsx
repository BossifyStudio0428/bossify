import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";

export const Route = createFileRoute("/payment-success")({ component: PaymentSuccessPage });

function PaymentSuccessPage() {
  const navigate = useNavigate();
  const { plan, refresh } = useSubscription();
  const [polled, setPolled] = useState(0);

  // Poll subscription up to ~12s so the webhook has time to land.
  useEffect(() => {
    if (plan !== "free") return;
    if (polled >= 12) return;
    const t = setTimeout(() => { refresh(); setPolled((n) => n + 1); }, 1000);
    return () => clearTimeout(t);
  }, [plan, polled, refresh]);

  // Once we have a paid plan, redirect home after 3s.
  useEffect(() => {
    if (plan === "free") return;
    const t = setTimeout(() => navigate({ to: "/" }), 3000);
    return () => clearTimeout(t);
  }, [plan, navigate]);

  const planName = plan === "pro" ? "Pro" : plan === "lifetime" ? "Lifetime" : plan === "starter" ? "Starter" : "";

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="mx-auto h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        </div>
        <h1 className="mt-5 text-2xl font-bold">
          {plan === "free" ? "Activating your plan…" : `Payment successful! Welcome to ${planName}!`}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {plan === "free" ? "This usually takes a few seconds." : "Redirecting you to Home…"}
        </p>
      </div>
    </div>
  );
}