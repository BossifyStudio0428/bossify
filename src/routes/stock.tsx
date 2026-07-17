import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Minus, Plus, Search } from "lucide-react";
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
  image_url: string | null;
  cover_image_url: string | null;
};

export const Route = createFileRoute("/stock")({ component: StockPage });

function StockPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("inventory")
      .select("id,name,stock,low_stock_threshold,price,cost_price,image_url,cover_image_url")
      .eq("user_id", user.id)
      .order("stock", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(s));
  }, [rows, q]);

  const adjust = async (r: Row, delta: number) => {
    const next = Math.max(0, Number(r.stock ?? 0) + delta);
    const prev = rows;
    setRows((p) => p.map((x) => (x.id === r.id ? { ...x, stock: next } : x)));
    const { error } = await supabase.from("inventory").update({ stock: next }).eq("id", r.id);
    if (error) {
      setRows(prev);
      toast.error(error.message);
    }
  };

  const tone = (r: Row): "danger" | "warn" | "ok" => {
    const s = Number(r.stock ?? 0);
    const thr = Number(r.low_stock_threshold ?? 5);
    if (s <= 0) return "danger";
    if (s <= thr) return "warn";
    return "ok";
  };

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-2">
        <Link to="/" className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">{t("stock_title")}</h1>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 ml-11">{t("stock_subtitle")}</p>

      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border/60 bg-card px-3 h-11">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search")}
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {loading ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">{t("stock_empty")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {filtered.map((r) => {
            const st = tone(r);
            const badgeClass =
              st === "danger"
                ? "bg-red-100 text-red-700"
                : st === "warn"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700";
            const badgeText =
              st === "danger" ? t("stock_badge_out") : st === "warn" ? t("stock_badge_low") : t("stock_badge_ok");
            const img = r.cover_image_url || r.image_url;
            return (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 shadow-[var(--shadow-card)]"
              >
                <div className="h-12 w-12 shrink-0 rounded-xl bg-muted overflow-hidden">
                  {img ? (
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                  <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${badgeClass}`}>
                    {badgeText}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    aria-label="decrement"
                    onClick={() => adjust(r, -1)}
                    className="h-8 w-8 rounded-full border border-border flex items-center justify-center active:scale-95"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold">{Number(r.stock ?? 0)}</span>
                  <button
                    aria-label="increment"
                    onClick={() => adjust(r, 1)}
                    className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}