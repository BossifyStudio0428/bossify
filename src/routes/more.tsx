import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  ClipboardList,
  Users,
  Truck,
  ShoppingBag,
  FileText,
  Plus,
  User,
  Bell as BellIcon,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { RETAIL_ONLY_MODE, HIDE_PROFIT_SUMMARY } from "@/lib/featureFlags";

export const Route = createFileRoute("/more")({ component: MorePage });

function MorePage() {
  const { t } = useI18n();
  const items: { to: string; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
    { to: "/new-order", icon: Plus, label: t("more_new_order") },
    ...(HIDE_PROFIT_SUMMARY
      ? []
      : [{ to: "/profit", icon: TrendingUp, label: t("more_profit") }]),
    { to: "/orders", icon: ClipboardList, label: t("more_orders") },
    { to: "/customers", icon: Users, label: t("more_customers") },
    { to: "/suppliers", icon: Truck, label: t("more_suppliers") },
    { to: "/purchase-orders", icon: ShoppingBag, label: t("more_purchase_orders") },
    { to: "/reports", icon: BarChart3, label: t("more_reports") },
    ...(RETAIL_ONLY_MODE
      ? []
      : [{ to: "/documents", icon: FileText, label: t("more_documents") }]),
    { to: "/notifications", icon: BellIcon, label: t("more_notifications") },
    { to: "/profile", icon: User, label: t("more_profile") },
  ];
  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-2">
        <Link to="/" className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">{t("more_title")}</h1>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {items.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            className="flex flex-col items-start gap-2 rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)] active:scale-[0.98]"
          >
            <span className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <it.icon className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold text-foreground">{it.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}