import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/team/welcome")({
  component: TeamWelcome,
});

function TeamWelcome() {
  const { t } = useI18n();
  const { plan } = useSubscription();
  const max =
    plan === "team_starter" ? 3 : plan === "team_pro" ? 10 : plan === "team_business" ? "∞" : "—";
  const planLabel =
    plan === "team_starter"
      ? "Team Starter"
      : plan === "team_pro"
        ? "Team Pro"
        : plan === "team_business"
          ? "Team Business"
          : String(plan);
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-lg p-8 text-center space-y-4">
        <CheckCircle2 className="w-16 h-16 mx-auto text-green-500" />
        <h1 className="text-2xl font-bold">{t("team_plan_activated")}</h1>
        <p className="text-muted-foreground">{t("team_welcome_sub")}</p>
        <div className="bg-muted rounded-lg p-4 text-left space-y-1">
          <div className="flex justify-between"><span>{t("team_plan")}</span><span className="font-semibold">{planLabel}</span></div>
          <div className="flex justify-between"><span>{t("team_max_users")}</span><span className="font-semibold">{max === "∞" ? t("team_unlimited") : max}</span></div>
        </div>
        <Button asChild className="w-full"><Link to="/team">{t("team_set_up")}</Link></Button>
      </div>
    </div>
  );
}