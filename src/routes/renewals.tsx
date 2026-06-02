import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";

export const Route = createFileRoute("/renewals")({ component: RenewalsPage });

type Reminder = {
  id: string;
  customer_id: string | null;
  reminder_type: string;
  policy_number: string | null;
  expiry_date: string;
  remind_days_before: number;
  status: string;
  notes: string | null;
  customer_name?: string | null;
};

type FilterKey = "all" | "active" | "expiring" | "renewed" | "expired";

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function daysBadgeClass(days: number): string {
  if (days < 0) return "bg-red-100 text-red-700";
  if (days < 30) return "bg-red-100 text-red-700";
  if (days < 60) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

export function renewalTypeKey(v: string): TKey {
  if (v === "tenancy") return "rr_type_tenancy";
  if (v === "others") return "rr_type_others";
  return "rr_type_insurance";
}

export function renewalStatusKey(v: string): TKey {
  if (v === "renewed") return "rr_status_renewed";
  if (v === "expired") return "rr_status_expired";
  return "rr_status_active";
}

function RenewalsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { type: bizType, loading: bizLoading } = useBusinessType();
  const navigate = useNavigate();
  const [items, setItems] = useState<Reminder[]>([]);
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
      .from("renewal_reminders" as never)
      .select("id,customer_id,reminder_type,policy_number,expiry_date,remind_days_before,status,notes")
      .eq("user_id", user.id)
      .order("expiry_date", { ascending: true });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const rows = ((data as any[]) ?? []) as Reminder[];
    const ids = Array.from(new Set(rows.map((r) => r.customer_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: cs } = await supabase.from("customers").select("id,name").in("id", ids);
      const map = new Map<string, string>(((cs as any[]) ?? []).map((c) => [c.id, c.name]));
      rows.forEach((r) => { if (r.customer_id) r.customer_name = map.get(r.customer_id) ?? null; });
    }
    setItems(rows);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((r) => {
      const d = daysUntil(r.expiry_date);
      if (filter === "active" && r.status !== "active") return false;
      if (filter === "renewed" && r.status !== "renewed") return false;
      if (filter === "expired" && r.status !== "expired" && d >= 0) return false;
      if (filter === "expiring" && !(r.status === "active" && d >= 0 && d <= 30)) return false;
      if (term) {
        const hay = ((r.customer_name ?? "") + " " + (r.policy_number ?? "") + " " + r.reminder_type).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [items, filter, q]);

  const filters: { key: FilterKey; labelKey: TKey }[] = [
    { key: "all", labelKey: "all" },
    { key: "active", labelKey: "rr_status_active" },
    { key: "expiring", labelKey: "rr_filter_expiring" },
    { key: "renewed", labelKey: "rr_status_renewed" },
    { key: "expired", labelKey: "rr_status_expired" },
  ];

  return (
    <div className="px-5 pt-10 pb-28 space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("renewals_title")}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary ml-auto">
          {items.length}
        </span>
      </header>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("rr_search")}
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
          <p className="text-center text-sm text-muted-foreground py-10">{t("no_renewals_yet")}</p>
        )}
        {!loading && visible.map((r) => {
          const days = daysUntil(r.expiry_date);
          const daysLabel = days < 0
            ? t("rr_expired_x_days").replace("{n}", String(Math.abs(days)))
            : t("rr_days_left").replace("{n}", String(days));
          return (
            <Link
              key={r.id}
              to="/renewal/$id"
              params={{ id: r.id }}
              className="block rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-2 active:scale-[0.99] transition-transform"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">
                    {r.customer_name || "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {t(renewalTypeKey(r.reminder_type))}
                    {r.policy_number ? ` · ${r.policy_number}` : ""}
                  </p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 bg-muted text-foreground`}>
                  {t(renewalStatusKey(r.status))}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">
                  {new Date(r.expiry_date + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                </span>
                <span className={`font-semibold px-2 py-0.5 rounded-full ${daysBadgeClass(days)}`}>
                  {daysLabel}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}