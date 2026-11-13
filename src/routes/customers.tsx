import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  MoreVertical, X, Package, Repeat, BarChart3, GraduationCap, Scale, List,
  LayoutGrid, Search, Clock, Gem, Calendar, Smartphone, School, MessageCircle,
  Phone, Pencil, Trash2, AlertTriangle, Users, Wallet, TrendingUp, ShoppingBag,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";
import { supabase, type CustomerRow, type CustomerStatus } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { bizKey } from "@/lib/businessType";
import { CasesKanban, type EduStageInfo } from "@/components/CasesKanban";
import { PhoneInput } from "@/components/PhoneInput";
import { stripEmoji } from "@/lib/wa";
import { orderContributionProfit, PAID_STATUSES } from "@/lib/orderMath";

function buildWA(phone: string, message: string) {
  const cleaned = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(stripEmoji(message))}`;
}

export const Route = createFileRoute("/customers")({ component: CustomersPage });

const CUSTOMER_STATUS_ORDER: CustomerStatus[] = ["enquiry", "in_progress", "completed", "rejected"];
const CUSTOMER_STATUS_STYLES: Record<CustomerStatus, string> = {
  enquiry: "bg-blue-500/15 text-blue-700",
  in_progress: "bg-amber-500/15 text-amber-700",
  completed: "bg-emerald-500/15 text-emerald-700",
  rejected: "bg-red-500/15 text-red-600",
};
const CUSTOMER_STATUS_DOT: Record<CustomerStatus, string> = {
  enquiry: "bg-blue-500", in_progress: "bg-amber-500", completed: "bg-emerald-500", rejected: "bg-red-500",
};

function CustomerKpiCard({
  icon: Icon, label, value, tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string;
  tone?: "default" | "amber";
}) {
  const toneClasses: Record<string, string> = {
    default: "bg-primary/10 text-primary",
    amber: "bg-amber-500/10 text-amber-700",
  };
  return (
    <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${toneClasses[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

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


function CustomersPage() {
  const { t, lang } = useI18n();
  const { type: bizType } = useBusinessType();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [tiktokBuyers, setTiktokBuyers] = useState<Array<{ buyerId: string; orders: number; totalSpent: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [menuFor, setMenuFor] = useState<CustomerRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CustomerRow | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CustomerStatus | "all">("all");
  const [packageFilter, setPackageFilter] = useState<string>("all");
  const [eduDetails, setEduDetails] = useState<Record<string, { university_preference: string | null; application_status: string | null }>>({});
  const [eduInfo, setEduInfo] = useState<Record<string, EduStageInfo>>({});
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", followup_date: "", note: "" });
  const [newCustomerErrors, setNewCustomerErrors] = useState<Record<string, string>>({});
  const [savingNewCustomer, setSavingNewCustomer] = useState(false);
  const [followUpByCustomerId, setFollowUpByCustomerId] = useState<Record<string, string>>({});
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [dateOpen, setDateOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"recent" | "most_orders" | "top_spender">("recent");
  const [orderAgg, setOrderAgg] = useState<Record<string, { orders: number; sales: number; profit: number; outstanding: number }>>({});

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
      const phoneDigits = (c.phone || "").replace(/\D/g, "");
      if (phoneDigits) {
        const { error: phoneOrdersError } = await supabase
          .from("orders")
          .delete()
          .eq("user_id", user.id)
          .eq("phone", phoneDigits);
        if (phoneOrdersError) {
          toast.error(phoneOrdersError.message);
          setRemovingId(null);
          return;
        }
      }
      const { error: nameOrdersError } = await supabase
        .from("orders")
        .delete()
        .eq("user_id", user.id)
        .is("phone", null)
        .eq("customer_name", c.name);
      if (nameOrdersError) {
        toast.error(nameOrdersError.message);
        setRemovingId(null);
        return;
      }
      const { error: followUpError } = await supabase.from("follow_ups").delete().eq("user_id", user.id).eq("customer_id", c.id);
      if (followUpError) {
        toast.error(followUpError.message);
        setRemovingId(null);
        return;
      }
      const { error } = await supabase.from("customers").delete().eq("id", c.id).eq("user_id", user.id);
      if (error) {
        toast.error(error.message);
        setRemovingId(null);
        return;
      }
      setCustomers((prev) => prev.filter((x) => x.id !== c.id));
      setRemovingId(null);
      toast.success(t("customer_deleted"));
      load();
    }, 220);
  };

  const load = async () => {
    if (!user) { setCustomers([]); setFollowUpByCustomerId({}); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    const rows = (data ?? []) as CustomerRow[];
    setCustomers(rows);

    const { data: tkOrders } = await supabase
      .from("orders" as any)
      .select("platform_buyer_id,amount")
      .eq("user_id", user.id)
      .eq("order_source", "tiktok")
      .in("status", PAID_STATUSES)
      .not("platform_buyer_id", "is", null);
    const map = new Map<string, { buyerId: string; orders: number; totalSpent: number }>();
    for (const o of ((tkOrders ?? []) as any[])) {
      const existing = map.get(o.platform_buyer_id) ?? { buyerId: o.platform_buyer_id, orders: 0, totalSpent: 0 };
      existing.orders += 1;
      existing.totalSpent += Number(o.amount ?? 0);
      map.set(o.platform_buyer_id, existing);
    }
    setTiktokBuyers(Array.from(map.values()).filter((b) => b.orders > 1).sort((a, b) => b.totalSpent - a.totalSpent));

    // Desktop KPI/table data: Outstanding and Total Profit aren't stored on
    // the customers row, so derive them by matching each customer's orders
    // the same way doDelete() above does — by phone digits first, falling
    // back to customer_name only for orders with no phone on file.
    const { data: ordersForAgg } = await supabase
      .from("orders" as any)
      .select("phone,customer_name,amount,status,cost,gross_profit,platform_fee_amount,shipping_cost,affiliate_commission,financial_status")
      .eq("user_id", user.id);
    const byPhone = new Map<string, any[]>();
    const byName = new Map<string, any[]>();
    for (const o of ((ordersForAgg ?? []) as any[])) {
      const pd = (o.phone ?? "").replace(/\D/g, "");
      if (pd) {
        if (!byPhone.has(pd)) byPhone.set(pd, []);
        byPhone.get(pd)!.push(o);
      } else {
        const key = (o.customer_name ?? "").trim().toLowerCase();
        if (!key) continue;
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key)!.push(o);
      }
    }
    const agg: Record<string, { orders: number; sales: number; profit: number; outstanding: number }> = {};
    for (const c of rows) {
      const pd = (c.phone ?? "").replace(/\D/g, "");
      const list = pd ? (byPhone.get(pd) ?? []) : (byName.get(c.name.trim().toLowerCase()) ?? []);
      let sales = 0, profit = 0, outstanding = 0;
      for (const o of list) {
        const amt = Number(o.amount ?? 0);
        sales += amt;
        if (o.financial_status !== "pending") profit += orderContributionProfit(o);
        if (o.status === "Unpaid") outstanding += amt;
      }
      agg[c.id] = { orders: list.length, sales, profit, outstanding };
    }
    setOrderAgg(agg);

    if (rows.length) {
      const { data: fuRows } = await supabase
        .from("follow_ups")
        .select("customer_id,follow_up_date,is_done")
        .in("customer_id", rows.map((c) => c.id))
        .eq("is_done", false)
        .order("follow_up_date", { ascending: true });
      const map: Record<string, string> = {};
      ((fuRows ?? []) as { customer_id: string; follow_up_date: string }[]).forEach((f) => {
        if (!map[f.customer_id]) map[f.customer_id] = f.follow_up_date;
      });
      setFollowUpByCustomerId(map);
    } else {
      setFollowUpByCustomerId({});
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const onFocus = () => load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id]);

  useEffect(() => {
    const open = () => setNewCustomerOpen(true);
    window.addEventListener("bossify:add-customer", open);
    return () => window.removeEventListener("bossify:add-customer", open);
  }, []);

  const saveNewCustomer = async () => {
    if (!user) return;
    const name = newCustomer.name.trim();
    if (!name) { setNewCustomerErrors({ name: t("required_field") }); return; }
    setSavingNewCustomer(true);
    const fullPhone = newCustomer.phone.replace(/\D/g, "");

    // Dedupe: reuse an existing customer with same (user_id + phone) rather
    // than creating a duplicate zero-totals row.
    let data: CustomerRow | null = null;
    if (fullPhone) {
      const { data: existing } = await supabase
        .from("customers")
        .select("*")
        .eq("user_id", user.id)
        .eq("phone", fullPhone)
        .maybeSingle();
      if (existing) data = existing as CustomerRow;
    }
    if (!data) {
      const { data: inserted, error } = await (supabase as any).from("customers").insert({
        user_id: user.id,
        name,
        phone: fullPhone || null,
        total_orders: 0,
        total_spent: 0,
      }).select("*").single();
      if (error || !inserted) {
        setSavingNewCustomer(false);
        toast.error(error?.message ?? "Failed");
        return;
      }
      data = inserted as CustomerRow;
    }

    // Only write the note when a follow-up date is set — the textarea is
    // labeled "Check-in note" and its content belongs to the follow_up row.
    if (newCustomer.followup_date) {
      const { error: fuError } = await (supabase as any).from("follow_ups").insert({
        user_id: user.id,
        customer_id: data!.id,
        follow_up_date: newCustomer.followup_date,
        note: newCustomer.note.trim() || null,
        is_done: false,
      });
      if (!fuError) setFollowUpByCustomerId((prev) => ({ ...prev, [data!.id]: newCustomer.followup_date }));
    }
    setCustomers((prev) => [data as CustomerRow, ...prev.filter((c) => c.id !== data!.id)]);
    setNewCustomer({ name: "", phone: "", followup_date: "", note: "" });
    setNewCustomerErrors({});
    setNewCustomerOpen(false);
    setSavingNewCustomer(false);
    toast.success(t("bl_new_customer"));
  };

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

  const filtered = customers.filter((c) => {
    const q = query.toLowerCase();
    if (statusFilter !== "all" && (c.customer_status ?? "enquiry") !== statusFilter) return false;
    if (bizType === "property" && packageFilter !== "all") {
      if (packageFilter === "__none__") {
        if (c.package_id) return false;
      } else if (c.package_id !== packageFilter) {
        return false;
      }
    }
    if (dateFrom || dateTo) {
      const t = new Date(c.created_at).getTime();
      if (dateFrom && t < new Date(dateFrom + "T00:00:00").getTime()) return false;
      if (dateTo && t > new Date(dateTo + "T23:59:59").getTime()) return false;
    }
    return c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q);
  });
  const visible = [...filtered].sort((a, b) => {
    if (sortBy === "most_orders") {
      return (b.total_orders ?? 0) - (a.total_orders ?? 0);
    }
    if (sortBy === "top_spender") {
      return Number(b.total_spent ?? 0) - Number(a.total_spent ?? 0);
    }
    // recent: keep existing order (already by created_at desc from query)
    return 0;
  });
  const dateFilterActive = !!(dateFrom || dateTo);
  // Top 20% spend threshold across the currently visible retail list (spent > 0 only).
  const topSpenderThreshold = (() => {
    if (bizType !== "retail") return Number.POSITIVE_INFINITY;
    const spends = visible.map((c) => Number(c.total_spent ?? 0)).filter((v) => v > 0).sort((a, b) => b - a);
    if (spends.length === 0) return Number.POSITIVE_INFINITY;
    const idx = Math.max(0, Math.ceil(spends.length * 0.2) - 1);
    return spends[idx];
  })();
  const retailBadge = (c: CustomerRow): { label: string; cls: string } | null => {
    if (bizType !== "retail") return null;
    const spent = Number(c.total_spent ?? 0);
    if (spent > 0 && spent >= topSpenderThreshold) {
      return { label: t("customer_top_spender"), cls: "bg-amber-500/15 text-amber-700" };
    }
    if ((c.total_orders ?? 0) >= 2) return { label: t("customer_repeat"), cls: "bg-primary/10 text-primary" };
    if ((c.total_orders ?? 0) === 1) return { label: t("customer_new"), cls: "bg-emerald-500/15 text-emerald-700" };
    return null;
  };
  const dateLabel = lang === "zh" ? "时间" : lang === "ms" ? "Tarikh" : "Date";
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const daysAgoStr = (n: number) => {
    const d = new Date(); d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };

  const packageOptions = bizType === "property"
    ? Array.from(
        new Map(
          customers
            .filter((c) => c.package_id && c.package_name)
            .map((c) => [c.package_id as string, c.package_name as string]),
        ).entries(),
      )
    : [];

  // Desktop-only KPI row + Customer Insights panel data.
  const totalCustomers = customers.length;
  const totalOrdersAgg = Object.values(orderAgg).reduce((s, a) => s + a.orders, 0);
  const totalSalesAgg = Object.values(orderAgg).reduce((s, a) => s + a.sales, 0);
  const totalOutstandingAgg = Object.values(orderAgg).reduce((s, a) => s + a.outstanding, 0);
  const avgOrderValue = totalOrdersAgg > 0 ? totalSalesAgg / totalOrdersAgg : 0;
  const repeatCustomerCount = customers.filter((c) => (c.total_orders ?? 0) >= 2).length;
  const repeatRate = totalCustomers > 0 ? (repeatCustomerCount / totalCustomers) * 100 : 0;
  const withOutstandingCount = Object.values(orderAgg).filter((a) => a.outstanding > 0).length;

  const distributionData = bizType === "retail"
    ? (() => {
        let top = 0, repeat = 0, neu = 0, other = 0;
        customers.forEach((c) => {
          const b = retailBadge(c);
          if (b?.label === t("customer_top_spender")) top++;
          else if (b?.label === t("customer_repeat")) repeat++;
          else if (b?.label === t("customer_new")) neu++;
          else other++;
        });
        return [
          { name: t("customer_top_spender"), value: top, color: "#D4A017" },
          { name: t("customer_repeat"), value: repeat, color: "#3B82F6" },
          { name: t("customer_new"), value: neu, color: "#10B981" },
          { name: lang === "zh" ? "其他" : lang === "ms" ? "Lain" : "Other", value: other, color: "#9CA3AF" },
        ].filter((d) => d.value > 0);
      })()
    : CUSTOMER_STATUS_ORDER.map((s) => ({
        name: t(`cs_${s}` as any),
        value: customers.filter((c) => (c.customer_status ?? "enquiry") === s).length,
        color: s === "enquiry" ? "#3B82F6" : s === "in_progress" ? "#F59E0B" : s === "completed" ? "#10B981" : "#EF4444",
      })).filter((d) => d.value > 0);

  return (
    <div className="px-5 pt-10 pb-4 space-y-5 lg:max-w-6xl lg:mx-auto lg:px-8 lg:pt-8">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t(bizKey(bizType, "customers"))}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {customers.length} {t("total")}
        </span>
        {bizType === "property" && (
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/services"
              className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary text-primary-foreground active:scale-95 transition"
            >
              <Package className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />{t("bl_packages")}
            </Link>
            <button
              onClick={() => setNewCustomerOpen(true)}
              aria-label={t("bl_new_customer")}
              className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground text-base font-bold active:scale-95 transition"
            >
              +
            </button>
          </div>
        )}
        {bizType !== "property" && (
          <button
            onClick={() => setNewCustomerOpen(true)}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary text-primary-foreground active:scale-95 transition"
          >
            + {t("bl_new_customer")}
          </button>
        )}
      </header>

      <div className="hidden lg:grid lg:grid-cols-4 lg:gap-4">
        <CustomerKpiCard
          icon={Users}
          label={lang === "zh" ? "客户总数" : lang === "ms" ? "Jumlah Pelanggan" : "Total Customers"}
          value={String(totalCustomers)}
        />
        <CustomerKpiCard
          icon={ShoppingBag}
          label={lang === "zh" ? "订单总数" : lang === "ms" ? "Jumlah Pesanan" : "Total Orders"}
          value={String(totalOrdersAgg)}
        />
        <CustomerKpiCard
          icon={TrendingUp}
          label={lang === "zh" ? "销售总额" : lang === "ms" ? "Jumlah Jualan" : "Total Sales"}
          value={`RM ${totalSalesAgg.toFixed(2)}`}
        />
        <CustomerKpiCard
          icon={Wallet}
          label={lang === "zh" ? "未付款金额" : lang === "ms" ? "Belum Dibayar" : "Outstanding"}
          value={`RM ${totalOutstandingAgg.toFixed(2)}`}
          tone={totalOutstandingAgg > 0 ? "amber" : "default"}
        />
      </div>

      {tiktokBuyers.length > 0 && (
        <div className="space-y-2 lg:hidden">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
              <Repeat className="h-3.5 w-3.5" />
              {lang === "zh" ? "TikTok 回购客户" : lang === "ms" ? "Pelanggan Berulang TikTok" : "TikTok Repeat Buyers"}
            </p>
            {tiktokBuyers.length > 5 && (
              <Link to="/top-buyers" className="text-[11px] font-semibold text-primary shrink-0">
                {t("ro_view_all")}
              </Link>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground -mt-1">
            {lang === "zh" ? "无法显示真实姓名（TikTok 平台限制）" : lang === "ms" ? "Nama sebenar tidak tersedia (had platform)" : "Real names unavailable (platform limitation)"}
          </p>
          <div className="rounded-2xl bg-card border border-border/60 divide-y divide-border/40">
            {tiktokBuyers.slice(0, 5).map((b, idx) => (
              <div key={b.buyerId} className="flex items-center gap-3 p-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">#{idx + 1}</div>
                <p className="text-sm font-semibold flex-1">
                  {lang === "zh" ? `买家 #${idx + 1}` : lang === "ms" ? `Pembeli #${idx + 1}` : `Buyer #${idx + 1}`}
                </p>
                <p className="text-xs text-muted-foreground">{b.orders} {lang === "zh" ? "笔" : "orders"}</p>
                <p className="text-sm font-bold text-primary">RM {b.totalSpent.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {bizType === "education" && (
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-hide">
          <Link
            to="/pipeline-overview"
            className="shrink-0 text-[11px] font-semibold px-3 py-2 rounded-2xl bg-primary/10 text-primary active:scale-95 transition-transform"
          >
            <BarChart3 className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />{t("pipeline_overview")}
          </Link>
          <Link
            to="/services-summary"
            className="shrink-0 text-[11px] font-semibold px-3 py-2 rounded-2xl bg-primary/10 text-primary active:scale-95 transition-transform"
          >
            <GraduationCap className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />{t("services_summary")}
          </Link>
          <Link
            to="/clients-compare"
            className="shrink-0 text-[11px] font-semibold px-3 py-2 rounded-2xl bg-primary text-primary-foreground active:scale-95 transition-transform"
          >
            <Scale className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />{t("edu_compare")}
          </Link>
          <div className="ml-auto inline-flex rounded-2xl bg-muted p-0.5 shrink-0">
            <button
              onClick={() => setViewMode("list")}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-xl transition ${viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              <List className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />{t("view_list")}
            </button>
            <button
              onClick={() => setViewMode("kanban")}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-xl transition ${viewMode === "kanban" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />{t("view_kanban")}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-5 lg:space-y-0 lg:flex lg:flex-wrap lg:items-center lg:gap-4">
      <div className="relative lg:flex-1 lg:min-w-[280px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(searchKey)}
          className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
        />
      </div>

      {bizType !== "retail" && (
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-hide lg:order-last lg:basis-full">
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
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${CUSTOMER_STATUS_DOT[s]}`} /> {t(`cs_${s}` as any)}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 scrollbar-hide lg:shrink-0 lg:mx-0 lg:px-0">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pr-1">
          {t("sort_by")}
        </span>
        {([
          { id: "recent", label: t("sort_recent"), icon: Clock },
          { id: "most_orders", label: t("sort_most_orders"), icon: Package },
          { id: "top_spender", label: t("sort_top_spender"), icon: Gem },
        ] as const).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setSortBy(opt.id)}
            className={`shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full transition active:scale-95 ${
              sortBy === opt.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <opt.icon className="h-3 w-3 inline-block mr-1 -mt-0.5" />{opt.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 lg:shrink-0">
        <button
          type="button"
          onClick={() => setDateOpen((v) => !v)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
            dateFilterActive
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-foreground border-border"
          }`}
        >
          <Calendar className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />{dateLabel}
          {dateFilterActive && <span className="text-[10px] opacity-80">●</span>}
        </button>
        {dateFilterActive && (
          <button
            type="button"
            onClick={() => { setDateFrom(""); setDateTo(""); }}
            className="text-[11px] text-muted-foreground underline"
          >
            {lang === "zh" ? "清除" : lang === "ms" ? "Buang" : "Clear"}
          </button>
        )}
        {dateFilterActive && (
          <span className="text-[11px] text-muted-foreground ml-auto">
            {visible.length} {lang === "zh" ? "条结果" : lang === "ms" ? "hasil" : "results"}
          </span>
        )}
      </div>
      </div>

      {dateOpen && (
        <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-3 space-y-2">
          <div className="flex gap-2">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 rounded-xl bg-muted/40 border border-border/60 px-3 py-2 text-sm outline-none focus:border-primary" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 rounded-xl bg-muted/40 border border-border/60 px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => { setDateFrom(todayStr()); setDateTo(todayStr()); }}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-full bg-muted text-muted-foreground active:scale-95 transition-transform">
              {lang.startsWith("zh") ? "今天" : lang.startsWith("ms") ? "Hari ini" : "Today"}
            </button>
            <button onClick={() => { setDateFrom(daysAgoStr(6)); setDateTo(todayStr()); }}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-full bg-muted text-muted-foreground active:scale-95 transition-transform">
              {lang.startsWith("zh") ? "近7天" : lang.startsWith("ms") ? "7 hari" : "Last 7 days"}
            </button>
            <button onClick={() => { setDateFrom(daysAgoStr(29)); setDateTo(todayStr()); }}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-full bg-muted text-muted-foreground active:scale-95 transition-transform">
              {lang.startsWith("zh") ? "近30天" : lang.startsWith("ms") ? "30 hari" : "Last 30 days"}
            </button>
            {dateFilterActive && (
              <button onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-full bg-muted text-muted-foreground active:scale-95 ml-auto transition-transform">
                {lang.startsWith("zh") ? "清除" : lang.startsWith("ms") ? "Padam" : "Clear"}
              </button>
            )}
          </div>
        </div>
      )}

      {bizType === "property" && packageOptions.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-hide">
          <button
            onClick={() => setPackageFilter("all")}
            className={`shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full transition active:scale-95 ${packageFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            <Package className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />{t("all_packages")}
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

      <div className="lg:hidden space-y-3">
        {loading && (
          <div className="flex justify-center py-10 lg:col-span-full">
            <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}
        {!loading && customers.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10 px-4 lg:col-span-full">{t("no_customers_create")}</p>
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
                  <p className="text-[11px] text-primary font-medium mt-0.5 truncate flex items-center gap-1"><Smartphone className="h-3 w-3 shrink-0" /> {c.phone}</p>
                )}
                {followUpByCustomerId[c.id] && (
                  <p className="text-[11px] text-amber-600 font-medium mt-0.5 truncate flex items-center gap-1">
                    <Calendar className="h-3 w-3 shrink-0" /> {new Date(followUpByCustomerId[c.id] + "T00:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short" })}
                  </p>
                )}
                {bizType === "education" ? (
                  <>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {eduDetails[c.id]?.university_preference
                        ? <><School className="h-3 w-3 inline-block mr-1 -mt-0.5" />{eduDetails[c.id]!.university_preference}{eduDetails[c.id]?.application_status ? ` · ${eduDetails[c.id]!.application_status}` : ""}</>
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
                  <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    <Package className="h-2.5 w-2.5" /> {c.package_name}
                  </span>
                )}
                {c.remarks && (
                  <p className="text-[11px] text-muted-foreground/90 mt-1 truncate italic flex items-center gap-1">
                    <MessageCircle className="h-3 w-3 shrink-0 not-italic" /> {c.remarks.length > 50 ? c.remarks.slice(0, 50) + "…" : c.remarks}
                  </p>
                )}
              </div>
            </Link>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <p className="text-sm font-bold text-primary">RM {Number(c.total_spent).toFixed(0)}</p>
              {bizType === "retail" ? (
                (() => {
                  const b = retailBadge(c);
                  return b ? (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${b.cls}`}>{b.label}</span>
                  ) : null;
                })()
              ) : (
                <button
                  onClick={() => cycleStatus(c)}
                  aria-label="Status"
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full active:scale-95 transition ${CUSTOMER_STATUS_STYLES[(c.customer_status ?? "enquiry") as CustomerStatus]}`}
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${CUSTOMER_STATUS_DOT[(c.customer_status ?? "enquiry") as CustomerStatus]}`} /> {t(`cs_${(c.customer_status ?? "enquiry") as CustomerStatus}` as any)}
                </button>
              )}
              {bizType === "education" && (
                <div className="flex gap-1">
                  <Link
                    to="/customer/$customerId"
                    params={{ customerId: c.id }}
                    hash="pipeline"
                    aria-label={t("open_pipeline")}
                    className="text-[10px] font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary active:scale-95 transition-transform"
                  >
                    <Phone className="h-3 w-3" />
                  </Link>
                  <Link
                    to="/customer/$customerId"
                    params={{ customerId: c.id }}
                    hash="services"
                    aria-label={t("open_services")}
                    className="text-[10px] font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary active:scale-95 transition-transform"
                  >
                    <GraduationCap className="h-3 w-3" />
                  </Link>
                </div>
              )}
              <button
                onClick={() => {
                  if (!c.phone) { toast.error(t("no_phone_for_wa")); return; }
                  window.open(buildWA(c.phone, t("thank_customer_msg" as TKey).replace("{name}", c.name)), "_blank");
                }}
                id={idx === 0 ? "tour-cust-wa" : undefined}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500 text-white active:scale-95 transition-transform"
              >
                <MessageCircle className="h-3 w-3 inline-block mr-1 -mt-0.5" />WA
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

      {!loading && customers.length > 0 && (
        <div className="hidden lg:block lg:space-y-5">
          <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">{lang === "zh" ? "客户" : lang === "ms" ? "Pelanggan" : "Customer"}</th>
                  <th className="px-4 py-3 text-right">{lang === "zh" ? "订单" : lang === "ms" ? "Pesanan" : "Orders"}</th>
                  <th className="px-4 py-3 text-right">{lang === "zh" ? "销售总额" : lang === "ms" ? "Jualan" : "Total Sales"}</th>
                  <th className="px-4 py-3 text-right">{lang === "zh" ? "总利润" : lang === "ms" ? "Keuntungan" : "Total Profit"}</th>
                  <th className="px-4 py-3 text-right">{lang === "zh" ? "未付款" : lang === "ms" ? "Belum Bayar" : "Outstanding"}</th>
                  <th className="px-4 py-3">{lang === "zh" ? "最后订单" : lang === "ms" ? "Pesanan Terakhir" : "Last Order"}</th>
                  <th className="px-4 py-3">{lang === "zh" ? "状态" : lang === "ms" ? "Status" : "Status"}</th>
                  <th className="px-4 py-3 text-right">{lang === "zh" ? "操作" : lang === "ms" ? "Tindakan" : "Action"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {visible.map((c) => {
                  const a = orderAgg[c.id] ?? { orders: 0, sales: 0, profit: 0, outstanding: 0 };
                  const b = bizType === "retail" ? retailBadge(c) : null;
                  return (
                    <tr key={c.id} className="hover:bg-muted/30 transition">
                      <td className="px-4 py-3">
                        <Link to="/customer/$customerId" params={{ customerId: c.id }} className="flex items-center gap-2.5 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold text-xs shrink-0">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate">{c.name}</p>
                            {c.phone && <p className="text-[11px] text-muted-foreground truncate">{c.phone}</p>}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right text-foreground">{a.orders}</td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">RM {a.sales.toFixed(2)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${a.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        RM {a.profit.toFixed(2)}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${a.outstanding > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                        {a.outstanding > 0 ? `RM ${a.outstanding.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{relTime(c.last_order_at, t)}</td>
                      <td className="px-4 py-3">
                        {bizType === "retail" ? (
                          b ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${b.cls}`}>{b.label}</span> : <span className="text-muted-foreground text-xs">—</span>
                        ) : (
                          <button
                            onClick={() => cycleStatus(c)}
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full active:scale-95 transition ${CUSTOMER_STATUS_STYLES[(c.customer_status ?? "enquiry") as CustomerStatus]}`}
                          >
                            {t(`cs_${(c.customer_status ?? "enquiry") as CustomerStatus}` as any)}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              if (!c.phone) { toast.error(t("no_phone_for_wa")); return; }
                              window.open(buildWA(c.phone, t("thank_customer_msg" as TKey).replace("{name}", c.name)), "_blank");
                            }}
                            aria-label="WhatsApp"
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-500/10 transition"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => navigate({ to: "/customer/$customerId", params: { customerId: c.id } })}
                            aria-label="Edit"
                            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(c)}
                            aria-label="Delete"
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">{t("no_customers")}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-3 gap-5 items-start">
            <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {lang === "zh" ? "客户洞察" : lang === "ms" ? "Wawasan Pelanggan" : "Customer Insights"}
              </p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{lang === "zh" ? "平均订单金额" : lang === "ms" ? "Purata Nilai Pesanan" : "Avg. Order Value"}</span>
                <span className="font-semibold text-foreground">RM {avgOrderValue.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{lang === "zh" ? "回购率" : lang === "ms" ? "Kadar Ulangan" : "Repeat Rate"}</span>
                <span className="font-semibold text-foreground">{repeatRate.toFixed(0)}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{lang === "zh" ? "有未付款的客户" : lang === "ms" ? "Ada Belum Bayar" : "With Outstanding"}</span>
                <span className={`font-semibold ${withOutstandingCount > 0 ? "text-amber-600" : "text-foreground"}`}>{withOutstandingCount}</span>
              </div>
            </div>

            {distributionData.length > 0 && (
              <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {lang === "zh" ? "客户分布" : lang === "ms" ? "Taburan Pelanggan" : "Customer Distribution"}
                </p>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={distributionData} dataKey="value" nameKey="name" innerRadius={38} outerRadius={60} paddingAngle={2}>
                        {distributionData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => [v, lang === "zh" ? "位客户" : "customers"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5">
                  {distributionData.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                        {d.name}
                      </span>
                      <span className="font-semibold text-foreground">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tiktokBuyers.length > 0 && (
              <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Repeat className="h-3.5 w-3.5" />
                    {lang === "zh" ? "TikTok 回购客户" : lang === "ms" ? "Pelanggan Berulang TikTok" : "TikTok Repeat Buyers"}
                  </p>
                  {tiktokBuyers.length > 5 && (
                    <Link to="/top-buyers" className="text-[11px] font-semibold text-primary shrink-0">
                      {t("ro_view_all")}
                    </Link>
                  )}
                </div>
                <div className="divide-y divide-border/40">
                  {tiktokBuyers.slice(0, 5).map((b, idx) => (
                    <div key={b.buyerId} className="flex items-center gap-3 py-2">
                      <span className="w-6 text-xs font-bold text-primary shrink-0">#{idx + 1}</span>
                      <span className="text-sm font-semibold flex-1 truncate">
                        {lang === "zh" ? `买家 #${idx + 1}` : lang === "ms" ? `Pembeli #${idx + 1}` : `Buyer #${idx + 1}`}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">{b.orders} {lang === "zh" ? "笔" : "orders"}</span>
                      <span className="text-sm font-bold text-primary font-mono shrink-0">RM {b.totalSpent.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {lang === "zh" ? "无法显示真实姓名（TikTok 平台限制）" : lang === "ms" ? "Nama sebenar tidak tersedia (had platform)" : "Real names unavailable (platform limitation)"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {newCustomerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setNewCustomerOpen(false)}>
          <div className="w-full max-w-[420px] bg-card rounded-t-3xl p-5 space-y-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">{t("bl_new_customer")}</h2>
              <button onClick={() => setNewCustomerOpen(false)} className="p-2 rounded-full hover:bg-muted" aria-label={t("cancel")}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("customer_name")}</label>
              <input
                value={newCustomer.name}
                onChange={(e) => { setNewCustomer((p) => ({ ...p, name: e.target.value })); setNewCustomerErrors({}); }}
                placeholder={t("f_client_name_ph")}
                className={`w-full rounded-2xl bg-card border shadow-[var(--shadow-card)] px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition ${newCustomerErrors.name ? "border-red-400" : "border-border/60"}`}
              />
              {newCustomerErrors.name && <p className="text-[11px] text-red-500 px-1">{newCustomerErrors.name}</p>}
            </div>
            <PhoneInput
              label={t("phone_number")}
              value={newCustomer.phone}
              onChange={(v) => setNewCustomer((p) => ({ ...p, phone: v }))}
            />
            <div className="space-y-2 rounded-2xl bg-muted/30 border border-border/60 p-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("f_followup_date")}</label>
                <input
                  type="date"
                  value={newCustomer.followup_date}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, followup_date: e.target.value }))}
                  className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] px-4 py-3 text-sm text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("checkin_note")}</label>
                <textarea
                  rows={3}
                  value={newCustomer.note}
                  disabled={!newCustomer.followup_date}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, note: e.target.value }))}
                  placeholder={t("checkin_note_ph")}
                  className="w-full rounded-2xl bg-card border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <button
              onClick={saveNewCustomer}
              disabled={savingNewCustomer}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm active:scale-[0.99] transition-transform disabled:opacity-60"
            >
              {savingNewCustomer ? t("saving") : t("save")}
            </button>
          </div>
        </div>
      )}

      {menuFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setMenuFor(null)}>
          <div className="w-full max-w-[420px] bg-card rounded-t-3xl p-3 space-y-1 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-semibold text-muted-foreground px-3 py-2 truncate">{menuFor.name}</p>
            <button
              onClick={() => { const c = menuFor; setMenuFor(null); navigate({ to: "/customer/$customerId", params: { customerId: c.id } }); }}
              className="w-full text-left px-4 py-3 rounded-2xl text-sm font-semibold hover:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />{t("edit_customer")}
            </button>
            <button
              onClick={() => { setConfirmDelete(menuFor); setMenuFor(null); }}
              className="w-full text-left px-4 py-3 rounded-2xl text-sm font-semibold text-red-500 hover:bg-red-500/10"
            >
              <Trash2 className="h-3.5 w-3.5 inline-block mr-1.5 -mt-0.5" />{t("delete_customer")}
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
              <div className="h-10 w-10 rounded-full bg-red-500/15 text-red-500 flex items-center justify-center"><AlertTriangle className="h-5 w-5" /></div>
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