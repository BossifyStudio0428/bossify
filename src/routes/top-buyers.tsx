import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Trophy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

type OrderRow = {
  id: string;
  platform_buyer_id: string | null;
  amount: number | null;
  created_at: string;
};

type BuyerStat = {
  buyerId: string;
  orders: number;
  totalSpent: number;
  lastOrderAt: string;
};

export const Route = createFileRoute("/top-buyers")({ component: TopBuyersPage });

function TopBuyersPage() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("orders" as any)
        .select("id,platform_buyer_id,amount,created_at")
        .eq("user_id", user.id)
        .eq("order_source", "tiktok")
        .eq("status", "Paid")
        .not("platform_buyer_id", "is", null)
        .order("created_at", { ascending: false });
      if (error) toast.error(error.message);
      setOrders(((data ?? []) as any) as OrderRow[]);
      setLoading(false);
    })();
  }, [user?.id]);

  const stats = useMemo(() => {
    const map = new Map<string, BuyerStat>();
    for (const o of orders) {
      if (!o.platform_buyer_id) continue;
      const existing = map.get(o.platform_buyer_id) ?? { buyerId: o.platform_buyer_id, orders: 0, totalSpent: 0, lastOrderAt: o.created_at };
      existing.orders += 1;
      existing.totalSpent += Number(o.amount ?? 0);
      if (o.created_at > existing.lastOrderAt) existing.lastOrderAt = o.created_at;
      map.set(o.platform_buyer_id, existing);
    }
    return Array.from(map.values())
      .filter((s) => s.orders > 1) // "repeat buyer" leaderboard — a single order isn't a ranking
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }, [orders]);

  const title = lang === "zh" ? "回购客户排行" : lang === "ms" ? "Ranking Pelanggan Berulang" : "Repeat Buyer Leaderboard";
  const subtitle = lang === "zh"
    ? "按固定买家编号排名，不会显示真实姓名（TikTok 平台限制）"
    : lang === "ms" ? "Berdasarkan ID pembeli, bukan nama sebenar (had platform TikTok)" : "Ranked by TikTok's stable buyer ID — never their real name (platform limitation)";

  return (
    <div className="px-4 pt-4 pb-24 space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/" className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95 transition-transform">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">{title}</h1>
      </div>
      <p className="text-xs text-muted-foreground -mt-3 ml-11">{subtitle}</p>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">…</p>
      ) : stats.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          {lang === "zh" ? "暂时没有回购超过 1 次的客户" : lang === "ms" ? "Tiada pelanggan berulang lagi" : "No repeat buyers yet"}
        </p>
      ) : (
        <div className="space-y-2">
          {stats.map((s, idx) => (
            <div key={s.buyerId} className="rounded-2xl bg-card border border-border/60 p-3.5 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                {idx === 0 ? <Trophy className="h-4 w-4" /> : `#${idx + 1}`}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  {lang === "zh" ? `买家 #${idx + 1}` : lang === "ms" ? `Pembeli #${idx + 1}` : `Buyer #${idx + 1}`}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {lang === "zh" ? `${s.orders} 笔订单 · 最近 ${new Date(s.lastOrderAt).toLocaleDateString("en-MY")}` : lang === "ms" ? `${s.orders} pesanan · terakhir ${new Date(s.lastOrderAt).toLocaleDateString("en-MY")}` : `${s.orders} orders · last ${new Date(s.lastOrderAt).toLocaleDateString("en-MY")}`}
                </p>
              </div>
              <p className="text-sm font-bold text-primary shrink-0">RM {s.totalSpent.toFixed(2)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}