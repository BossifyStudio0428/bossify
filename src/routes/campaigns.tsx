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

  const title = lang === "zh" ? "活动" : lang === "ms" ? "Kempen" : "Campaigns";
  const subtitle =
    lang === "zh"
      ? "11.11、双12、新年促销 — 自己设定活动，看每个活动赚多少"
      : lang === "ms"
        ? "11.11, 12.12, jualan Tahun Baru — cipta kempen sendiri, lihat untung setiap satu"
        : "11.11, 12.12, festive sales — set up your own campaigns and see how much each one earns";

  return (
    <div className="px-4 pt-4 pb-28 space-y-4 lg:max-w-5xl lg:mx-auto lg:px-8 lg:pt-8">
      <div className="flex items-center gap-2">
        <Link to="/" className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground active:scale-95">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-foreground">{title}</h1>
      </div>
      <p className="text-xs text-muted-foreground -mt-3 ml-11">{subtitle}</p>

      {showCreate && (
        <div className="rounded-2xl bg-card border border-border/60 p-3.5 space-y-2.5">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              {lang === "zh" ? "活动名称" : lang === "ms" ? "Nama kempen" : "Campaign name"}
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={lang === "zh" ? "例如：双12大促" : lang === "ms" ? "cth: Jualan 12.12" : "e.g. 12.12 Sale"}
              className="w-full rounded-xl bg-background border border-border/60 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                {lang === "zh" ? "开始日期" : lang === "ms" ? "Tarikh mula" : "Start date"}
              </label>
              <input
                type="date"
                value={form.start}
                onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                className="w-full rounded-xl bg-background border border-border/60 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                {lang === "zh" ? "结束日期" : lang === "ms" ? "Tarikh tamat" : "End date"}
              </label>
              <input
                type="date"
                value={form.end}
                onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                className="w-full rounded-xl bg-background border border-border/60 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              {lang === "zh" ? "销售目标 (RM，可选)" : lang === "ms" ? "Sasaran jualan (RM, pilihan)" : "Sales target (RM, optional)"}
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={form.targetRevenue}
              onChange={(e) => setForm((f) => ({ ...f, targetRevenue: e.target.value }))}
              className="w-full rounded-xl bg-background border border-border/60 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="flex-1 py-2.5 rounded-xl border border-border/60 text-sm font-semibold text-muted-foreground"
            >
              {lang === "zh" ? "取消" : lang === "ms" ? "Batal" : "Cancel"}
            </button>
            <button
              disabled={saving}
              onClick={create}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60"
            >
              {saving ? "…" : lang === "zh" ? "创建活动" : lang === "ms" ? "Cipta kempen" : "Create campaign"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">…</p>
      ) : rows.length === 0 && !showCreate ? (
        <div className="rounded-2xl bg-card border border-border/60 p-6 text-center space-y-3">
          <Flame className="h-8 w-8 text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">
            {lang === "zh"
              ? "还没有活动，点击下面新增一个（11.11、双12、新年促销都可以）"
              : lang === "ms"
                ? "Belum ada kempen — tambah satu di bawah (11.11, 12.12, jualan Tahun Baru, dll)"
                : "No campaigns yet — add one below (11.11, 12.12, festive sales, anything)"}
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-semibold active:scale-95"
          >
            <Plus className="h-4 w-4" /> {lang === "zh" ? "新增活动" : lang === "ms" ? "Kempen baharu" : "New campaign"}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start">
          {rows.map((c) => {
            const status = statusOf(c);
            const targetPct =
              c.targetRevenue && c.targetRevenue > 0 && c.stats
                ? Math.min(100, Math.round((c.stats.revenue / c.targetRevenue) * 100))
                : null;
            return (
              <Link
                key={c.id}
                to="/campaigns/$campaignId"
                params={{ campaignId: c.id }}
                className="block rounded-2xl bg-card border border-border/60 p-3.5 active:scale-[0.99]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Flame className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {c.start} → {c.end}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                        status === "live"
                          ? "bg-emerald-100 text-emerald-700"
                          : status === "upcoming"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {status === "live"
                        ? lang === "zh"
                          ? "进行中"
                          : lang === "ms"
                            ? "Aktif"
                            : "Live"
                        : status === "upcoming"
                          ? lang === "zh"
                            ? "未开始"
                            : lang === "ms"
                              ? "Akan datang"
                              : "Upcoming"
                          : lang === "zh"
                            ? "已结束"
                            : lang === "ms"
                              ? "Tamat"
                              : "Ended"}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                {c.stats && (
                  <div className="mt-2.5 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {lang === "zh"
                        ? `销售额 ${money(c.stats.revenue)} · 利润 ${money(c.stats.profit)}`
                        : lang === "ms"
                          ? `Jualan ${money(c.stats.revenue)} · Untung ${money(c.stats.profit)}`
                          : `Revenue ${money(c.stats.revenue)} · Profit ${money(c.stats.profit)}`}
                    </p>
                    {targetPct != null && <p className="text-xs font-bold text-primary">{targetPct}%</p>}
                  </div>
                )}
                {targetPct != null && (
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${targetPct}%` }} />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {rows.length > 0 && !showCreate && (
        <button
          onClick={() => setShowCreate(true)}
          className="fixed fab-above-nav left-1/2 -translate-x-1/2 z-30 h-12 px-5 rounded-full text-primary-foreground font-semibold shadow-[var(--shadow-soft)] flex items-center gap-2 active:scale-[0.98] transition-transform bg-gradient-to-br from-primary to-primary/80"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} />
          {lang === "zh" ? "新增活动" : lang === "ms" ? "Kempen baharu" : "New campaign"}
        </button>
      )}
    </div>
  );
}