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
  price: number | null;
  cost_price: number | null;
  image_url: string | null;
  cover_image_url: string | null;
};

const LOW_STOCK_THRESHOLD = 5;
const VELOCITY_WINDOW_DAYS = 14;
const PAR_MULTIPLIER = 2; // 2× weekly average

type SortMode = "needs" | "low" | "name";

function startOfDaysAgoISO(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export const Route = createFileRoute("/stock")({ component: StockPage });

function StockPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [velocity, setVelocity] = useState<Map<string, number>>(new Map()); // qty per day, keyed by lower(name)
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortMode>("needs");

  const load = async () => {
    if (!user) return;
    const [invRes, ordRes] = await Promise.all([
      supabase
        .from("inventory")
        .select("id,name,stock,price,cost_price,image_url,cover_image_url")
        .eq("user_id", user.id)
        .order("stock", { ascending: true }),
      supabase
        .from("orders")
        .select("product,quantity,status,created_at")
        .eq("user_id", user.id)
        .eq("status", "Paid")
        .gte("created_at", startOfDaysAgoISO(VELOCITY_WINDOW_DAYS)),
    ]);
    if (invRes.error) toast.error(invRes.error.message);
    setRows((invRes.data ?? []) as Row[]);

    const perDay = new Map<string, number>();
    for (const o of (ordRes.data ?? []) as any[]) {
      const key = String(o.product ?? "").trim().toLowerCase();
      if (!key) continue;
      const qty = Number(o.quantity ?? 0);
      if (qty <= 0) continue;
      perDay.set(key, (perDay.get(key) ?? 0) + qty / VELOCITY_WINDOW_DAYS);
    }
    setVelocity(perDay);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s ? rows.filter((r) => r.name.toLowerCase().includes(s)) : rows.slice();
    const suggested = (r: Row) => {
      const v = velocity.get(r.name.trim().toLowerCase()) ?? 0;
      const par = Math.ceil(v * 7 * PAR_MULTIPLIER);
      return Math.max(0, par - Number(r.stock ?? 0));
    };
    if (sort === "name") {
      base.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "low") {
      base.sort((a, b) => Number(a.stock ?? 0) - Number(b.stock ?? 0));
    } else {
      // needs restock first
      base.sort((a, b) => {
        const diff = suggested(b) - suggested(a);
        if (diff !== 0) return diff;
        return Number(a.stock ?? 0) - Number(b.stock ?? 0);
      });
    }
    return base;
  }, [rows, q, sort, velocity]);

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
    const thr = LOW_STOCK_THRESHOLD;
    if (s <= 0) return "danger";
    if (s <= thr) return "warn";
    return "ok";
  };

  const infoFor = (r: Row): { daysLine: string; suggest: number } => {
    const v = velocity.get(r.name.trim().toLowerCase()) ?? 0;
    const stock = Number(r.stock ?? 0);
    const par = Math.ceil(v * 7 * PAR_MULTIPLIER);
    const suggest = Math.max(0, par - stock);
    if (v <= 0) return { daysLine: t("stock_no_velocity"), suggest };
    const days = Math.floor(stock / v);
    return { daysLine: t("stock_days_left").replace("{n}", String(days)), suggest };
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

      <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-[11px] text-muted-foreground shrink-0">{t("stock_sort_label")}:</span>
        {(
          [
            { k: "needs", label: t("stock_sort_needs") },
            { k: "low", label: t("stock_sort_low") },
            { k: "name", label: t("stock_sort_name") },
          ] as { k: SortMode; label: string }[]
        ).map((o) => (
          <button
            key={o.k}
            onClick={() => setSort(o.k)}
            className={`shrink-0 text-[11px] font-semibold px-3 py-1 rounded-full border transition ${
              sort === o.k
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border"
            }`}
          >
            {o.label}
          </button>
        ))}
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
            const info = infoFor(r);
            return (
              <li
                key={r.id}
                className="rounded-2xl border border-border/60 bg-card p-3 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 shrink-0 rounded-xl bg-muted overflow-hidden">
                    {img ? (
                      <img src={img} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${badgeClass}`}>
                        {badgeText}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate">{info.daysLine}</span>
                    </div>
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
                </div>
                {info.suggest > 0 && (
                  <button
                    onClick={() => adjust(r, info.suggest)}
                    className="mt-2 w-full text-left text-[11px] font-semibold text-primary bg-primary/10 hover:bg-primary/15 rounded-lg px-2.5 py-1.5 active:scale-[0.99] transition"
                  >
                    {t("stock_suggest_restock").replace("{n}", String(info.suggest))}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}