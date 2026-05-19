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

  const isFree = plan === "free";
  const showGoogle = isFree || platform === "google_play" || (!platform && !isFree);
  const showStripe = isFree || platform === "stripe" || (!platform && !isFree);

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
            <p className="text-sm leading-relaxed text-muted-foreground">{t("terms_refund_google_play")}</p>
          </div>
        )}
        {showStripe && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-foreground">{t("terms_refund_stripe_title")}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{t("terms_refund_stripe")}</p>
          </div>
        )}
      </section>
    </div>
  );
}