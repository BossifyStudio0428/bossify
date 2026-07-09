import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";

export const Route = createFileRoute("/requirements")({ component: RequirementsPage });

type Req = {
  id: string;
  customer_id: string | null;
  property_type: string;
  listing_type: string;
  budget_min: number;
  budget_max: number;
  preferred_location: string | null;
  min_bedrooms: number | null;
  min_bathrooms: number | null;
  min_size_sqft: number | null;
  status: string;
  customer_name?: string | null;
};

type FilterKey = "all" | "searching" | "found" | "closed";

export function reqStatusKey(v: string): TKey {
  if (v === "found") return "cr_status_found";
  if (v === "closed") return "cr_status_closed";
  return "cr_status_searching";
}

function RequirementsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { type: bizType, loading: bizLoading } = useBusinessType();
  const navigate = useNavigate();
  const [items, setItems] = useState<Req[]>([]);
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
      .from("property_client_requirements" as never)
      .select("id,customer_id,property_type,listing_type,budget_min,budget_max,preferred_location,min_bedrooms,min_bathrooms,min_size_sqft,status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const rows = ((data as any[]) ?? []) as Req[];
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
      if (filter !== "all" && r.status !== filter) return false;
      if (term) {
        const hay = ((r.customer_name ?? "") + " " + (r.preferred_location ?? "")).toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [items, filter, q]);

  const filters: { key: FilterKey; labelKey: TKey }[] = [
    { key: "all", labelKey: "all" },
    { key: "searching", labelKey: "cr_status_searching" },
    { key: "found", labelKey: "cr_status_found" },
    { key: "closed", labelKey: "cr_status_closed" },
  ];

  return (
    <div className="px-5 pt-10 pb-28 space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("requirements_title")}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary ml-auto">
          {items.length}
        </span>
      </header>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("cr_search")}
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
          <p className="text-center text-sm text-muted-foreground py-10">{t("no_requirements_yet")}</p>
        )}
        {!loading && visible.map((r) => (
          <Link
            key={r.id}
            to="/requirement/$id"
            params={{ id: r.id }}
            className="block rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-2 active:scale-[0.99] transition-transform"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{r.customer_name || "—"}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {r.property_type} · {r.listing_type === "rent" ? t("lt_rent") : t("lt_sale")}
                  {r.preferred_location ? ` · ${r.preferred_location}` : ""}
                </p>
              </div>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 bg-muted text-foreground">
                {t(reqStatusKey(r.status))}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-primary">
                RM {Number(r.budget_min || 0).toLocaleString()} - {Number(r.budget_max || 0).toLocaleString()}
              </span>
              <span className="text-muted-foreground">
                {(r.min_bedrooms ?? 0)}{t("bedrooms_short")} · {(r.min_bathrooms ?? 0)}{t("bathrooms_short")} · {(r.min_size_sqft ?? 0)} sqft
              </span>
            </div>
          </Link>
        ))}
      </div>

      <Link
        to="/requirement/$id"
        params={{ id: "new" }}
        aria-label={t("new_requirement")}
        className="fixed fab-above-nav z-30 h-14 w-14 rounded-full text-primary-foreground shadow-[var(--shadow-soft)] flex items-center justify-center active:scale-95 transition-transform bg-gradient-to-br from-primary to-primary/80"
        style={{ right: "max(1.5rem, calc(50vw - 180px + 1rem))" }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </Link>
    </div>
  );
}