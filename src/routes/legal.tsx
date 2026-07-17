import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, FileText, ShieldCheck } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/legal")({ component: LegalPage });

function LegalPage() {
  const { t } = useI18n();
  const rows = [
    { to: "/terms" as const, icon: FileText, label: t("terms_conditions") },
    { to: "/privacy-policy" as const, icon: ShieldCheck, label: t("privacy_policy") },
  ];
  return (
    <div className="px-5 pt-10 pb-6 space-y-5">
      <header className="flex items-center gap-2">
        <Link to="/more" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("more_legal")}</h1>
      </header>

      <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60 overflow-hidden">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <Link
              key={r.to}
              to={r.to}
              className="w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50 active:bg-muted"
            >
              <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Icon className="h-5 w-5" />
              </span>
              <span className="flex-1 text-sm font-medium text-foreground">{r.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          );
        })}
      </section>
    </div>
  );
}