import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Plus, Search, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { exportCommissionsPDF } from "@/lib/propertyPdf";

export const Route = createFileRoute("/commissions")({ component: CommissionsPage });

export type CommissionStatus = "pending" | "received" | "cancelled";

type Commission = {
  id: string;
  listing_id: string | null;
  client_name: string;
  transaction_type: string;
  transaction_price: number;
  commission_rate: number;
  commission_amount: number;
  status: CommissionStatus;
  transaction_date: string;
  listing_title?: string | null;
};

type FilterKey = "all" | "pending" | "received" | "month";

export const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  received: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-600",
};

export function statusLabelKey(v: string): TKey {
  switch (v) {
    case "received": return "comm_status_received";
    case "cancelled": return "comm_status_cancelled";
    default: return "comm_status_pending";
  }
}

function CommissionsPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { type: bizType, loading: bizLoading } = useBusinessType();
  const { hasFullAccess, showUpgrade } = useSubscription();
  const navigate = useNavigate();
  const [items, setItems] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!bizLoading && bizType && bizType !== "property") {
      navigate({ to: "/", replace: true });
    }
  }, [bizLoading, bizType, navigate]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("commissions" as never)
      .select("id,listing_id,client_name,transaction_type,transaction_price,commission_rate,commission_amount,status,transaction_date")
      .eq("user_id", user.id)
      .order("transaction_date", { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const rows = ((data as any[]) ?? []) as Commission[];

    const ids = Array.from(new Set(rows.map((r) => r.listing_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: listings } = await supabase
        .from("property_listings" as never)
        .select("id,title")
        .in("id", ids);
      const map = new Map<string, string>(((listings as any[]) ?? []).map((l) => [l.id, l.title]));
      rows.forEach((r) => { if (r.listing_id) r.listing_title = map.get(r.listing_id) ?? null; });
    }
    setItems(rows);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const monthStart = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const summary = useMemo(() => {
    let total = 0, pending = 0, received = 0, month = 0;
    for (const r of items) {
      const amt = Number(r.commission_amount) || 0;
      total += amt;
      if (r.status === "pending") pending += amt;
      if (r.status === "received") received += amt;
      if (new Date(r.transaction_date) >= monthStart) month += amt;
    }
    return { total, pending, received, month };
  }, [items, monthStart]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((r) => {
      if (filter === "pending" && r.status !== "pending") return false;
      if (filter === "received" && r.status !== "received") return false;
      if (filter === "month" && new Date(r.transaction_date) < monthStart) return false;
      if (term) {
        const hay = (r.client_name + " " + (r.listing_title ?? "")).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [items, filter, q, monthStart]);

  const filters: { key: FilterKey; labelKey: TKey }[] = [
    { key: "all", labelKey: "all" },
    { key: "pending", labelKey: "comm_status_pending" },
    { key: "received", labelKey: "comm_status_received" },
    { key: "month", labelKey: "comm_this_month" },
  ];

  const fmt = (n: number) => `RM ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const onExport = async () => {
    if (!hasFullAccess) { showUpgrade(t("pro_feature_required")); return; }
    if (!user) return;
    try {
      const { data: prof } = await supabase.from("profiles").select("business_name").eq("id", user.id).maybeSingle();
      await exportCommissionsPDF({
        lang, businessName: (prof as any)?.business_name || "Bossify",
        rows: items, summary,
      });
    } catch (e: any) { toast.error(e?.message || "Failed to export"); }
  };

  return (
    <div className="px-5 pt-10 pb-28 space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("commissions_title")}</h1>
        <button
          onClick={onExport}
          aria-label={t("export_pdf")}
          className="ml-auto flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full bg-primary/10 text-primary active:scale-95"
        >
          <Download className="h-3.5 w-3.5" /> {t("export_pdf")}
        </button>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <SummaryCard label={t("comm_total")} value={fmt(summary.total)} accent="text-primary" />
        <SummaryCard label={t("comm_this_month")} value={fmt(summary.month)} accent="text-foreground" />
        <SummaryCard label={t("comm_pending_total")} value={fmt(summary.pending)} accent="text-amber-600" />
        <SummaryCard label={t("comm_received_total")} value={fmt(summary.received)} accent="text-emerald-600" />
      </div>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("comm_search")}
          className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-background border border-border text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 no-scrollbar">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border ${
              filter === f.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border/60"
            }`}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}
        {!loading && visible.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">{t("no_commissions_yet")}</p>
        )}
        {!loading && visible.map((r) => (
          <Link
            key={r.id}
            to="/commission/$id"
            params={{ id: r.id }}
            className="block rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-2 active:scale-[0.99] transition-transform"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">
                  {r.listing_title || t("comm_no_listing")}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">{r.client_name || "—"}</p>
              </div>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[r.status] ?? "bg-muted text-foreground"}`}>
                {t(statusLabelKey(r.status))}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{r.transaction_type === "rental" ? t("comm_type_rental") : t("comm_type_sale")} · {fmt(Number(r.transaction_price))} × {Number(r.commission_rate)}%</span>
              <span>{r.transaction_date}</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t("comm_amount")}</span>
              <span className="text-base font-bold text-primary">{fmt(Number(r.commission_amount))}</span>
            </div>
          </Link>
        ))}
      </div>

      <Link
        to="/commission/$id"
        params={{ id: "new" }}
        aria-label={t("add_commission")}
        className="fixed bottom-24 z-30 h-14 w-14 rounded-full text-primary-foreground shadow-[var(--shadow-soft)] flex items-center justify-center active:scale-95 transition-transform bg-gradient-to-br from-primary to-primary/80"
        style={{ right: "max(1.5rem, calc(50vw - 180px + 1rem))" }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </Link>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className={`text-base font-bold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}