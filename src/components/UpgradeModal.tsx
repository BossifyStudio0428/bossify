import { useNavigate } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useI18n } from "@/contexts/I18nContext";
import { useEffect, useState } from "react";
import { queryProductDetailsSafe, FALLBACK_PRICES, isNativeBillingAvailable } from "@/lib/billing";

export function UpgradeModal() {
  const { upgradeOpen, hideUpgrade, upgradeReason } = useSubscription();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [proMonthlyPrice, setProMonthlyPrice] = useState<string>(FALLBACK_PRICES.monthly);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!upgradeOpen) return;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    queryProductDetailsSafe()
      .then((result) => {
        if (cancelled) return;
        console.info("[billing] upgrade modal price result", result);
        const monthly = result.prices.find((p) => p.plan === "monthly");
        if (monthly?.formattedPrice) setProMonthlyPrice(monthly.formattedPrice);
        if (result.nativeAvailable && (result.fallback || result.stale || !monthly?.formattedPrice || monthly.formattedPrice === "—")) {
          retry = setTimeout(() => { if (!cancelled) setRetryTick((n) => n + 1); }, Math.min(30000, 2500 * (retryTick + 1)));
        }
      })
      .catch((error) => {
        console.error("[billing] upgrade modal price fetch failed", error);
        if (!cancelled && isNativeBillingAvailable()) setRetryTick((n) => n + 1);
      });
    return () => { cancelled = true; if (retry) clearTimeout(retry); };
  }, [upgradeOpen, retryTick]);

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
          {t("upgrade_to_pro")} → {proMonthlyPrice === "—" ? t("fetching_price") : proMonthlyPrice}/{t("per_month").replace(/^\s*\/\s*/, "")}
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