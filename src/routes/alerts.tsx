import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, AlertTriangle, PackageX, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

type Row = {
  id: string;
  name: string;
  stock: number | null;
  low_stock_threshold: number | null;
  price: number | null;
  cost_price: number | null;
};

export const Route = createFileRoute("/alerts")({ component: AlertsPage });

function AlertsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("id,name,stock,low_stock_threshold,price,cost_price")
        .eq("user_id", user.id);
      if (error) toast.error(error.message);
      setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
  }, [user?.id]);

  const groups = useMemo(() => {
    const out: Row[] = [];
    const low: Row[] = [];
    const losing: Row[] = [];
    for (const r of rows) {
      const s = Number(r.stock ?? 0);
      const thr = Number(r.low_stock_threshold ?? 5);
      const p = Number(r.price ?? 0);
      const c = Number(r.cost_price ?? 0);
      if (s <= 0) out.push(r);
      else if (s <= thr) low.push(r);
      if (p > 0 && c > p) losing.push(r);
    }
    return { out, low, losing };
  }, [rows]);

  const total = groups.out.length + groups.low.length + groups.losing.length;

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-2">
        <Link to="/" className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">{t("alerts_title")}</h1>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 ml-11">{t("alerts_subtitle")}</p>

      {loading ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
      ) : total === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-4xl">🎉</p>
          <p className="mt-3 text-sm text-foreground font-semibold">{t("alerts_all_good")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("alerts_all_good_sub")}</p>
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          <Section
            icon={PackageX}
            title={t("alerts_out_title")}
            desc={t("alerts_out_desc")}
            tone="danger"
            items={groups.out}
            renderMeta={(r) => t("alerts_out_meta").replace("{n}", String(Number(r.stock ?? 0)))}
          />
          <Section
            icon={AlertTriangle}
            title={t("alerts_low_title")}
            desc={t("alerts_low_desc")}
            tone="warn"
            items={groups.low}
            renderMeta={(r) =>
              t("alerts_low_meta")
                .replace("{n}", String(Number(r.stock ?? 0)))
                .replace("{thr}", String(Number(r.low_stock_threshold ?? 5)))
            }
          />
          <Section
            icon={TrendingDown}
            title={t("alerts_losing_title")}
            desc={t("alerts_losing_desc")}
            tone="danger"
            items={groups.losing}
            renderMeta={(r) => {
              const p = Number(r.price ?? 0);
              const c = Number(r.cost_price ?? 0);
              const lose = c - p;
              return t("alerts_losing_meta").replace("{amt}", `RM ${lose.toFixed(2)}`);
            }}
          />
        </div>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  desc,
  tone,
  items,
  renderMeta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  tone: "danger" | "warn";
  items: Row[];
  renderMeta: (r: Row) => string;
}) {
  if (items.length === 0) return null;
  const iconClass = tone === "danger" ? "text-red-600 bg-red-100" : "text-amber-600 bg-amber-100";
  return (
    <section>
      <div className="flex items-center gap-2">
        <span className={`h-8 w-8 rounded-xl flex items-center justify-center ${iconClass}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-bold text-foreground">
            {title} <span className="text-muted-foreground font-medium">({items.length})</span>
          </h2>
          <p className="text-[11px] text-muted-foreground">{desc}</p>
        </div>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{renderMeta(r)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}