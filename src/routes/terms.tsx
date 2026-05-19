import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/terms")({ component: TermsPage });

function TermsPage() {
  const { t } = useI18n();
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
    </div>
  );
}