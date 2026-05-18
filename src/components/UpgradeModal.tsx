import { useNavigate } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useI18n } from "@/contexts/I18nContext";
import { useEffect, useState } from "react";
import { queryProductDetailsSafe, FALLBACK_PRICES } from "@/lib/billing";

export function UpgradeModal() {
  const { upgradeOpen, hideUpgrade, upgradeReason } = useSubscription();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [proMonthlyPrice, setProMonthlyPrice] = useState<string>(FALLBACK_PRICES.monthly);

  useEffect(() => {
    if (!upgradeOpen) return;
    let cancelled = false;
    queryProductDetailsSafe()
      .then((result) => {
        if (cancelled) return;
        const monthly = result.prices.find((p) => p.plan === "monthly");
        if (monthly?.formattedPrice && monthly.formattedPrice !== "—") setProMonthlyPrice(monthly.formattedPrice);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [upgradeOpen]);

  if (!upgradeOpen) return null;

  // When the modal is opened because the user hit the monthly free order
  // limit, swap to the limit-specific title and copy.
  const isLimitReached = upgradeReason === t("upgrade_message");
  const title = isLimitReached ? t("limit_reached") : t("upgrade_title");
  const description = isLimitReached ? t("upgrade_message") : t("upgrade_desc");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-fade-in p-5"
      onClick={hideUpgrade}
    >
      <div
        className="w-full max-w-[340px] bg-card rounded-3xl p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center shadow-[var(--shadow-soft)]">
          <Lock className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-foreground">{title}</h2>
        <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed">
          {description}
        </p>
        <button
          onClick={() => { hideUpgrade(); navigate({ to: "/plans" }); }}
          className="mt-5 w-full py-3 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-sm shadow-[var(--shadow-soft)] active:scale-[0.99] transition"
        >
          {t("upgrade_to_pro")} → {proMonthlyPrice}/{t("per_month").replace(/^\s*\/\s*/, "")}
        </button>
        <button
          onClick={hideUpgrade}
          className="mt-2 w-full py-2 text-xs text-muted-foreground"
        >
          {t("maybe_later")}
        </button>
      </div>
    </div>
  );
}