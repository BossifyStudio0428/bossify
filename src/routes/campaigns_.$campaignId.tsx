import { PAID_STATUSES } from "@/lib/orderMath";
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
import { HIDE_CAMPAIGN_AI } from "@/lib/featureFlags";
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

type CampaignTab = "stock" | "promos" | "shipping" | "report" | "ai";

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
  // Which section is open (stock prep, promo prices, shipping, report, AI).
  const [campTab, setCampTab] = useState<CampaignTab>("stock");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: inv, error: invErr }, { data: ord, error: ordErr }, prefs, loaded] = await Promise.all([
        supabase.from("inventory").select("id,name,stock,image_url,category,price,cost_price").eq("user_id", user.id),
        supabase
          .from("orders" as any)
          .select("id,code,customer_name,product,amount,status,created_at")
          .eq("user_id", user.id)
          .in("status", PAID_STATUSES)
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
        .in("status", PAID_STATUSES)
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

  const L = (zh: string, en: string, ms: string) => (lang === "zh" ? zh : lang === "ms" ? ms : en);
  const status: "upcoming" | "live" | "ended" = !campaign?.start
    ? "live"
    : new Date(`${campaign.start}T00:00:00`) > new Date()
      ? "upcoming"
      : isPostCampaign
        ? "ended"
        : "live";
  const daysToStart = campaign?.start ? Math.ceil((new Date(`${campaign.start}T00:00:00`).getTime() - Date.now()) / 86400000) : null;
  const statusLabel = status === "live" ? L("进行中", "Live", "Aktif") : status === "upcoming" ? L("未开始", "Upcoming", "Akan datang") : L("已结束", "Ended", "Tamat");
  const countdown =
    status === "upcoming" && daysToStart != null
      ? L(`${daysToStart} 天后开始`, `Starts in ${daysToStart}d`, `Mula dalam ${daysToStart} hari`)
      : status === "live" && daysLeft != null
        ? L(`还剩 ${Math.max(0, daysLeft)} 天`, `${Math.max(0, daysLeft)}d left`, `${Math.max(0, daysLeft)} hari lagi`)
        : status === "ended" && campaign?.end
          ? L(`${campaign.end} 结束`, `Ended ${campaign.end}`, `Tamat ${campaign.end}`)
          : "";
  const heroBg =
    status === "live" ? "from-primary to-fuchsia-600" : status === "upcoming" ? "from-amber-500 to-orange-500" : "from-slate-600 to-slate-500";
  const stockCount = outOfStock.length + lowStock.length;
  const activePromoCount = promos.filter((p) => p.active).length;
  const cats = Array.from(new Set(invRows.map((i) => i.category).filter(Boolean))) as string[];

  const tabs: Array<{ k: CampaignTab; label: string; count?: number; warn?: boolean }> = [
    { k: "stock", label: L("备货", "Stock", "Stok"), count: stockCount, warn: stockCount > 0 },
    { k: "promos", label: L("特价", "Promos", "Promosi"), count: activePromoCount },
    { k: "shipping", label: L("发货", "Shipping", "Hantar"), count: needsShipping.length, warn: needsShipping.length > 0 },
    ...(isPostCampaign && campaignStats && baselineStats ? [{ k: "report" as CampaignTab, label: L("成效", "Report", "Laporan") }] : []),
    ...(!HIDE_CAMPAIGN_AI && campaign?.start && campaign?.end ? [{ k: "ai" as CampaignTab, label: "AI" }] : []),
  ];
  const activeTab: CampaignTab = tabs.some((tb) => tb.k === campTab) ? campTab : "stock";

  const inputCls = "w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";

  if (notFound) {
    return (
      <div className="px-4 pt-4 pb-24 space-y-4">
        <div className="flex items-center gap-2">
          <Link to="/campaigns" className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95 transition-transform">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold text-foreground">{L("活动", "Campaign", "Kempen")}</h1>
        </div>
        <p className="text-sm text-muted-foreground text-center py-10">
          {L("找不到这个活动，可能已经被删除了", "This campaign wasn't found — it may have been deleted", "Kempen ini tidak ditemui — mungkin telah dipadam")}
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 lg:max-w-4xl lg:mx-auto lg:px-8 lg:pt-8">
      <div className="flex items-center gap-2">
        <Link to="/campaigns" aria-label={L("返回", "Back", "Kembali")} className="h-9 w-9 rounded-full bg-card border border-border/60 flex items-center justify-center text-muted-foreground active:scale-95 transition-transform">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <p className="text-sm font-semibold text-muted-foreground flex-1">{L("活动", "Campaigns", "Kempen")}</p>
        {campaign && (
          <>
            <button onClick={() => setEditingCampaign(true)} aria-label={L("编辑", "Edit", "Edit")} className="h-9 w-9 rounded-full bg-card border border-border/60 flex items-center justify-center text-muted-foreground active:scale-95">
              <Pencil className="h-4 w-4" />
            </button>
            <button disabled={deleting} onClick={removeCampaign} aria-label={L("删除", "Delete", "Padam")} className="h-9 w-9 rounded-full bg-card border border-border/60 flex items-center justify-center text-red-600 active:scale-95 disabled:opacity-60">
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* Hero: name, dates, status, target and the three numbers that matter */}
      <section className={`rounded-3xl bg-gradient-to-br ${heroBg} text-white p-5 shadow-[var(--shadow-soft)] space-y-4`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight break-words">{campaign?.name || "…"}</h1>
            <p className="text-xs opacity-85 mt-1 flex items-center gap-1.5">
              <CalendarRange className="h-3.5 w-3.5" /> {campaign?.start} → {campaign?.end}
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/20">{statusLabel}</span>
            {countdown && <p className="text-[11px] opacity-90 mt-1">{countdown}</p>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: L("销售额", "Sales", "Jualan"), value: campaignStats ? money(campaignStats.revenue) : "—" },
            { label: L("利润", "Profit", "Untung"), value: campaignStats ? money(campaignStats.profit) : "—" },
            { label: L("订单", "Orders", "Pesanan"), value: campaignStats ? String(campaignStats.count) : "—" },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl bg-white/15 px-3 py-2.5 min-w-0">
              <p className="text-base font-bold truncate">{k.value}</p>
              <p className="text-[10px] opacity-80">{k.label}</p>
            </div>
          ))}
        </div>

        {campaign?.targetRevenue != null && campaign.targetRevenue > 0 && (
          <div>
            <div className="flex items-center justify-between text-[11px] opacity-90 mb-1.5">
              <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" /> {L("目标", "Target", "Sasaran")} {money(campaign.targetRevenue)}</span>
              <span className="font-bold">{targetPct ?? 0}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/25 overflow-hidden">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${targetPct ?? 0}%` }} />
            </div>
          </div>
        )}
        {status === "upcoming" && (
          <p className="text-[11px] opacity-85">{L("活动开始后这里会显示销售和利润。现在可以先备货、设特价。", "Sales and profit show here once it starts. Prep stock and set promo prices now.", "Jualan dan untung dipapar selepas kempen bermula. Sedia stok dan harga promosi sekarang.")}</p>
        )}
      </section>

      {/* Sections as tabs (+ category filter in the same row) */}
      <div className="flex items-center gap-2">
        <nav className="flex-1 min-w-0 flex gap-1 p-1 rounded-2xl bg-muted/60 border border-border/50 overflow-x-auto scrollbar-none">
          {tabs.map((tb) => (
            <button
              key={tb.k}
              onClick={() => setCampTab(tb.k)}
              className={`shrink-0 flex-1 px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                activeTab === tb.k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {tb.label}
              {tb.count != null && tb.count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 rounded-full ${tb.warn ? "bg-red-500 text-white" : "bg-primary/15 text-primary"}`}>{tb.count}</span>
              )}
            </button>
          ))}
        </nav>
        {cats.length > 0 && (activeTab === "stock" || activeTab === "shipping") && (
          <select
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
            className={`shrink-0 h-10 max-w-[40%] pl-3 pr-7 rounded-2xl text-xs font-semibold border-0 outline-none ${activeCategory === "__all" ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"}`}
          >
            <option value="__all">{L("全部分类", "All categories", "Semua kategori")}</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">{L("加载中…", "Loading…", "Memuatkan…")}</p>
      ) : (
        <>
          {/* ---- Stock prep ---- */}
          {activeTab === "stock" && (
            <section className="rounded-3xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3">
              <div>
                <h2 className="text-sm font-bold flex items-center gap-2"><PackageX className="h-4 w-4 text-amber-600" /> {L("要补货的商品", "Products to restock", "Produk perlu ditambah")}</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {campaignDays
                    ? L(`按最近 ${VELOCITY_WINDOW_DAYS} 天的卖速，算够撑完 ${campaignDays} 天活动要补多少`, `Based on the last ${VELOCITY_WINDOW_DAYS} days of sales, enough to last the ${campaignDays}-day campaign`, `Berdasarkan jualan ${VELOCITY_WINDOW_DAYS} hari lepas, cukup untuk ${campaignDays} hari kempen`)
                    : L("断货和库存低的商品", "Out of stock and low-stock products", "Produk habis dan stok rendah")}
                </p>
              </div>
              {stockCount === 0 ? (
                <p className="text-sm text-emerald-700 bg-emerald-500/10 rounded-2xl px-3 py-3">{L("库存暂时没问题 👍", "Stock looks fine for now 👍", "Stok okay buat masa ini 👍")}</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {[...outOfStock.map((it) => ({ it, out: true })), ...lowStock.map((it) => ({ it, out: false }))].map(({ it, out }) => {
                    const suggest = suggestQty(it);
                    return (
                      <li key={it.id}>
                        <Link to="/inventory/$itemId" params={{ itemId: it.id }} className="flex items-center gap-3 py-2.5 active:opacity-70">
                          <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden ${out ? "bg-red-500/10" : "bg-amber-500/10"}`}>
                            {it.image_url ? <img src={it.image_url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <PackageX className={`h-4 w-4 ${out ? "text-red-500" : "text-amber-500"}`} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{it.name}</p>
                            <p className={`text-[11px] font-semibold ${out ? "text-red-600" : "text-amber-700"}`}>
                              {out ? L("缺货", "Out of stock", "Kehabisan stok") : L(`剩 ${it.stock}`, `${it.stock} left`, `Baki ${it.stock}`)}
                            </p>
                          </div>
                          {suggest > 0 && (
                            <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
                              {L(`补 ${suggest}`, `+${suggest}`, `+${suggest}`)}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {/* ---- Promo prices ---- */}
          {activeTab === "promos" && (
            <section className="rounded-3xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold flex items-center gap-2"><Tag className="h-4 w-4 text-primary" /> {L("活动特价", "Promo prices", "Harga promosi")}</h2>
                <button onClick={() => setShowAddPromo(true)} className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary text-primary-foreground active:scale-95">
                  <Plus className="h-3.5 w-3.5" /> {L("加特价", "Add", "Tambah")}
                </button>
              </div>
              {promos.length === 0 ? (
                <p className="text-sm text-muted-foreground bg-muted/40 rounded-2xl px-3 py-3">{L("还没设置活动特价", "No promo prices set yet", "Belum ada harga promosi")}</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {promos.map((p) => {
                    const margin = p.promo_price - p.cost_price;
                    const off = p.original_price > 0 ? Math.round((1 - p.promo_price / p.original_price) * 100) : 0;
                    return (
                      <li key={p.id} className={`rounded-2xl border p-3 ${p.active ? "border-primary/30 bg-primary/5" : "border-border/60 bg-muted/30"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-semibold min-w-0 break-words ${p.active ? "" : "text-muted-foreground line-through"}`}>{p.product_name}</p>
                          {off > 0 && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-500 text-white">-{off}%</span>}
                        </div>
                        <p className="mt-1 text-xs">
                          <span className="line-through text-muted-foreground">{money(p.original_price)}</span>{" "}
                          <span className="text-base font-bold text-primary">{money(p.promo_price)}</span>
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <span className={`text-[11px] font-semibold ${margin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {L("每件赚", "Earns", "Untung")} {money(margin)}
                          </span>
                          <button onClick={() => togglePromo(p)} className={`ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full ${p.active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                            {p.active ? L("生效中", "Active", "Aktif") : L("已停用", "Off", "Tidak aktif")}
                          </button>
                          <button onClick={() => deletePromo(p)} aria-label={L("删除", "Delete", "Padam")} className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground active:scale-95">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {/* ---- Shipping ---- */}
          {activeTab === "shipping" && (
            <section className="rounded-3xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3">
              <div>
                <h2 className="text-sm font-bold flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /> {L("已付款但还没发货", "Paid but not yet shipped", "Sudah dibayar tapi belum dihantar")}</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">{L(`付款超过 ${SHIP_REMINDER_HOURS} 小时还没发的订单`, `Paid more than ${SHIP_REMINDER_HOURS}h ago and not shipped`, `Dibayar lebih ${SHIP_REMINDER_HOURS} jam dan belum dihantar`)}</p>
              </div>
              {needsShipping.length === 0 ? (
                <p className="text-sm text-emerald-700 bg-emerald-500/10 rounded-2xl px-3 py-3">{L("发货进度正常 👍", "Shipping is on track 👍", "Penghantaran okay 👍")}</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {needsShipping.map((o) => {
                    const hrs = Math.round(hoursAgo(o.created_at));
                    return (
                      <li key={o.id}>
                        <Link to="/orders/$orderId" params={{ orderId: o.id }} search={{ edit: false }} className="flex items-center gap-3 py-2.5 active:opacity-70">
                          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                            {o.customer_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{o.customer_name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{o.product ?? o.code}</p>
                          </div>
                          <span className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-full bg-red-500/10 text-red-600">
                            {L(`${hrs} 小时`, `${hrs}h`, `${hrs} jam`)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {/* ---- Report (after it ends) ---- */}
          {activeTab === "report" && campaignStats && baselineStats && (
            <section className="rounded-3xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3">
              <div>
                <h2 className="text-sm font-bold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> {L("活动成效", "How it went", "Prestasi kempen")}</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">{L(`对比活动前同样长的 ${campaignDays} 天`, `vs the ${campaignDays} days before the campaign`, `Berbanding ${campaignDays} hari sebelum kempen`)}</p>
              </div>
              <ul className="space-y-3">
                {([
                  { key: "revenue", label: L("销售额", "Sales", "Jualan"), kind: "money", cur: campaignStats.revenue, base: baselineStats.revenue },
                  { key: "profit", label: L("利润", "Profit", "Untung"), kind: "money", cur: campaignStats.profit, base: baselineStats.profit },
                  { key: "count", label: L("订单数", "Orders", "Pesanan"), kind: "count", cur: campaignStats.count, base: baselineStats.count },
                ] as const).map((row) => {
                  const pct = pctChange(row.cur, row.base);
                  const up = pct >= 0;
                  const fmt = (n: number) => (row.kind === "count" ? String(n) : money(n));
                  const max = Math.max(Math.abs(row.cur), Math.abs(row.base), 1);
                  return (
                    <li key={row.key} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{row.label}</span>
                        <span className={`flex items-center gap-1 text-xs font-bold ${up ? "text-emerald-600" : "text-red-600"}`}>
                          {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          {up ? "+" : ""}{pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="w-14 shrink-0 text-muted-foreground">{L("活动", "Campaign", "Kempen")}</span>
                          <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${(Math.max(0, row.cur) / max) * 100}%` }} /></div>
                          <span className="w-20 shrink-0 text-right font-semibold">{fmt(row.cur)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="w-14 shrink-0 text-muted-foreground">{L("平常", "Usual", "Biasa")}</span>
                          <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-slate-400" style={{ width: `${(Math.max(0, row.base) / max) * 100}%` }} /></div>
                          <span className="w-20 shrink-0 text-right text-muted-foreground">{fmt(row.base)}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ---- AI suggestions ---- */}
          {activeTab === "ai" && (
            <section className="rounded-3xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> {L("AI 建议", "AI suggestions", "Cadangan AI")}</h2>
                <button disabled={aiLoading} onClick={generateAiSuggestions} className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-full bg-primary/10 text-primary disabled:opacity-60">
                  <RefreshCw className={`h-3 w-3 ${aiLoading ? "animate-spin" : ""}`} />
                  {aiSuggestions ? L("重新生成", "Regenerate", "Jana semula") : L("生成建议", "Generate", "Jana cadangan")}
                </button>
              </div>
              {!aiSuggestions && !aiLoading && (
                <p className="text-sm text-muted-foreground bg-muted/40 rounded-2xl px-3 py-3">{L("根据你的库存、价格和活动进度，AI 给出具体建议", "AI suggestions based on your stock, pricing and campaign progress", "AI beri cadangan berdasarkan stok, harga dan kemajuan kempen")}</p>
              )}
              {aiLoading && <p className="text-sm text-muted-foreground text-center py-3">{L("生成中…", "Generating…", "Menjana…")}</p>}
              {aiSuggestions && !aiLoading && (
                <div className="space-y-2">
                  {aiSuggestions.own_data_suggestions.length > 0 && (
                    <ul className="space-y-1.5">
                      {aiSuggestions.own_data_suggestions.map((sug, idx) => (
                        <li key={idx} className="text-sm text-foreground flex gap-2"><span className="text-primary shrink-0">•</span><span>{sug}</span></li>
                      ))}
                    </ul>
                  )}
                  {aiSuggestions.market_reference.text && (
                    <div className="rounded-2xl bg-muted/50 p-3 space-y-1">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase">{L("市场参考", "Market reference", "Rujukan pasaran")}</p>
                      <p className="text-sm text-foreground">{aiSuggestions.market_reference.text}</p>
                      <p className="text-[11px] text-muted-foreground italic">{aiSuggestions.market_reference.disclaimer}</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* Edit campaign sheet */}
      {editingCampaign && campaign && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setEditingCampaign(false)}>
          <div className="w-full max-w-[420px] bg-card rounded-t-3xl sm:rounded-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">{L("编辑活动", "Edit campaign", "Edit kempen")}</h3>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">{L("活动名称", "Campaign name", "Nama kempen")}</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">{L("开始日期", "Start date", "Tarikh mula")}</label>
                <input type="date" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} className={inputCls} />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">{L("结束日期", "End date", "Tarikh tamat")}</label>
                <input type="date" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">{L("销售目标 (RM，可选)", "Sales target (RM, optional)", "Sasaran jualan (RM, pilihan)")}</label>
              <input type="number" inputMode="decimal" value={form.targetRevenue} onChange={(e) => setForm((f) => ({ ...f, targetRevenue: e.target.value }))} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => {
                  setForm({ name: campaign.name, start: campaign.start, end: campaign.end, targetRevenue: campaign.targetRevenue != null ? String(campaign.targetRevenue) : "" });
                  setEditingCampaign(false);
                }}
                className="py-3 rounded-xl bg-muted text-foreground text-sm font-semibold"
              >
                {L("取消", "Cancel", "Batal")}
              </button>
              <button disabled={savingCampaign} onClick={saveCampaign} className="py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
                {savingCampaign ? "…" : L("保存", "Save", "Simpan")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add promo sheet */}
      {showAddPromo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setShowAddPromo(false)}>
          <div className="w-full max-w-[420px] bg-card rounded-t-3xl sm:rounded-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">{L("加活动特价", "Add a promo price", "Tambah harga promosi")}</h3>
            <select value={promoProductId} onChange={(e) => setPromoProductId(e.target.value)} className={inputCls}>
              <option value="">{L("选择商品", "Select a product", "Pilih produk")}</option>
              {[...invRows].sort((a, b) => a.name.localeCompare(b.name, lang === "zh" ? "zh-Hans-CN" : undefined, { sensitivity: "base", numeric: true })).map((i) => (
                <option key={i.id} value={i.id}>{i.name}{i.price != null ? ` (RM ${Number(i.price).toFixed(2)})` : ""}</option>
              ))}
            </select>
            {(() => {
              const item = invRows.find((i) => i.id === promoProductId);
              const price = Number(promoPrice);
              if (!item || !(price > 0)) return null;
              const margin = price - Number(item.cost_price ?? 0);
              return (
                <p className={`text-xs font-semibold ${margin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {L("原价", "Was", "Asal")} RM {Number(item.price ?? 0).toFixed(2)} · {L("每件赚", "earns", "untung")} RM {margin.toFixed(2)}
                </p>
              );
            })()}
            <input type="number" inputMode="decimal" placeholder={L("特价 (RM)", "Promo price (RM)", "Harga promosi (RM)")} value={promoPrice} onChange={(e) => setPromoPrice(e.target.value)} className={inputCls} />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => setShowAddPromo(false)} className="py-3 rounded-xl bg-muted text-foreground text-sm font-semibold">{L("取消", "Cancel", "Batal")}</button>
              <button disabled={savingPromo} onClick={addPromo} className="py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
                {savingPromo ? "…" : L("添加特价", "Add promo", "Tambah")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}