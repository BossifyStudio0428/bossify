import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { orderGrossProfit } from "@/lib/orderMath";

export const Route = createFileRoute("/profit")({ component: ProfitPage });

type Range = "month" | "7d" | "30d";

type OrderRow = {
  amount: number | null;
  cost: number | null;
  gross_profit: number | null;
  status: string | null;
  created_at: string;
};

function rangeStartISO(r: Range): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (r === "month") {
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  }
  const days = r === "7d" ? 7 : 30;
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function money(n: number) {
  return `RM ${n.toFixed(2)}`;
}

function ProfitPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [range, setRange] = useState<Range>("month");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("amount,cost,gross_profit,status,created_at")
        .eq("user_id", user.id)
        .eq("status", "Paid")
        .gte("created_at", rangeStartISO(range));
      if (cancelled) return;
      if (error) toast.error(error.message);
      setOrders((data ?? []) as OrderRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, range]);

  const stats = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    let profit = 0;
    for (const o of orders) {
      revenue += Number(o.amount ?? 0);
      cost += Number(o.cost ?? 0);
      profit += orderGrossProfit({
        amount: o.amount,
        cost: o.cost,
        gross_profit: o.gross_profit,
      });
    }
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, cost, profit, margin, count: orders.length };
  }, [orders]);

  const ranges: { k: Range; label: string }[] = [
    { k: "month", label: t("profit_range_month") },
    { k: "7d", label: t("profit_range_7d") },
    { k: "30d", label: t("profit_range_30d") },
  ];

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-2">
        <Link to="/more" className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">{t("profit_title")}</h1>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 ml-11">{t("profit_subtitle")}</p>

      <div className="mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {ranges.map((r) => (
          <button
            key={r.k}
            onClick={() => setRange(r.k)}
            className={`shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-full border transition ${
              range === r.k
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-border/60 bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2">
          <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <TrendingUp className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[11px] text-muted-foreground">{t("profit_net")}</p>
            <p className={`text-2xl font-bold ${stats.profit < 0 ? "text-red-600" : "text-emerald-600"}`}>
              {loading ? "…" : money(stats.profit)}
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[11px] text-muted-foreground">{t("profit_margin")}</p>
            <p className={`text-lg font-bold ${stats.margin < 0 ? "text-red-600" : "text-foreground"}`}>
              {loading || stats.revenue === 0 ? "—" : `${stats.margin.toFixed(1)}%`}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-muted/40 border border-border/50 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{t("profit_revenue")}</p>
            <p className="text-sm font-bold text-foreground">{loading ? "…" : money(stats.revenue)}</p>
          </div>
          <div className="rounded-xl bg-muted/40 border border-border/50 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{t("profit_cost")}</p>
            <p className="text-sm font-bold text-foreground">{loading ? "…" : money(stats.cost)}</p>
          </div>
        </div>

        {!loading && stats.count === 0 && (
          <p className="mt-4 text-center text-xs text-muted-foreground">{t("profit_empty")}</p>
        )}

        <p className="mt-4 text-[10px] text-muted-foreground leading-relaxed">{t("profit_note")}</p>
      </div>
    </div>
  );
}