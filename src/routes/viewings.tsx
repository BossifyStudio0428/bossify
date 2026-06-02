import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Search, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { exportViewingsPDF } from "@/lib/propertyPdf";

export const Route = createFileRoute("/viewings")({ component: ViewingsPage });

export type ViewingStatus = "scheduled" | "completed" | "cancelled";
export type InterestLevel = "high" | "medium" | "low";

type Viewing = {
  id: string;
  listing_id: string | null;
  customer_id: string | null;
  viewing_at: string;
  status: ViewingStatus;
  interest_level: InterestLevel | null;
  feedback: string | null;
  listing_title?: string | null;
  listing_address?: string | null;
  customer_name?: string | null;
};

type FilterKey = "all" | "today" | "upcoming" | "completed" | "cancelled";

export const VIEWING_STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-600",
};

export function viewingStatusKey(v: string): TKey {
  switch (v) {
    case "completed": return "vw_status_completed";
    case "cancelled": return "vw_status_cancelled";
    default: return "vw_status_scheduled";
  }
}

export function interestEmoji(v: string | null | undefined): string {
  if (v === "high") return "🔥";
  if (v === "medium") return "😐";
  if (v === "low") return "👎";
  return "";
}

export function interestKey(v: string | null | undefined): TKey {
  if (v === "high") return "vw_interest_high";
  if (v === "medium") return "vw_interest_medium";
  if (v === "low") return "vw_interest_low";
  return "vw_interest_high";
}

function ViewingsPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { type: bizType, loading: bizLoading } = useBusinessType();
  const { hasFullAccess, showUpgrade } = useSubscription();
  const navigate = useNavigate();
  const [items, setItems] = useState<Viewing[]>([]);
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
      .from("property_viewings" as never)
      .select("id,listing_id,customer_id,viewing_at,status,interest_level,feedback")
      .eq("user_id", user.id)
      .order("viewing_at", { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const rows = ((data as any[]) ?? []) as Viewing[];

    const listingIds = Array.from(new Set(rows.map((r) => r.listing_id).filter(Boolean))) as string[];
    const custIds = Array.from(new Set(rows.map((r) => r.customer_id).filter(Boolean))) as string[];
    if (listingIds.length) {
      const { data: ls } = await supabase
        .from("property_listings" as never)
        .select("id,title,address")
        .in("id", listingIds);
      const map = new Map<string, { title: string; address: string | null }>(
        ((ls as any[]) ?? []).map((l) => [l.id, { title: l.title, address: l.address }])
      );
      rows.forEach((r) => {
        if (r.listing_id) {
          const v = map.get(r.listing_id);
          r.listing_title = v?.title ?? null;
          r.listing_address = v?.address ?? null;
        }
      });
    }
    if (custIds.length) {
      const { data: cs } = await supabase
        .from("customers")
        .select("id,name")
        .in("id", custIds);
      const map = new Map<string, string>(((cs as any[]) ?? []).map((c) => [c.id, c.name]));
      rows.forEach((r) => { if (r.customer_id) r.customer_name = map.get(r.customer_id) ?? null; });
    }
    setItems(rows);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const todayStart = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }, []);
  const tomorrowStart = useMemo(() => {
    const d = new Date(todayStart); d.setDate(d.getDate() + 1); return d;
  }, [todayStart]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((r) => {
      const d = new Date(r.viewing_at);
      if (filter === "today" && !(d >= todayStart && d < tomorrowStart)) return false;
      if (filter === "upcoming" && !(d >= todayStart && r.status === "scheduled")) return false;
      if (filter === "completed" && r.status !== "completed") return false;
      if (filter === "cancelled" && r.status !== "cancelled") return false;
      if (term) {
        const hay = ((r.customer_name ?? "") + " " + (r.listing_title ?? "") + " " + (r.listing_address ?? "")).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [items, filter, q, todayStart, tomorrowStart]);

  const filters: { key: FilterKey; labelKey: TKey }[] = [
    { key: "all", labelKey: "all" },
    { key: "today", labelKey: "vw_filter_today" },
    { key: "upcoming", labelKey: "vw_filter_upcoming" },
    { key: "completed", labelKey: "vw_status_completed" },
    { key: "cancelled", labelKey: "vw_status_cancelled" },
  ];

  const fmtDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const onExport = async () => {
    if (!hasFullAccess) { showUpgrade(t("pro_feature_required")); return; }
    if (!user) return;
    try {
      const { data: prof } = await supabase.from("profiles").select("business_name").eq("id", user.id).maybeSingle();
      await exportViewingsPDF({
        lang, businessName: (prof as any)?.business_name || "Bossify",
        rows: items,
      });
    } catch (e: any) { toast.error(e?.message || "Failed to export"); }
  };

  return (
    <div className="px-5 pt-10 pb-28 space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/listings" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("viewings_title")}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary ml-auto">
          {items.length}
        </span>
        <button
          onClick={onExport}
          aria-label={t("export_pdf")}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full bg-primary/10 text-primary active:scale-95"
        >
          <Download className="h-3.5 w-3.5" /> {t("export_pdf")}
        </button>
      </header>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("vw_search")}
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
          <p className="text-center text-sm text-muted-foreground py-10">{t("no_viewings_yet")}</p>
        )}
        {!loading && visible.map((r) => (
          <Link
            key={r.id}
            to="/viewing/$id"
            params={{ id: r.id }}
            className="block rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-2 active:scale-[0.99] transition-transform"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">
                  {r.listing_title || t("comm_no_listing")}
                </p>
                {r.listing_address && (
                  <p className="text-[11px] text-muted-foreground truncate">{r.listing_address}</p>
                )}
              </div>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${VIEWING_STATUS_STYLES[r.status] ?? "bg-muted text-foreground"}`}>
                {t(viewingStatusKey(r.status))}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="truncate">{r.customer_name || "—"}</span>
              <span className="shrink-0">{fmtDate(r.viewing_at)}</span>
            </div>
            {(r.interest_level || r.feedback) && (
              <div className="flex items-center gap-2 pt-1">
                {r.interest_level && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted">
                    {interestEmoji(r.interest_level)} {t(interestKey(r.interest_level))}
                  </span>
                )}
                {r.feedback && (
                  <span className="text-[11px] text-muted-foreground truncate flex-1">{r.feedback}</span>
                )}
              </div>
            )}
          </Link>
        ))}
      </div>

    </div>
  );
}