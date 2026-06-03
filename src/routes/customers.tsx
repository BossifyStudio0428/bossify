import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { supabase, type CustomerRow, type CustomerStatus } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { bizKey } from "@/lib/businessType";
import { CasesKanban, type EduStageInfo } from "@/components/CasesKanban";

export const Route = createFileRoute("/customers")({ component: CustomersPage });

const CUSTOMER_STATUS_ORDER: CustomerStatus[] = ["enquiry", "in_progress", "completed", "rejected"];
const CUSTOMER_STATUS_STYLES: Record<CustomerStatus, string> = {
  enquiry: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-600",
};
const CUSTOMER_STATUS_DOT: Record<CustomerStatus, string> = {
  enquiry: "🔵", in_progress: "🟡", completed: "🟢", rejected: "🔴",
};

function relTime(iso: string | null, t: (k: any) => string) {
  if (!iso) return t("never");
  const d = new Date(iso);
  const today = new Date(); today.setHours(0,0,0,0);
  const that = new Date(d); that.setHours(0,0,0,0);
  const diff = Math.floor((today.getTime() - that.getTime()) / 86400000);
  if (diff <= 0) return t("today_word");
  if (diff === 1) return t("yesterday");
  if (diff < 7) return `${diff} ${t("days_ago")}`;
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

function buildWA(phone: string, message: string) {
  const cleaned = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

function CustomersPage() {
  const { t } = useI18n();
  const { type: bizType } = useBusinessType();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuFor, setMenuFor] = useState<CustomerRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CustomerRow | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | "all">("all");
  const [packageFilter, setPackageFilter] = useState<string>("all");
  const [eduDetails, setEduDetails] = useState<Record<string, { university_preference: string | null; application_status: string | null }>>({});
  const [eduInfo, setEduInfo] = useState<Record<string, EduStageInfo>>({});
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");

  const ordersWordKey: TKey =
    bizType === "education" ? "case_word"
    : bizType === "beauty" ? "appointment_word"
    : bizType === "property" ? "lead_word"
    : bizType === "freelance" ? "project_word"
    : "orders_word";
  const searchKey: TKey =
    bizType && bizType !== "retail" && bizType !== "fnb" ? "search_clients" : "search_customers";

  const cycleStatus = async (c: CustomerRow) => {
    const current = (c.customer_status ?? "enquiry") as CustomerStatus;
    const next = CUSTOMER_STATUS_ORDER[(CUSTOMER_STATUS_ORDER.indexOf(current) + 1) % CUSTOMER_STATUS_ORDER.length];
    setCustomers((prev) => prev.map((x) => x.id === c.id ? { ...x, customer_status: next } : x));
    const { error } = await supabase.from("customers").update({ customer_status: next }).eq("id", c.id);
    if (error) {
      toast.error(error.message);
      setCustomers((prev) => prev.map((x) => x.id === c.id ? { ...x, customer_status: current } : x));
    }
  };

  const doDelete = async () => {
    if (!confirmDelete || !user) return;
    const c = confirmDelete;
    setRemovingId(c.id);
    setConfirmDelete(null);
    setTimeout(async () => {
      const { error } = await supabase.from("customers").delete().eq("id", c.id).eq("user_id", user.id);
      if (error) {
        toast.error(error.message);
        setRemovingId(null);
        return;
      }
      setCustomers((prev) => prev.filter((x) => x.id !== c.id));
      setRemovingId(null);
      toast.success(t("customer_deleted"));
    }, 220);
  };

  const load = async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("last_order_at", { ascending: false, nullsFirst: false });
    if (error) toast.error(error.message);
    setCustomers((data ?? []) as CustomerRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (bizType !== "education" || !user) { setEduDetails({}); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("client_education_details")
        .select("client_id,university_preference,application_status")
        .eq("user_id", user.id);
      if (cancelled) return;
      const map: Record<string, { university_preference: string | null; application_status: string | null }> = {};
      for (const r of (data ?? []) as any[]) {
        map[r.client_id] = { university_preference: r.university_preference, application_status: r.application_status };
      }
      setEduDetails(map);
    })();
    return () => { cancelled = true; };
  }, [bizType, user?.id, customers.length]);

  useEffect(() => {
    if (bizType !== "education" || !user) { setEduInfo({}); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("education_followup_stages")
        .select("client_id,stage_number,is_completed")
        .eq("user_id", user.id);
      if (cancelled) return;
      const map: Record<string, EduStageInfo> = {};
      for (const r of (data ?? []) as { client_id: string; stage_number: number; is_completed: boolean }[]) {
        const cur = map[r.client_id] ?? { completedCount: 0, currentStage: 1, university: null };
        if (r.is_completed) cur.completedCount += 1;
        map[r.client_id] = cur;
      }
      // currentStage = completedCount + 1 (capped at 10)
      for (const id of Object.keys(map)) {
        map[id].currentStage = Math.min(10, map[id].completedCount + 1);
      }
      // attach university from eduDetails snapshot (best effort)
      setEduInfo(map);
    })();
    return () => { cancelled = true; };
  }, [bizType, user?.id, customers.length]);

  // merge university into eduInfo when eduDetails updates
  const mergedEduInfo: Record<string, EduStageInfo> = (() => {
    const out: Record<string, EduStageInfo> = {};
    for (const c of customers) {
      const info = eduInfo[c.id] ?? { completedCount: 0, currentStage: 1, university: null };
      out[c.id] = { ...info, university: eduDetails[c.id]?.university_preference ?? null };
    }
    return out;
  })();

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("cust-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const visible = customers.filter((c) => {
    const q = query.toLowerCase();
    if (statusFilter !== "all" && (c.customer_status ?? "enquiry") !== statusFilter) return false;
    if (bizType === "property" && packageFilter !== "all") {
      if (packageFilter === "__none__") {
        if (c.package_id) return false;
      } else if (c.package_id !== packageFilter) {
        return false;
      }
    }
    return c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q);
  });

  const packageOptions = bizType === "property"
    ? Array.from(
        new Map(
          customers
            .filter((c) => c.package_id && c.package_name)
            .map((c) => [c.package_id as string, c.package_name as string]),
        ).entries(),
      )
    : [];

  return (
    <div className="px-5 pt-10 pb-4 space-y-5">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t(bizKey(bizType, "customers"))}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {customers.length} {t("total")}
        </span>
        {bizType === "property" && (
          <Link
            to="/listings"
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary text-primary-foreground active:scale-95 transition"
          >
            🏠 {t("nav_listings")}
          </Link>
        )}
      </header>

      {bizType === "education" && (
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-hide">
          <Link
            to="/pipeline-overview"
            className="shrink-0 text-[11px] font-semibold px-3 py-2 rounded-2xl bg-primary/10 text-primary active:scale-95"
          >
            📊 {t("pipeline_overview")}
          </Link>
          <Link
            to="/services-summary"
            className="shrink-0 text-[11px] font-semibold px-3 py-2 rounded-2xl bg-primary/10 text-primary active:scale-95"
          >
            🎓 {t("services_summary")}
          </Link>
          <Link
            to="/clients-compare"
            className="shrink-0 text-[11px] font-semibold px-3 py-2 rounded-2xl bg-primary text-primary-foreground active:scale-95"
          >
            ⚖️ {t("edu_compare")}
          </Link>
          <div className="ml-auto inline-flex rounded-2xl bg-muted p-0.5 shrink-0">
            <button
              onClick={() => setViewMode("list")}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-xl transition ${viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              📋 {t("view_list")}
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-xl transition ${viewMode === "kanban" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              🔀 {t("view_kanban")}
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base">🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(searchKey)}
          className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-hide">
        <button
          onClick={() => setStatusFilter("all")}
          className={`shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full transition active:scale-95 ${statusFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
        >
          {t("all_statuses")}
        </button>
        {CUSTOMER_STATUS_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full transition active:scale-95 ${statusFilter === s ? CUSTOMER_STATUS_STYLES[s] + " ring-2 ring-offset-1 ring-current" : "bg-muted text-muted-foreground"}`}
          >
            {CUSTOMER_STATUS_DOT[s]} {t(`cs_${s}` as any)}
          </button>
        ))}
      </div>

      {bizType === "property" && packageOptions.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-hide">
          <button
            onClick={() => setPackageFilter("all")}
            className={`shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full transition active:scale-95 ${packageFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            📦 {t("all_packages")}
          </button>
          <button
            onClick={() => setPackageFilter("__none__")}
            className={`shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full transition active:scale-95 ${packageFilter === "__none__" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {t("no_package")}
          </button>
          {packageOptions.map(([id, name]) => (
            <button
              key={id}
              onClick={() => setPackageFilter(id)}
              className={`shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full transition active:scale-95 ${packageFilter === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}
        {!loading && customers.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10 px-4">{t("no_customers_create")}</p>
        )}
        {!loading && customers.length > 0 && bizType === "education" && viewMode === "kanban" && (
          <CasesKanban customers={visible} eduInfo={mergedEduInfo} />
        )}
        {!loading && customers.length > 0 && (viewMode === "list" || bizType !== "education") && visible.map((c, idx) => (
          <div
            key={c.id}
            className={`rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] flex items-center gap-3 p-4 transition-all duration-200 ${removingId === c.id ? "opacity-0 scale-95" : "opacity-100"}`}
          >
            <Link
              to="/customer/$customerId"
              params={{ customerId: c.id }}
              className="flex items-center gap-3 flex-1 min-w-0"
            >
              <div className="h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold text-base shrink-0">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                </div>
                {c.phone && (
                  <p className="text-[11px] text-primary font-medium mt-0.5 truncate">📱 {c.phone}</p>
                )}
                {bizType === "education" ? (
                  <>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {eduDetails[c.id]?.university_preference
                        ? <>🏫 {eduDetails[c.id]!.university_preference}{eduDetails[c.id]?.application_status ? ` · 📋 ${eduDetails[c.id]!.application_status}` : ""}</>
                        : t("no_university_set")}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${((mergedEduInfo[c.id]?.completedCount ?? 0) / 10) * 100}%` }} />
                      </div>
                      <span className="text-[10px] font-semibold text-muted-foreground">{mergedEduInfo[c.id]?.completedCount ?? 0}/10</span>
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {c.total_orders} {t(ordersWordKey)} · {t("last")}: {relTime(c.last_order_at, t)}
                  </p>
                )}
                {bizType === "property" && c.package_name && (
                  <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    📦 {c.package_name}
                  </span>
                )}
                {c.remarks && (
                  <p className="text-[11px] text-muted-foreground/90 mt-1 truncate italic">
                    💬 {c.remarks.length > 50 ? c.remarks.slice(0, 50) + "…" : c.remarks}
                  </p>
                )}
              </div>
            </Link>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <p className="text-sm font-bold text-primary">RM {Number(c.total_spent).toFixed(0)}</p>
              <button
                onClick={() => cycleStatus(c)}
                aria-label="Status"
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full active:scale-95 transition ${CUSTOMER_STATUS_STYLES[(c.customer_status ?? "enquiry") as CustomerStatus]}`}
              >
                {CUSTOMER_STATUS_DOT[(c.customer_status ?? "enquiry") as CustomerStatus]} {t(`cs_${(c.customer_status ?? "enquiry") as CustomerStatus}` as any)}
              </button>
              {bizType === "education" && (
                <div className="flex gap-1">
                  <Link
                    to="/customer/$customerId"
                    params={{ customerId: c.id }}
                    hash="pipeline"
                    aria-label={t("open_pipeline")}
                    className="text-[10px] font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary active:scale-95"
                  >
                    📞
                  </Link>
                  <Link
                    to="/customer/$customerId"
                    params={{ customerId: c.id }}
                    hash="services"
                    aria-label={t("open_services")}
                    className="text-[10px] font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary active:scale-95"
                  >
                    🎓
                  </Link>
                </div>
              )}
              <button
                onClick={() => {
                  if (!c.phone) { toast.error(t("no_phone_for_wa")); return; }
                  window.open(buildWA(c.phone, `Hi ${c.name}! 👋 Thank you for being a valued customer! 😊`), "_blank");
                }}
                id={idx === 0 ? "tour-cust-wa" : undefined}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500 text-white active:scale-95 transition-transform"
              >
                📲 WA
              </button>
            </div>
            <button
              onClick={() => setMenuFor(c)}
              aria-label="More"
              className="p-2 -mr-1 rounded-full text-muted-foreground hover:bg-muted active:scale-95 transition"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>
        ))}
        {!loading && customers.length > 0 && visible.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">{t("no_customers")}</p>
        )}
      </div>

      {menuFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setMenuFor(null)}>
          <div className="w-full max-w-[420px] bg-card rounded-t-3xl p-3 space-y-1 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-semibold text-muted-foreground px-3 py-2 truncate">{menuFor.name}</p>
            <button
              onClick={() => { const c = menuFor; setMenuFor(null); navigate({ to: "/customer/$customerId", params: { customerId: c.id } }); }}
              className="w-full text-left px-4 py-3 rounded-2xl text-sm font-semibold hover:bg-muted"
            >
              ✏️ {t("edit_customer")}
            </button>
            <button
              onClick={() => { setConfirmDelete(menuFor); setMenuFor(null); }}
              className="w-full text-left px-4 py-3 rounded-2xl text-sm font-semibold text-red-500 hover:bg-red-500/10"
            >
              🗑️ {t("delete_customer")}
            </button>
            <button onClick={() => setMenuFor(null)} className="w-full px-4 py-3 rounded-2xl text-sm text-muted-foreground">
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm bg-card rounded-3xl p-5 space-y-4 animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-500/15 text-red-500 flex items-center justify-center text-xl">⚠️</div>
              <h3 className="text-base font-bold text-foreground">{t("delete_customer")}?</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("delete_customer_confirm").replace("{name}", confirmDelete.name)}
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => setConfirmDelete(null)} className="py-3 rounded-2xl bg-muted text-foreground font-semibold text-sm">{t("cancel")}</button>
              <button onClick={doDelete} className="py-3 rounded-2xl bg-red-500 text-white font-semibold text-sm">{t("delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}