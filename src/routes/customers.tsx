import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase, type CustomerRow } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/customers")({ component: CustomersPage });

function CustomersPage() {
  const { t } = useI18n();
  const relTime = (iso: string | null) => {
    if (!iso) return t("never");
    const d = new Date(iso);
    const today = new Date();
    const diffDays = Math.floor((today.setHours(0,0,0,0) - new Date(d).setHours(0,0,0,0)) / 86400000);
    if (diffDays <= 0) return t("today_word");
    if (diffDays === 1) return t("yesterday");
    return `${diffDays} ${t("days_ago")}`;
  };
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .order("total_spent", { ascending: false });
      setCustomers((data ?? []) as CustomerRow[]);
      setLoading(false);
    })();
  }, []);

  const visible = customers.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="px-5 pt-10 pb-4 space-y-5">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("customers")}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {customers.length} {t("total")}
        </span>
      </header>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base">🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search_customers")}
          className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
        />
      </div>

      <div className="space-y-3">
        {loading && <p className="text-center text-sm text-muted-foreground py-10">{t("loading")}</p>}
        {!loading && visible.map((c) => (
          <article
            key={c.id}
            className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 flex items-center gap-3"
          >
            <div className="h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold text-base shrink-0">
              {c.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {c.total_orders} {t("orders_word")} · {t("last")}: {relTime(c.last_order_at)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <p className="text-sm font-bold text-primary">RM {Number(c.total_spent).toFixed(0)}</p>
              <button className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500 text-white active:scale-95 transition-transform">
                📲 WA
              </button>
            </div>
          </article>
        ))}
        {!loading && visible.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">{t("no_customers")}</p>
        )}
      </div>
    </div>
  );
}
