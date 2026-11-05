import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  Users,
  FileText,
  Plus,
  User,
  Bell as BellIcon,
  TriangleAlert,
  TrendingUp,
  BarChart3,
  CreditCard,
  MessageCircle,
  ScrollText,
  Flame,
  HeartPulse,
  Receipt,
  Layers,
  BookOpen,
} from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { RETAIL_ONLY_MODE, HIDE_PROFIT_SUMMARY } from "@/lib/featureFlags";

export const Route = createFileRoute("/more")({ component: MorePage });

type MoreItem = { to: string; icon: React.ComponentType<{ className?: string }>; label: string };
type MoreSection = { title: string; items: MoreItem[] };

function MorePage() {
  const { t, lang } = useI18n();

  // "Guide" section title/label kept as inline per-language text (like
  // campaign.tsx's AI copy) rather than adding new keys to the 275KB
  // I18nContext.tsx for this one entry.
  const guideSectionTitle = lang === "zh" ? "帮助" : lang === "ms" ? "Bantuan" : "Help";
  const guideLabel = lang === "zh" ? "使用教学" : lang === "ms" ? "Panduan" : "Guide";

  // Re-added entry point for /expenses (Operating Expenses — edit/delete
  // individual cost entries, e.g. the Advertising one logged via Add Cost).
  // The route itself was never removed, only its nav link, when it got
  // dropped from Profile for being "redundant" with /add-cost — but
  // /add-cost is insert-only (no list/edit/delete), so there was no way
  // back into an entry once logged. Inline per-language label, same
  // pattern as guideLabel above and as expenses.tsx's own inline title.
  const expensesLabel = lang === "zh" ? "营业费用" : lang === "ms" ? "Perbelanjaan" : "Expenses";

  // Grouped so the grid reads as a few clear categories instead of one long
  // flat list — mirrors the way Cost Health/Cost Breakdown/etc. are already
  // grouped conceptually as "profit & cost" tools.
  const sections: MoreSection[] = [
    {
      title: t("more_section_quick"),
      items: [
        { to: "/new-order", icon: Plus, label: t("more_new_order") },
        { to: "/add-cost", icon: Receipt, label: t("more_add_cost") },
      ],
    },
    {
      title: t("more_section_profit"),
      items: [
        { to: "/cost-health", icon: HeartPulse, label: t("more_cost_health") },
        { to: "/product-profit", icon: TrendingUp, label: t("more_product_profit") },
        { to: "/cost-breakdown", icon: BarChart3, label: t("more_cost_breakdown") },
        { to: "/expenses", icon: FileText, label: expensesLabel },
        ...(HIDE_PROFIT_SUMMARY ? [] : [{ to: "/profit", icon: TrendingUp, label: t("more_profit") }]),
      ],
    },
    {
      title: t("more_section_stock"),
      items: [
        { to: "/stock", icon: Layers, label: t("stock_title") },
        { to: "/campaigns", icon: Flame, label: t("more_campaign") },
        { to: "/alerts", icon: TriangleAlert, label: t("more_alerts") },
      ],
    },
    {
      title: t("more_section_customers"),
      items: [
        // "TikTok Repeat Buyers" full leaderboard lives inside /customers
        // itself (with a "View all" link to /top-buyers) — no separate
        // top-level entry here anymore, so this doesn't read as a second
        // "customers" tile.
        { to: "/customers", icon: Users, label: t("more_customers") },
        { to: "/reports", icon: BarChart3, label: t("more_reports") },
        ...(RETAIL_ONLY_MODE ? [] : [{ to: "/documents", icon: FileText, label: t("more_documents") }]),
      ],
    },
    {
      title: t("more_section_account"),
      items: [
        { to: "/notifications", icon: BellIcon, label: t("more_notifications") },
        { to: "/profile", icon: User, label: t("more_profile") },
        { to: "/plans", icon: CreditCard, label: t("more_subscription") },
        { to: "/whatsapp-templates", icon: MessageCircle, label: t("more_wa_templates") },
        { to: "/legal", icon: ScrollText, label: t("more_legal") },
      ],
    },
    {
      title: guideSectionTitle,
      items: [{ to: "/guide", icon: BookOpen, label: guideLabel }],
    },
  ];

  return (
    <div className="px-4 pt-4 pb-24 space-y-6 lg:max-w-5xl lg:mx-auto lg:px-8 lg:pt-8">
      <div className="flex items-center gap-2">
        <Link to="/" className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">{t("more_title")}</h1>
      </div>

      {sections.map((section) => (
        <div key={section.title}>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">{section.title}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {section.items.map((it) => (
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
      ))}
    </div>
  );
}