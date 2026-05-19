import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/contexts/SubscriptionContext";

export const Route = createFileRoute("/terms")({ component: TermsPage });

function TermsPage() {
  const { t } = useI18n();
  const { plan } = useSubscription();
  const [platform, setPlatform] = useState<"google_play" | "stripe" | null>(null);
  const [isNativeAndroid, setIsNativeAndroid] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
          setIsNativeAndroid(true);
        }
      } catch {
        // not in Capacitor — web
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("payment_platform" as any)
        .eq("id", user.id)
        .maybeSingle();
      let p = (prof as any)?.payment_platform as string | null | undefined;
      if (p !== "google_play" && p !== "stripe") {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("provider")
          .eq("user_id", user.id)
          .maybeSingle();
        const prov = (sub as any)?.provider;
        if (prov === "google_play" || prov === "stripe") p = prov;
      }
      if (p === "google_play" || p === "stripe") setPlatform(p);
    })();
  }, []);

  // Platform precedence:
  // 1. Running inside the Android app → Google Play only (the only payment method available there).
  // 2. Known payment platform from profile/subscription → that one only.
  // 3. Free plan on web → show both for reference.
  // 4. Unknown on web → default to Stripe (web purchases go through Stripe).
  const isFree = plan === "free";
  let showGoogle = false;
  let showStripe = false;
  if (isNativeAndroid) {
    showGoogle = true;
  } else if (platform === "google_play") {
    showGoogle = true;
  } else if (platform === "stripe") {
    showStripe = true;
  } else if (isFree) {
    showGoogle = true;
    showStripe = true;
  } else {
    showStripe = true;
  }

  const bullets = [
    t("terms_lifetime_b1"),
    t("terms_lifetime_b2"),
    t("terms_lifetime_b3"),
    t("terms_lifetime_b4"),
    t("terms_lifetime_b5"),
    t("terms_lifetime_b6"),
  ];
  return (
    <div className="px-5 pt-10 pb-10 space-y-5">
      <header className="flex items-center gap-2">
        <Link to="/profile" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("terms_of_use")}</h1>
      </header>
      <section className="rounded-2xl bg-card border border-border/60 p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-bold text-foreground">{t("terms_lifetime_heading")}</h2>
        <ul className="mt-3 space-y-2.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-foreground">
              <span className="text-primary mt-0.5">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl bg-card border border-border/60 p-5 shadow-[var(--shadow-card)] space-y-4">
        <h2 className="text-base font-bold text-foreground">{t("terms_refund_heading")}</h2>
        {showGoogle && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-foreground">{t("terms_refund_google_play_title")}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{t("terms_refund_google_play")}</p>
          </div>
        )}
        {showStripe && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-foreground">{t("terms_refund_stripe_title")}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{t("terms_refund_stripe")}</p>
          </div>
        )}
      </section>
    </div>
  );
}