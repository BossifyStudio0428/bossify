import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft,
  PackageX,
  Truck,
  Target,
  Tag,
  TrendingUp,
  TrendingDown,
  Pencil,
  Trash2,
  Plus,
  CalendarRange,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { getCachedPrefs, loadPrefs } from "@/lib/notifPrefs";
import type { CampaignAiSuggestions } from "@/routes/api/public/campaign-ai/suggest";
import {
  type Campaign,
  type PeriodStats,
  fetchCampaign,
  updateCampaign,
  deleteCampaign,
  fetchPeriodStats,
  dayStartISO,
  dayAfterISO,
  daysBetweenInclusive,
  addDaysToDateStr,
  pctChange,
} from "@/lib/campaignStats";

// Campaign DETAIL page — one specific campaign/event (11.11, 12.12, CNY,
// payday sale, whatever the seller set up on /campaigns). This used to be
// the entire /campaign route back when there was only ever one campaign
// slot; now every promo price, stock-prep suggestion and AI suggestion
// here is scoped to THIS campaign's id, so running several campaigns over
// the year doesn't mix their data together.
//
// Route naming: campaigns_.$campaignId.tsx (trailing underscore on
// "campaigns_") is this codebase's existing convention for "flat route,
// not nested under campaigns.tsx's layout" — same trick already used by
// inventory.tsx / inventory_.$itemId.tsx.

// AI suggestions call the backend directly via fetch() + Bearer token, NOT
// createServerFn()/useServerFn() — that RPC transport doesn't reliably work
// inside the Capacitor Android WebView (same issue and same fix as the
// global AI chat widget; see api/public/ai-chat/send.ts for the long
// version of this comment).
//
// It also has to be an ABSOLUTE url, not a relative one: on a real Android
// device, fetch("/api/...") resolves against the WebView's own local
// origin, not the deployed worker — so it was silently hitting the app's
// own HTML shell instead of this API route (surfaced as "Unexpected
// token '<', <!doctype..." when the response was JSON.parse'd). The rest
// of the codebase already established the fix — see API_ORIGIN in
// profile.tsx / connected-platforms.$platform.tsx.
const API_ORIGIN = "https://tanstack-start-app.bossifystudio.workers.dev";

async function fetchCampaignAiSuggestions(input: {
  lang: "en" | "ms" | "zh";
  campaignName: string;
  campaignStart: string;
  campaignEnd: string;
  targetRevenue: number | null;
  currentRevenue: number | null;
  currentProfit: number | null;
  orderCount: number | null;
  products: {
    id: string; name: string; stock: number; price: number; cost_price: number;
    category: string | null; salesQty14d: number;
  }[];
}): Promise<CampaignAiSuggestions> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${API_ORIGIN}/api/public/campaign-ai/suggest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  if (!res.ok) {
    let code = `HTTP_${res.status}`;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) code = j.error;
    } catch {
      // response wasn't JSON — keep the generic HTTP_xxx code
    }
    throw new Error(code);
  }
  return JSON.parse(text) as CampaignAiSuggestions;
}

type InvRow = {
  id: string;
  name: string;
  stock: number | null;
  image_url: string | null;
  category: string | null;
  price: number | null;
  cost_price: number | null;
};

type OrderRow = {
  id: string;
  code: string;
  customer_name: string;
  product: string | null;
  amount: number | null;
  status: string;
  created_at: string;
};

type VelocityOrderRow = {
  id: string;
  product: string | null;
  quantity: number | null;
  status: string;
  created_at: string;
};

type VelocityItemRow = {
  product_name: string | null;
  quantity: number | null;
};

type PromoRow = {
  id: string;
  inventory_id: string;
  original_price: number;
  promo_price: number;
  active: boolean;
  product_name: string;
  cost_price: number;
};

export const Route = createFileRoute("/campaigns_/$campaignId")({ component: CampaignDetailPage });

// A confirmed-paid order sitting unshipped for more than this many hours is
// flagged — deliberately simple (skeleton scope): no per-platform SLA rules,
// no velocity/forecast math. Just "this needs to go out, don't forget it."
const SHIP_REMINDER_HOURS = 24;

// Restock suggestion buffer — projects velocity across the full campaign
// window plus 30% headroom. Deliberately simple: no per-product seasonality,
// no separate "big sale" multiplier. Only shown once a campaign date range
// is set, since the plain /stock page already covers general-purpose restock.
const VELOCITY_WINDOW_DAYS = 14;
const CAMPAIGN_RESTOCK_BUFFER = 1.3;

function hoursAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

function startOfDaysAgoISO(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function money(n: number) {
  return `RM ${n.toFixed(2)}`;
}

function CampaignDetailPage() {
  const { campaignId } = Route.useParams();
  const { user } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();

  const [invRows, setInvRows] = useState<InvRow[]>([]);
  const [orderRows, setOrderRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lowThreshold, setLowThreshold] = useState<number>(getCachedPrefs().low_stock_threshold);
  const [activeCategory, setActiveCategory] = useState<string>("__all");
  const [orderCategories, setOrderCategories] = useState<Record<string, Set<string>>>({});
  const [velocity, setVelocity] = useState<Map<string, number>>(new Map());

  // --- This campaign (saved) + edit form (draft) ---
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [form, setForm] = useState({ name: "", start: "", end: "", targetRevenue: "" });
  const [editingCampaign, setEditingCampaign] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // --- Target-tracking / post-campaign report ---
  const [campaignStats, setCampaignStats] = useState<PeriodStats | null>(null);
  const [baselineStats, setBaselineStats] = useState<PeriodStats | null>(null);

  // --- Promotions (scoped to this campaign only) ---
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [promoProductId, setPromoProductId] = useState("");
  const [promoPrice, setPromoPrice] = useState("");
  const [savingPromo, setSavingPromo] = useState(false);
  const [showAddPromo, setShowAddPromo] = useState(false);

  // --- AI suggestions (own-data grounded; market_reference is always
  // labeled as general AI knowledge, not real-time data — see the big
  // comment in api/public/campaign-ai/suggest.ts before changing this) ---
  const [aiSuggestions, setAiSuggestions] = useState<CampaignAiSuggestions | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: inv, error: invErr }, { data: ord, error: ordErr }, prefs, loaded] = await Promise.all([
        supabase.from("inventory").select("id,name,stock,image_url,category,price,cost_price").eq("user_id", user.id),
        supabase
          .from("orders" as any)
          .select("id,code,customer_name,product,amount,status,created_at")
          .eq("user_id", user.id)
          .eq("status", "Paid")
          .order("created_at", { ascending: true })
          .limit(100),
        loadPrefs(user.id),
        fetchCampaign(user.id, campaignId),
      ]);
      if (invErr) toast.error(invErr.message);
      if (ordErr) toast.error(ordErr.message);
      setInvRows((inv ?? []) as InvRow[]);
      setOrderRows(((ord ?? []) as any) as OrderRow[]);
      setLowThreshold(prefs.low_stock_threshold);

      if (!loaded) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setCampaign(loaded);
      setForm({
        name: loaded.name,
        start: loaded.start,
        end: loaded.end,
        targetRevenue: loaded.targetRevenue != null ? String(loaded.targetRevenue) : "",
      });

      const orderIds = ((ord ?? []) as any[]).map((o) => o.id);
      if (orderIds.length > 0) {
        const { data: items } = await supabase.from("order_items" as any).select("order_id,product_id").in("order_id", orderIds);
        const productIds = Array.from(new Set(((items ?? []) as any[]).map((i) => i.product_id).filter(Boolean)));
        const catByProduct: Record<string, string> = {};
        if (productIds.length > 0) {
          const { data: invRows2 } = await supabase.from("inventory").select("id,category").in("id", productIds);
          for (const r of (invRows2 ?? []) as any[]) catByProduct[r.id] = r.category || "";
        }
        const map: Record<string, Set<string>> = {};
        for (const it of (items ?? []) as any[]) {
          const c = it.product_id ? catByProduct[it.product_id] : "";
          if (!c) continue;
          (map[it.order_id] ??= new Set()).add(c);
        }
        setOrderCategories(map);
      }

      setLoading(false);
    })();
  }, [user?.id, campaignId]);

  // Sale velocity (qty/day over the trailing 14 days) — same window/shape as
  // /stock, kept independent so this page doesn't depend on that route.
  // Computed from order LINE ITEMS, not the order-level "product" text
  // field (every item in that order joined with commas, e.g. "T恤 (S) ×
  // 2, 裤子 × 1" — matching that whole string against a single product
  // name silently dropped every multi-item order from the velocity count).
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,product,quantity,status,created_at")
        .eq("user_id", user.id)
        .eq("status", "Paid")
        .gte("created_at", startOfDaysAgoISO(VELOCITY_WINDOW_DAYS));
      const orderIds = ((data ?? []) as VelocityOrderRow[]).map((o) => o.id).filter(Boolean);
      const perDay = new Map<string, number>();
      if (orderIds.length > 0) {
        const { data: items } = await supabase
          .from("order_items" as any)
          .select("product_name,quantity")
          .in("order_id", orderIds);
        for (const it of (items ?? []) as VelocityItemRow[]) {
          const key = String(it.product_name ?? "").trim().toLowerCase();
          if (!key) continue;
          const qty = Number(it.quantity ?? 0);
          if (qty <= 0) continue;
          perDay.set(key, (perDay.get(key) ?? 0) + qty / VELOCITY_WINDOW_DAYS);
        }
      }
      setVelocity(perDay);
    })();
  }, [user?.id]);

  const loadPromos = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("campaign_promotions" as any)
      .select("id,inventory_id,original_price,promo_price,active,inventory(name,cost_price)")
      .eq("user_id", user.id)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    setPromos(
      ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        inventory_id: r.inventory_id,
        original_price: Number(r.original_price ?? 0),
        promo_price: Number(r.promo_price ?? 0),
        active: !!r.active,
        product_name: r.inventory?.name ?? "",
        cost_price: Number(r.inventory?.cost_price ?? 0),
      })),
    );
  };
  useEffect(() => {
    loadPromos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, campaignId]);

  // Target-tracking stats for the saved campaign window, refetched whenever
  // the saved (not draft) start/end changes.
  useEffect(() => {
    if (!user || !campaign?.start || !campaign?.end) {
      setCampaignStats(null);
      setBaselineStats(null);
      return;
    }
    (async () => {
      const stats = await fetchPeriodStats(user.id, dayStartISO(campaign.start), dayAfterISO(campaign.end));
      setCampaignStats(stats);

      // Post-campaign report only once the campaign has actually ended —
      // compares against an equal-length baseline period immediately before
      // the campaign started (simplest "what's normal" reference available
      // without a full historical-average engine).
      const ended = new Date(`${campaign.end}T23:59:59`) < new Date();
      if (ended) {
        const days = daysBetweenInclusive(campaign.start, campaign.end);
        const baselineEnd = dayStartISO(campaign.start);
        const baselineStart = dayStartISO(addDaysToDateStr(campaign.start, -days));
        const base = await fetchPeriodStats(user.id, baselineStart, baselineEnd);
        setBaselineStats(base);
      } else {
        setBaselineStats(null);
      }
    })();
  }, [user?.id, campaign?.start, campaign?.end]);

  const saveCampaign = async () => {
    if (!user || !campaign) return;
    if (!form.name.trim()) {
      toast.error(lang === "zh" ? "请填写活动名称" : lang === "ms" ? "Sila isi nama kempen" : "Enter a campaign name");
      return;
    }
    if (!form.start || !form.end) {
      toast.error(lang === "zh" ? "请选择开始和结束日期" : lang === "ms" ? "Sila pilih tarikh mula dan tamat" : "Pick a start and end date");
      return;
    }
    if (form.start > form.end) {
      toast.error(lang === "zh" ? "开始日期不能晚于结束日期" : lang === "ms" ? "Tarikh mula tidak boleh lepas tarikh tamat" : "Start date can't be after end date");
      return;
    }
    setSavingCampaign(true);
    try {
      const targetRevenue = form.targetRevenue ? Number(form.targetRevenue) : null;
      await updateCampaign(campaign.id, { name: form.name, start: form.start, end: form.end, targetRevenue });
      setCampaign({ ...campaign, name: form.name.trim() || "Untitled", start: form.start, end: form.end, targetRevenue });
      setEditingCampaign(false);
      toast.success(lang === "zh" ? "已保存" : lang === "ms" ? "Disimpan" : "Saved");
    } catch (e: any) {
      toast.error(String(e?.message ?? e ?? "Failed"));
    } finally {
      setSavingCampaign(false);
    }
  };

  const removeCampaign = async () => {
    if (!campaign) return;
    if (!window.confirm(
      lang === "zh" ? `确定要删除「${campaign.name}」这个活动吗？活动特价记录也会一起删除，此操作无法撤销。`
      : lang === "ms" ? `Padam kempen "${campaign.name}"? Harga promosi untuk kempen ini turut dipadam. Ini tidak boleh dibuat asal.`
      : `Delete "${campaign.name}"? Its promo prices will be deleted too. This can't be undone.`
    )) return;
    setDeleting(true);
    try {
      await deleteCampaign(campaign.id);
      toast.success(lang === "zh" ? "已删除" : lang === "ms" ? "Dipadam" : "Deleted");
      navigate({ to: "/campaigns" });
    } catch (e: any) {
      toast.error(String(e?.message ?? e ?? "Failed"));
      setDeleting(false);
    }
  };

  const generateAiSuggestions = async () => {
    if (!user || !campaign) return;
    setAiLoading(true);
    try {
      const products = invRows.slice(0, 200).map((i) => ({
        id: i.id,
        name: i.name,
        stock: Number(i.stock ?? 0),
        price: Number(i.price ?? 0),
        cost_price: Number(i.cost_price ?? 0),
        category: i.category ?? null,
        salesQty14d: Math.round((velocity.get(i.name.trim().toLowerCase()) ?? 0) * VELOCITY_WINDOW_DAYS),
      }));
      const result = await fetchCampaignAiSuggestions({
        lang: lang as "en" | "ms" | "zh",
        campaignName: campaign.name,
        campaignStart: campaign.start,
        campaignEnd: campaign.end,
        targetRevenue: campaign.targetRevenue,
        currentRevenue: campaignStats?.revenue ?? null,
        currentProfit: campaignStats?.profit ?? null,
        orderCount: campaignStats?.count ?? null,
        products,
      });
      setAiSuggestions(result);
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? "");
      if (msg.includes("AI_RATE_LIMIT")) toast.error(lang === "zh" ? "AI 请求太频繁，稍后再试" : lang === "ms" ? "Terlalu kerap, cuba sebentar lagi" : "Too many requests, try again shortly");
      else if (msg.includes("AI_CREDIT_EXHAUSTED")) toast.error(lang === "zh" ? "AI 额度已用完" : lang === "ms" ? "Kredit AI habis" : "AI credit exhausted");
      else toast.error(lang === "zh" ? "生成建议失败，请重试" : lang === "ms" ? "Gagal menjana cadangan" : "Failed to generate suggestions");
    } finally {
      setAiLoading(false);
    }
  };

  const addPromo = async () => {
    if (!user) return;
    const item = invRows.find((i) => i.id === promoProductId);
    const price = Number(promoPrice);
    if (!item || !(price > 0)) {
      toast.error(lang === "zh" ? "请选商品并填写正确的特价" : lang === "ms" ? "Pilih produk dan masukkan harga promosi yang sah" : "Select a product and enter a valid promo price");
      return;
    }
    setSavingPromo(true);
    const { error } = await supabase.from("campaign_promotions" as any).insert({
      user_id: user.id,
      campaign_id: campaignId,
      inventory_id: item.id,
      original_price: item.price ?? 0,
      promo_price: price,
      active: true,
    });
    setSavingPromo(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPromoProductId("");
    setPromoPrice("");
    setShowAddPromo(false);
    toast.success(lang === "zh" ? "已添加" : lang === "ms" ? "Ditambah" : "Added");
    loadPromos();
  };

  const togglePromo = async (p: PromoRow) => {
    const prev = promos;
    setPromos((rows) => rows.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)));
    const { error } = await supabase.from("campaign_promotions" as any).update({ active: !p.active }).eq("id", p.id);
    if (error) {
      setPromos(prev);
      toast.error(error.message);
    }
  };

  const deletePromo = async (p: PromoRow) => {
    const prev = promos;
    setPromos((rows) => rows.filter((x) => x.id !== p.id));
    const { error } = await supabase.from("campaign_promotions" as any).delete().eq("id", p.id);
    if (error) {
      setPromos(prev);
      toast.error(error.message);
    }
  };

  const invByCategory = useMemo(
    () => (activeCategory === "__all" ? invRows : invRows.filter((i) => (i.category ?? "") === activeCategory)),
    [invRows, activeCategory],
  );
  const lowStock = useMemo(
    () => invByCategory.filter((i) => Number(i.stock ?? 0) > 0 && Number(i.stock ?? 0) <= lowThreshold)
      .sort((a, b) => Number(a.stock ?? 0) - Number(b.stock ?? 0)),
    [invByCategory, lowThreshold],
  );
  const outOfStock = useMemo(() => invByCategory.filter((i) => Number(i.stock ?? 0) <= 0), [invByCategory]);
  const needsShipping = useMemo(
    () => orderRows.filter((o) => hoursAgo(o.created_at) >= SHIP_REMINDER_HOURS)
      .filter((o) => activeCategory === "__all" || orderCategories[o.id]?.has(activeCategory)),
    [orderRows, activeCategory, orderCategories],
  );

  const campaignDays = campaign?.start && campaign?.end ? daysBetweenInclusive(campaign.start, campaign.end) : 0;
  const suggestQty = (it: InvRow): number => {
    if (!campaignDays) return 0;
    const v = velocity.get(it.name.trim().toLowerCase()) ?? 0;
    if (v <= 0) return 0;
    const projected = Math.ceil(v * campaignDays * CAMPAIGN_RESTOCK_BUFFER);
    return Math.max(0, projected - Number(it.stock ?? 0));
  };

  const targetPct = campaign?.targetRevenue && campaign.targetRevenue > 0 && campaignStats
    ? Math.min(100, Math.round((campaignStats.revenue / campaign.targetRevenue) * 100))
    : null;
  const daysLeft = campaign?.end ? Math.ceil((new Date(`${campaign.end}T23:59:59`).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const isPostCampaign = !!(campaign?.end && new Date(`${campaign.end}T23:59:59`) < new Date());

  const subtitle = lang === "zh"
    ? "设定目标、管理促销价、备货、追发货 — 都在这一页"
    : lang === "ms" ? "Tetapkan sasaran, urus harga promosi, sedia stok, jejak penghantaran — semua di sini" : "Set your target, manage promo prices, prep stock, track shipping — all here";

  if (notFound) {
    return (
      <div className="px-4 pt-4 pb-24 space-y-4">
        <div className="flex items-center gap-2">
          <Link to="/campaigns" className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold text-foreground">
            {lang === "zh" ? "活动" : lang === "ms" ? "Kempen" : "Campaign"}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground text-center py-10">
          {lang === "zh" ? "找不到这个活动，可能已经被删除了" : lang === "ms" ? "Kempen ini tidak ditemui — mungkin telah dipadam" : "This campaign wasn't found — it may have been deleted"}
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-24 space-y-5">
      <div className="flex items-center gap-2">
        <Link to="/campaigns" className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground truncate">{campaign?.name || "…"}</h1>
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

      {/* Campaign settings */}
      <section className="rounded-2xl bg-card border border-border/60 p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">
              {lang === "zh" ? "活动设定" : lang === "ms" ? "Tetapan kempen" : "Campaign settings"}
            </h2>
          </div>
          {!editingCampaign && campaign && (
            <div className="flex items-center gap-1">
              <button onClick={() => setEditingCampaign(true)} className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground active:scale-95">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button disabled={deleting} onClick={removeCampaign} className="h-7 w-7 rounded-full flex items-center justify-center text-red-600 active:scale-95 disabled:opacity-60">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {editingCampaign ? (
          <div className="space-y-2.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                {lang === "zh" ? "活动名称" : lang === "ms" ? "Nama kempen" : "Campaign name"}
              </label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded-xl bg-background border border-border/60 px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  {lang === "zh" ? "开始日期" : lang === "ms" ? "Tarikh mula" : "Start date"}
                </label>
                <input type="date" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} className="w-full rounded-xl bg-background border border-border/60 px-3 py-2 text-sm" />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  {lang === "zh" ? "结束日期" : lang === "ms" ? "Tarikh tamat" : "End date"}
                </label>
                <input type="date" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} className="w-full rounded-xl bg-background border border-border/60 px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                {lang === "zh" ? "销售目标 (RM，可选)" : lang === "ms" ? "Sasaran jualan (RM, pilihan)" : "Sales target (RM, optional)"}
              </label>
              <input type="number" inputMode="decimal" value={form.targetRevenue} onChange={(e) => setForm((f) => ({ ...f, targetRevenue: e.target.value }))} className="w-full rounded-xl bg-background border border-border/60 px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              {campaign && (
                <button
                  onClick={() => {
                    setForm({ name: campaign.name, start: campaign.start, end: campaign.end, targetRevenue: campaign.targetRevenue != null ? String(campaign.targetRevenue) : "" });
                    setEditingCampaign(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-border/60 text-sm font-semibold text-muted-foreground"
                >
                  {lang === "zh" ? "取消" : lang === "ms" ? "Batal" : "Cancel"}
                </button>
              )}
              <button disabled={savingCampaign} onClick={saveCampaign} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
                {savingCampaign ? "…" : (lang === "zh" ? "保存" : lang === "ms" ? "Simpan" : "Save")}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">{campaign?.name}</p>
              <p className="text-xs text-muted-foreground">
                {campaign?.start} → {campaign?.end}
                {daysLeft != null && daysLeft >= 0 && (
                  <span className="ml-1.5 text-primary font-semibold">
                    {lang === "zh" ? `还剩 ${daysLeft} 天` : lang === "ms" ? `${daysLeft} hari lagi` : `${daysLeft}d left`}
                  </span>
                )}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Target progress */}
      {campaign?.start && campaign?.end && campaign.targetRevenue != null && campaign.targetRevenue > 0 && (
        <section className="rounded-2xl bg-card border border-border/60 p-3.5 space-y-2">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">
              {lang === "zh" ? "目标进度" : lang === "ms" ? "Kemajuan sasaran" : "Target progress"}
            </h2>
          </div>
          {campaignStats ? (
            <>
              <div className="flex items-baseline justify-between">
                <p className="text-lg font-bold text-foreground">{money(campaignStats.revenue)}</p>
                <p className="text-xs text-muted-foreground">
                  {lang === "zh" ? "目标" : lang === "ms" ? "Sasaran" : "Target"} {money(campaign.targetRevenue)}
                </p>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${targetPct ?? 0}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{targetPct}% {lang === "zh" ? "已达成" : lang === "ms" ? "dicapai" : "reached"}</span>
                <span>
                  {lang === "zh" ? `利润 ${money(campaignStats.profit)} · ${campaignStats.count} 笔订单` : lang === "ms" ? `Untung ${money(campaignStats.profit)} · ${campaignStats.count} pesanan` : `Profit ${money(campaignStats.profit)} · ${campaignStats.count} orders`}
                </span>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground py-2">…</p>
          )}
        </section>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">…</p>
      ) : (
        <>
          {/* Stock section */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <PackageX className="h-4 w-4 text-amber-600" />
              <h2 className="text-sm font-bold">
                {lang === "zh" ? "库存不足，赶紧补货" : lang === "ms" ? "Stok rendah — segera bekalkan semula" : "Low stock — restock soon"}
              </h2>
            </div>
            {outOfStock.length === 0 && lowStock.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-2xl bg-card border border-border/60 p-3">
                {lang === "zh" ? "库存暂时没问题" : lang === "ms" ? "Stok anda okay buat masa ini" : "Stock looks fine for now"}
              </p>
            ) : (
              <div className="rounded-2xl bg-card border border-border/60 divide-y divide-border/40">
                {outOfStock.map((it) => {
                  const suggest = suggestQty(it);
                  return (
                    <div key={it.id} className="flex items-center gap-3 p-3">
                      <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0 overflow-hidden">
                        {it.image_url ? <img src={it.image_url} className="h-full w-full object-cover" /> : <PackageX className="h-4 w-4 text-red-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{it.name}</p>
                        {suggest > 0 && (
                          <p className="text-[11px] text-primary font-semibold">
                            {lang === "zh" ? `建议补 ${suggest} 件（够撑完活动）` : lang === "ms" ? `Cadangan tambah ${suggest} unit (cukup untuk kempen)` : `Suggest +${suggest} to last the campaign`}
                          </p>
                        )}
                      </div>
                      <span className="text-[11px] font-bold text-red-600 shrink-0">
                        {lang === "zh" ? "缺货" : lang === "ms" ? "Kehabisan stok" : "Out of stock"}
                      </span>
                    </div>
                  );
                })}
                {lowStock.map((it) => {
                  const suggest = suggestQty(it);
                  return (
                    <div key={it.id} className="flex items-center gap-3 p-3">
                      <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 overflow-hidden">
                        {it.image_url ? <img src={it.image_url} className="h-full w-full object-cover" /> : <PackageX className="h-4 w-4 text-amber-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{it.name}</p>
                        {suggest > 0 && (
                          <p className="text-[11px] text-primary font-semibold">
                            {lang === "zh" ? `建议补 ${suggest} 件（够撑完活动）` : lang === "ms" ? `Cadangan tambah ${suggest} unit (cukup untuk kempen)` : `Suggest +${suggest} to last the campaign`}
                          </p>
                        )}
                      </div>
                      <span className="text-[11px] font-bold text-amber-600 shrink-0">
                        {lang === "zh" ? `剩 ${it.stock}` : lang === "ms" ? `Baki ${it.stock}` : `${it.stock} left`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Promotions */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold">
                  {lang === "zh" ? "活动特价" : lang === "ms" ? "Harga promosi" : "Promo prices"}
                </h2>
              </div>
              <button onClick={() => setShowAddPromo((s) => !s)} className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center active:scale-95">
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {showAddPromo && (
              <div className="rounded-2xl bg-card border border-border/60 p-3 space-y-2">
                <select value={promoProductId} onChange={(e) => setPromoProductId(e.target.value)} className="w-full rounded-xl bg-background border border-border/60 px-3 py-2 text-sm">
                  <option value="">{lang === "zh" ? "选择商品" : lang === "ms" ? "Pilih produk" : "Select a product"}</option>
                  {invRows.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}{i.price != null ? ` (RM ${Number(i.price).toFixed(2)})` : ""}</option>
                  ))}
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder={lang === "zh" ? "特价 (RM)" : lang === "ms" ? "Harga promosi (RM)" : "Promo price (RM)"}
                  value={promoPrice}
                  onChange={(e) => setPromoPrice(e.target.value)}
                  className="w-full rounded-xl bg-background border border-border/60 px-3 py-2 text-sm"
                />
                <button disabled={savingPromo} onClick={addPromo} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
                  {savingPromo ? "…" : (lang === "zh" ? "添加特价" : lang === "ms" ? "Tambah" : "Add promo")}
                </button>
              </div>
            )}

            {promos.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-2xl bg-card border border-border/60 p-3">
                {lang === "zh" ? "还没设置活动特价" : lang === "ms" ? "Belum ada harga promosi" : "No promo prices set yet"}
              </p>
            ) : (
              <div className="rounded-2xl bg-card border border-border/60 divide-y divide-border/40">
                {promos.map((p) => {
                  const margin = p.promo_price - p.cost_price;
                  return (
                    <div key={p.id} className="flex items-center gap-3 p-3">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${p.active ? "" : "text-muted-foreground line-through"}`}>{p.product_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          <span className="line-through">{money(p.original_price)}</span>{" → "}
                          <span className="font-semibold text-primary">{money(p.promo_price)}</span>
                          {" · "}
                          <span className={margin >= 0 ? "text-emerald-600" : "text-red-600"}>
                            {lang === "zh" ? "毛利" : lang === "ms" ? "margin" : "margin"} {money(margin)}
                          </span>
                        </p>
                      </div>
                      <button onClick={() => togglePromo(p)} className={`text-[11px] font-bold px-2 py-1 rounded-full shrink-0 ${p.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {p.active ? (lang === "zh" ? "生效中" : lang === "ms" ? "Aktif" : "Active") : (lang === "zh" ? "已停用" : lang === "ms" ? "Tidak aktif" : "Off")}
                      </button>
                      <button onClick={() => deletePromo(p)} className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground shrink-0 active:scale-95">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* AI suggestions — only once a campaign period is set, since the
              suggestions are built around that window's target/progress. */}
          {campaign?.start && campaign?.end && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-bold">
                    {lang === "zh" ? "AI 建议" : lang === "ms" ? "Cadangan AI" : "AI suggestions"}
                  </h2>
                </div>
                <button
                  disabled={aiLoading}
                  onClick={generateAiSuggestions}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-full bg-primary/10 text-primary disabled:opacity-60"
                >
                  <RefreshCw className={`h-3 w-3 ${aiLoading ? "animate-spin" : ""}`} />
                  {aiSuggestions
                    ? (lang === "zh" ? "重新生成" : lang === "ms" ? "Jana semula" : "Regenerate")
                    : (lang === "zh" ? "生成建议" : lang === "ms" ? "Jana cadangan" : "Generate")}
                </button>
              </div>

              {!aiSuggestions && !aiLoading && (
                <p className="text-xs text-muted-foreground rounded-2xl bg-card border border-border/60 p-3">
                  {lang === "zh" ? "根据你的库存、价格和活动进度，AI 给出具体建议" : lang === "ms" ? "AI beri cadangan berdasarkan stok, harga dan kemajuan kempen anda" : "AI suggestions based on your stock, pricing, and campaign progress"}
                </p>
              )}

              {aiLoading && (
                <p className="text-xs text-muted-foreground rounded-2xl bg-card border border-border/60 p-3 text-center">…</p>
              )}

              {aiSuggestions && !aiLoading && (
                <div className="space-y-2">
                  {aiSuggestions.own_data_suggestions.length > 0 && (
                    <div className="rounded-2xl bg-card border border-border/60 p-3.5 space-y-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                        {lang === "zh" ? "根据你的数据" : lang === "ms" ? "Berdasarkan data anda" : "Based on your data"}
                      </p>
                      <ul className="space-y-1.5">
                        {aiSuggestions.own_data_suggestions.map((s, idx) => (
                          <li key={idx} className="text-sm text-foreground flex gap-2">
                            <span className="text-primary shrink-0">•</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiSuggestions.market_reference.text && (
                    <div className="rounded-2xl bg-muted/50 border border-border/60 p-3.5 space-y-1.5">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                        {lang === "zh" ? "市场参考" : lang === "ms" ? "Rujukan pasaran" : "Market reference"}
                      </p>
                      <p className="text-sm text-foreground">{aiSuggestions.market_reference.text}</p>
                      <p className="text-[11px] text-muted-foreground italic">{aiSuggestions.market_reference.disclaimer}</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Shipping section */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold">
                {lang === "zh" ? "已付款但还没发货" : lang === "ms" ? "Sudah dibayar tapi belum dihantar" : "Paid but not yet shipped"}
              </h2>
            </div>
            {needsShipping.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-2xl bg-card border border-border/60 p-3">
                {lang === "zh" ? "发货进度正常" : lang === "ms" ? "Penghantaran anda okay" : "Shipping is on track"}
              </p>
            ) : (
              <div className="rounded-2xl bg-card border border-border/60 divide-y divide-border/40">
                {needsShipping.map((o) => {
                  const hrs = Math.round(hoursAgo(o.created_at));
                  return (
                    <Link key={o.id} to="/orders/$orderId" params={{ orderId: o.id }} className="flex items-center gap-3 p-3 active:bg-muted/40">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{o.customer_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{o.product ?? o.code}</p>
                      </div>
                      <span className="text-[11px] font-bold text-red-600 shrink-0">
                        {lang === "zh" ? `${hrs} 小时前` : lang === "ms" ? `${hrs} jam lalu` : `${hrs}h ago`}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* Post-campaign report */}
          {isPostCampaign && campaignStats && baselineStats && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold">
                  {lang === "zh" ? "活动成效报告" : lang === "ms" ? "Laporan prestasi kempen" : "Campaign performance report"}
                </h2>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {lang === "zh" ? `对比活动前等长的 ${campaignDays} 天` : lang === "ms" ? `Berbanding ${campaignDays} hari sebelum kempen` : `vs the ${campaignDays} days before the campaign`}
              </p>
              <div className="rounded-2xl bg-card border border-border/60 divide-y divide-border/40">
                {([
                  { key: "revenue", label: lang === "zh" ? "销售额" : lang === "ms" ? "Jualan" : "Revenue", kind: "money", cur: campaignStats.revenue, base: baselineStats.revenue },
                  { key: "profit", label: lang === "zh" ? "利润" : lang === "ms" ? "Untung" : "Profit", kind: "money", cur: campaignStats.profit, base: baselineStats.profit },
                  { key: "count", label: lang === "zh" ? "订单数" : lang === "ms" ? "Pesanan" : "Orders", kind: "count", cur: campaignStats.count, base: baselineStats.count },
                ] as const).map((row) => {
                  const pct = pctChange(row.cur, row.base);
                  const up = pct >= 0;
                  const fmt = (n: number) => (row.kind === "count" ? String(n) : money(n));
                  return (
                    <div key={row.key} className="flex items-center gap-3 p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{row.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {fmt(row.cur)} ({lang === "zh" ? "平常" : lang === "ms" ? "biasa" : "usual"} {fmt(row.base)})
                        </p>
                      </div>
                      <span className={`flex items-center gap-1 text-xs font-bold shrink-0 ${up ? "text-emerald-600" : "text-red-600"}`}>
                        {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {up ? "+" : ""}{pct.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}