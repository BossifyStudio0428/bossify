import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Plus, Flame, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import {
  type Campaign,
  type PeriodStats,
  fetchCampaigns,
  createCampaign,
  fetchPeriodStats,
  dayStartISO,
  dayAfterISO,
} from "@/lib/campaignStats";

// Campaign LIST page — replaces the old single-slot /campaign (11.11-only)
// route. Sellers can now create as many campaigns/events as they want
// (11.11, 12.12, CNY, payday sales, ...) and come back later to see how
// each one performed. Tapping a card goes to the full detail page
// (campaigns_.$campaignId.tsx — promo prices, stock prep, AI suggestions,
// shipping tracker, post-campaign report all live there per-campaign now).

export const Route = createFileRoute("/campaigns")({ component: CampaignsListPage });

function money(n: number) {
  return `RM ${n.toFixed(2)}`;
}

type CampaignWithStats = Campaign & { stats: PeriodStats | null };

function CampaignsListPage() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const [rows, setRows] = useState<CampaignWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", start: "", end: "", targetRevenue: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const list = await fetchCampaigns(user.id);
    // Only worth a stats fetch once a campaign has actually started — an
    // upcoming one has no orders yet by definition.
    const withStats = await Promise.all(
      list.map(async (c) => {
        if (!c.start || new Date(`${c.start}T00:00:00`) > new Date()) return { ...c, stats: null };
        const stats = await fetchPeriodStats(user.id, dayStartISO(c.start), dayAfterISO(c.end));
        return { ...c, stats };
      }),
    );
    setRows(withStats);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const statusOf = (c: Campaign): "upcoming" | "live" | "ended" => {
    const now = new Date();
    if (c.start && new Date(`${c.start}T00:00:00`) > now) return "upcoming";
    if (c.end && new Date(`${c.end}T23:59:59`) < now) return "ended";
    return "live";
  };

  const create = async () => {
    if (!user) return;
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
    setSaving(true);
    try {
      const created = await createCampaign(user.id, {
        name: form.name,
        start: form.start,
        end: form.end,
        targetRevenue: form.targetRevenue ? Number(form.targetRevenue) : null,
      });
      setShowCreate(false);
      setForm({ name: "", start: "", end: "", targetRevenue: "" });
      navigate({ to: "/campaigns/$campaignId", params: { campaignId: created.id } });
    } catch (e: any) {
      toast.error(String(e?.message ?? e ?? "Failed"));
    } finally {
      setSaving(false);
    }
  };

  const L = (zh: string, en: string, ms: string) => (lang === "zh" ? zh : lang === "ms" ? ms : en);
  const title = L("活动", "Campaigns", "Kempen");
  const subtitle = L(
    "11.11、双12、新年促销 — 自己设定活动，看每个活动赚多少",
    "11.11, 12.12, festive sales — set up your own campaigns and see how much each one earns",
    "11.11, 12.12, jualan perayaan — cipta kempen sendiri, lihat untung setiap satu",
  );
  const daysUntil = (d: string) => Math.ceil((new Date(`${d}T00:00:00`).getTime() - Date.now()) / 86400000);
  const daysLeft = (d: string) => Math.max(0, Math.ceil((new Date(`${d}T23:59:59`).getTime() - Date.now()) / 86400000));
  const groups = (["live", "upcoming", "ended"] as const).map((st) => ({
    st,
    label: st === "live" ? L("进行中", "Live now", "Aktif") : st === "upcoming" ? L("未开始", "Coming up", "Akan datang") : L("已结束", "Ended", "Tamat"),
    items: rows.filter((c) => statusOf(c) === st),
  }));
  const inputCls = "w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";

  return (
    <div className="px-4 pt-4 pb-28 space-y-5 lg:max-w-5xl lg:mx-auto lg:px-8 lg:pt-8">
      <div className="flex items-center gap-2">
        <Link to="/" aria-label={L("返回", "Back", "Kembali")} className="h-9 w-9 rounded-full bg-card border border-border/60 flex items-center justify-center text-muted-foreground active:scale-95 transition-transform">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
        </div>
        {rows.length > 0 && (
          <button
            onClick={() => setShowCreate(true)}
            className="hidden lg:inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold"
          >
            <Plus className="h-4 w-4" /> {L("新增活动", "New campaign", "Kempen baharu")}
          </button>
        )}
      </div>

      {/* Counts */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {groups.map((g) => (
            <div key={g.st} className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] px-3 py-2.5">
              <p className={`text-xl font-bold ${g.st === "live" ? "text-primary" : g.st === "upcoming" ? "text-amber-600" : "text-muted-foreground"}`}>{g.items.length}</p>
              <p className="text-[11px] text-muted-foreground">{g.label}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">{L("加载中…", "Loading…", "Memuatkan…")}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl bg-gradient-to-br from-primary to-fuchsia-600 text-white p-6 text-center space-y-3 shadow-[var(--shadow-soft)]">
          <span className="mx-auto h-14 w-14 rounded-2xl bg-white/20 flex items-center justify-center">
            <Flame className="h-7 w-7" />
          </span>
          <p className="text-lg font-bold">{L("开始你的第一个活动", "Start your first campaign", "Mulakan kempen pertama anda")}</p>
          <p className="text-sm opacity-90">
            {L("11.11、双12、新年促销都可以。设目标、特价、备货、追发货，活动结束还会告诉你比平常多赚多少。",
              "11.11, 12.12, festive sales — anything. Set a target, promo prices, prep stock, track shipping, and see how much more you made than usual.",
              "11.11, 12.12, jualan perayaan. Tetapkan sasaran, harga promosi, sedia stok, jejak penghantaran, dan lihat berapa lebih untung berbanding biasa.")}
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-primary text-sm font-bold active:scale-95 transition-transform"
          >
            <Plus className="h-4 w-4" /> {L("新增活动", "New campaign", "Kempen baharu")}
          </button>
        </div>
      ) : (
        groups.filter((g) => g.items.length > 0).map((g) => (
          <section key={g.st} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">{g.label}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {g.items.map((c) => {
                const st = statusOf(c);
                const targetPct =
                  c.targetRevenue && c.targetRevenue > 0 && c.stats
                    ? Math.min(100, Math.round((c.stats.revenue / c.targetRevenue) * 100))
                    : null;
                const band = st === "live" ? "from-primary to-fuchsia-600" : st === "upcoming" ? "from-amber-500 to-orange-500" : "from-slate-500 to-slate-400";
                const when =
                  st === "upcoming"
                    ? L(`${daysUntil(c.start)} 天后开始`, `Starts in ${daysUntil(c.start)}d`, `Mula dalam ${daysUntil(c.start)} hari`)
                    : st === "live"
                      ? L(`还剩 ${daysLeft(c.end)} 天`, `${daysLeft(c.end)}d left`, `${daysLeft(c.end)} hari lagi`)
                      : L("已结束", "Ended", "Tamat");
                return (
                  <Link
                    key={c.id}
                    to="/campaigns/$campaignId"
                    params={{ campaignId: c.id }}
                    className="block rounded-3xl bg-card border border-border/60 shadow-[var(--shadow-card)] overflow-hidden active:scale-[0.99] transition-transform"
                  >
                    <div className={`bg-gradient-to-br ${band} text-white px-4 py-3`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-base font-bold leading-snug min-w-0 break-words">{c.name}</p>
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20">{when}</span>
                      </div>
                      <p className="text-[11px] opacity-90 mt-0.5">{c.start} → {c.end}</p>
                    </div>
                    <div className="px-4 py-3 space-y-2.5">
                      {c.stats ? (
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <p className="text-sm font-bold text-foreground truncate">{money(c.stats.revenue)}</p>
                            <p className="text-[10px] text-muted-foreground">{L("销售额", "Sales", "Jualan")}</p>
                          </div>
                          <div>
                            <p className={`text-sm font-bold truncate ${c.stats.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{money(c.stats.profit)}</p>
                            <p className="text-[10px] text-muted-foreground">{L("利润", "Profit", "Untung")}</p>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground">{c.stats.count}</p>
                            <p className="text-[10px] text-muted-foreground">{L("订单", "Orders", "Pesanan")}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">{L("还没开始，先去备货、设特价", "Not started yet — prep stock and set promo prices", "Belum bermula — sedia stok dan harga promosi")}</p>
                      )}
                      {targetPct != null && (
                        <div>
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                            <span>{L("目标", "Target", "Sasaran")} {money(c.targetRevenue ?? 0)}</span>
                            <span className="font-bold text-primary">{targetPct}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${targetPct}%` }} />
                          </div>
                        </div>
                      )}
                      <p className="text-[11px] font-semibold text-primary flex items-center gap-0.5">
                        {L("打开活动", "Open campaign", "Buka kempen")} <ChevronRight className="h-3.5 w-3.5" />
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}

      {rows.length > 0 && !showCreate && (
        <button
          onClick={() => setShowCreate(true)}
          className="lg:hidden fixed fab-above-nav left-1/2 -translate-x-1/2 z-30 h-12 px-5 rounded-full text-primary-foreground font-semibold shadow-[var(--shadow-soft)] flex items-center gap-2 active:scale-[0.98] transition-transform bg-primary"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
          {L("新增活动", "New campaign", "Kempen baharu")}
        </button>
      )}

      {/* New campaign sheet */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-[420px] bg-card rounded-t-3xl sm:rounded-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold flex items-center gap-2"><Flame className="h-4 w-4 text-primary" /> {L("新增活动", "New campaign", "Kempen baharu")}</h3>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">{L("活动名称", "Campaign name", "Nama kempen")}</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={L("例如：双12大促", "e.g. 12.12 Sale", "cth: Jualan 12.12")}
                className={inputCls}
              />
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
              <button onClick={() => setShowCreate(false)} className="py-3 rounded-xl bg-muted text-foreground text-sm font-semibold">{L("取消", "Cancel", "Batal")}</button>
              <button disabled={saving} onClick={create} className="py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
                {saving ? "…" : L("创建活动", "Create campaign", "Cipta kempen")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
