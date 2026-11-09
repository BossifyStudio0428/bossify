import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, AlertCircle, Clock, PackageSearch } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

type InvRow = {
  id: string;
  name: string;
  cost_price: number | null;
  packaging_cost: number | null;
  stock: number | null;
  category: string | null;
};

type OrderRow = {
  id: string;
  code: string;
  product: string | null;
  amount: number | null;
  financial_status: string | null;
  platform_metadata: any;
  created_at: string;
};

export const Route = createFileRoute("/cost-health")({ component: CostHealthPage });

function CostHealthPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [invRows, setInvRows] = useState<InvRow[]>([]);
  const [orderRows, setOrderRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>("__all");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: inv, error: invErr }, { data: ord, error: ordErr }] = await Promise.all([
        supabase.from("inventory").select("id,name,cost_price,packaging_cost,stock,category").eq("user_id", user.id),
        supabase
          .from("orders" as any)
          .select("id,code,product,amount,financial_status,platform_metadata,created_at")
          .eq("user_id", user.id)
          .eq("order_source", "tiktok")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (invErr) toast.error(invErr.message);
      if (ordErr) toast.error(ordErr.message);
      setInvRows((inv ?? []) as InvRow[]);
      setOrderRows(((ord ?? []) as any) as OrderRow[]);
      setLoading(false);
    })();
  }, [user?.id]);

  const invByCategory = useMemo(
    () => (activeCategory === "__all" ? invRows : invRows.filter((i) => (i.category ?? "") === activeCategory)),
    [invRows, activeCategory],
  );
  const missingCost = useMemo(
    () => invByCategory.filter((i) => !i.cost_price || Number(i.cost_price) <= 0),
    [invByCategory],
  );
  const missingPackaging = useMemo(
    () => invByCategory.filter((i) => i.packaging_cost == null),
    [invByCategory],
  );
  const stillPending = useMemo(
    () => orderRows.filter((o) => o.financial_status === "pending"),
    [orderRows],
  );
  const estimatedFee = useMemo(
    () => orderRows.filter((o) => o.financial_status === "complete" && o.platform_metadata?.platform_fee_source === "estimate"),
    [orderRows],
  );

  const title = lang === "zh" ? "成本健康检查" : lang === "ms" ? "Semakan Kesihatan Kos" : "Cost Health";
  const subtitle = lang === "zh"
    ? "这些数字，代表你的净利润有多可信"
    : lang === "ms" ? "Ini menunjukkan sejauh mana anda boleh percaya angka untung bersih anda" : "This shows how much you can trust your net profit numbers";

  const Section = ({
    icon: Icon,
    tone,
    title: secTitle,
    desc,
    items,
    emptyText,
    render,
  }: {
    icon: React.ComponentType<{ className?: string }>;
    tone: "danger" | "warn";
    title: string;
    desc: string;
    items: any[];
    emptyText: string;
    render: (item: any) => React.ReactNode;
  }) => (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${tone === "danger" ? "text-red-600" : "text-amber-600"}`} />
        <h2 className="text-sm font-bold">{secTitle} ({items.length})</h2>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">{desc}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground rounded-2xl bg-card border border-border/60 p-3">{emptyText}</p>
      ) : (
        <div className="rounded-2xl bg-card border border-border/60 divide-y divide-border/40 max-h-64 overflow-y-auto">
          {items.map((it) => render(it))}
        </div>
      )}
    </section>
  );

  return (
    <div className="px-4 pt-4 pb-24 space-y-5 lg:max-w-5xl lg:mx-auto lg:px-8 lg:pt-8">
      <div className="flex items-center gap-2">
        <Link to="/" className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95 transition-transform">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">{title}</h1>
      </div>
      <p className="text-xs text-muted-foreground -mt-3 ml-11">{subtitle}</p>

      {(() => {
        const cats = Array.from(new Set(invRows.map((i) => i.category).filter(Boolean))) as string[];
        if (cats.length === 0) return null;
        return (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveCategory("__all")}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${activeCategory === "__all" ? "bg-primary text-primary-foreground" : "bg-card border border-border/60 text-muted-foreground"}`}
            >
              {lang === "zh" ? "全部分类" : lang === "ms" ? "Semua kategori" : "All categories"}
            </button>
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCategory(c)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${activeCategory === c ? "bg-primary text-primary-foreground" : "bg-card border border-border/60 text-muted-foreground"}`}
              >
                {c}
              </button>
            ))}
          </div>
        );
      })()}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">…</p>
      ) : (
        <div className="lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start lg:space-y-0 space-y-5">
          <Section
            icon={PackageSearch}
            tone="danger"
            title={lang === "zh" ? "商品没填成本价" : lang === "ms" ? "Produk tiada kos" : "Products missing cost price"}
            desc={lang === "zh" ? "这些商品的利润数字目前不可信（成本按 0 算）" : lang === "ms" ? "Untung produk ini tidak boleh dipercayai (kos dikira RM0)" : "Profit for these is not trustworthy (cost counted as RM0)"}
            items={missingCost}
            emptyText={lang === "zh" ? "全部商品都有成本价" : lang === "ms" ? "Semua produk ada kos" : "All products have a cost price"}
            render={(it: InvRow) => (
              <Link key={it.id} to="/inventory/$itemId" params={{ itemId: it.id }} className="flex items-center gap-3 p-3 active:bg-muted/40">
                <p className="text-sm font-semibold flex-1 min-w-0 truncate">{it.name}</p>
                <span className="text-[11px] font-bold text-red-600 shrink-0">
                  {lang === "zh" ? "点击填写" : lang === "ms" ? "Tekan untuk isi" : "Tap to fill"}
                </span>
              </Link>
            )}
          />

          <Section
            icon={PackageSearch}
            tone="warn"
            title={lang === "zh" ? "商品没设定包装成本" : lang === "ms" ? "Produk tiada kos pembungkusan" : "Products missing packaging cost"}
            desc={lang === "zh" ? "如果你的商品有额外包装费，没填会低估成本" : lang === "ms" ? "Jika ada kos pembungkusan tambahan, kos akan dianggarkan rendah" : "If your product has extra packaging cost, leaving this blank understates cost"}
            items={missingPackaging}
            emptyText={lang === "zh" ? "全部商品都设定了包装成本" : lang === "ms" ? "Semua produk ada kos pembungkusan" : "All products have packaging cost set"}
            render={(it: InvRow) => (
              <Link key={it.id} to="/inventory/$itemId" params={{ itemId: it.id }} className="flex items-center gap-3 p-3 active:bg-muted/40">
                <p className="text-sm font-semibold flex-1 min-w-0 truncate">{it.name}</p>
                <span className="text-[11px] font-bold text-amber-600 shrink-0">
                  {lang === "zh" ? "点击设定" : lang === "ms" ? "Tekan untuk tetapkan" : "Tap to set"}
                </span>
              </Link>
            )}
          />

          <Section
            icon={Clock}
            tone="warn"
            title={lang === "zh" ? "TikTok 订单还没同步完成" : lang === "ms" ? "Pesanan TikTok belum disegerak" : "TikTok orders not yet synced"}
            desc={lang === "zh" ? "这些订单还没有真实金额，暂时不算进报表" : lang === "ms" ? "Pesanan ini belum ada jumlah sebenar" : "These don't have real amounts yet"}
            items={stillPending}
            emptyText={lang === "zh" ? "没有卡住的订单" : lang === "ms" ? "Tiada pesanan tersekat" : "No stuck orders"}
            render={(o: OrderRow) => (
              <div key={o.id} className="flex items-center gap-3 p-3">
                <p className="text-sm font-semibold flex-1 min-w-0 truncate">{o.product ?? o.code}</p>
                <span className="text-[11px] text-muted-foreground shrink-0">{o.code}</span>
              </div>
            )}
          />

          <Section
            icon={AlertCircle}
            tone="warn"
            title={lang === "zh" ? "平台抽成还是估算值" : lang === "ms" ? "Yuran platform masih anggaran" : "Platform fee still estimated"}
            desc={lang === "zh" ? "这些订单还没结算，抽成用固定%估算，不是真实扣款" : lang === "ms" ? "Pesanan ini belum diselesaikan; yuran adalah anggaran" : "Not yet settled by TikTok; fee shown is an estimate, not the real deduction"}
            items={estimatedFee}
            emptyText={lang === "zh" ? "没有卡在估算阶段的订单" : lang === "ms" ? "Tiada pesanan dalam anggaran" : "No orders stuck on estimates"}
            render={(o: OrderRow) => (
              <div key={o.id} className="flex items-center gap-3 p-3">
                <p className="text-sm font-semibold flex-1 min-w-0 truncate">{o.product ?? o.code}</p>
                <span className="text-[11px] text-muted-foreground shrink-0">RM {Number(o.amount ?? 0).toFixed(2)}</span>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}