import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, BarChart3, TrendingUp, Package, FileText, Users, Truck, ClipboardCheck, X } from "lucide-react";
import { toast } from "sonner";
import { supabase, type OrderRow } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { orderCost, orderGrossProfit, orderProfitMargin } from "@/lib/orderMath";
import {
  exportSalesReportPDF,
  exportProfitReportPDF,
  exportStockReportPDF,
  exportFinancialReportPDF,
  exportCustomerStatementPDF,
  exportSupplierReportPDF,
  exportOrderReconciliationPDF,
  type StockInvRow,
  type SupplierBlock,
} from "@/lib/pdf";
import { REPORTS_HUB_MODE } from "@/lib/featureFlags";

export const Route = createFileRoute("/reports/")({ component: ReportsHub });

type Range = "today" | "week" | "month" | "custom";

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23,59,59,999); return x; }

function ReportsHub() {
  if (!REPORTS_HUB_MODE) return <Navigate to="/reports/sales" replace />;

  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { hasFullAccess, showUpgrade } = useSubscription();
  const { type: bizType } = useBusinessType();
  const eff = (bizType ?? "retail") as
    | "retail" | "fnb" | "education" | "beauty" | "property" | "freelance";

  const [range, setRange] = useState<Range>("month");
  const [from, setFrom] = useState<string>(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  type OrderExt = OrderRow & { payment_method?: string | null; order_source?: string | null };
  const [orders, setOrders] = useState<OrderExt[]>([]);
  const [busy, setBusy] = useState<null | "sales" | "profit" | "stock" | "financial" | "customer" | "supplier" | "recon">(null);
  const [pickCustomer, setPickCustomer] = useState(false);
  const [customerList, setCustomerList] = useState<Array<{ id: string; name: string; phone: string | null; total_orders: number; total_spent: number; last_order_at: string | null }>>([]);
  const [customerQuery, setCustomerQuery] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,code,customer_name,phone,product,quantity,amount,cost,gross_profit,status,created_at,payment_method,order_source")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!cancelled) setOrders((data ?? []) as OrderExt[]);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const { fromDate, toDate, label } = useMemo(() => {
    const now = new Date();
    if (range === "today") return { fromDate: startOfDay(now), toDate: endOfDay(now), label: t("today_label") };
    if (range === "week") {
      const f = new Date(now); f.setDate(f.getDate() - 6);
      return { fromDate: startOfDay(f), toDate: endOfDay(now), label: t("this_week") };
    }
    if (range === "month") {
      const f = new Date(now.getFullYear(), now.getMonth(), 1);
      return { fromDate: f, toDate: endOfDay(now), label: t("this_month") };
    }
    return { fromDate: startOfDay(new Date(from)), toDate: endOfDay(new Date(to)), label: `${from} → ${to}` };
  }, [range, from, to, t]);

  const inRange = useMemo(
    () => orders.filter((o) => {
      const d = new Date(o.created_at);
      return d >= fromDate && d <= toDate;
    }),
    [orders, fromDate, toDate],
  );

  async function getProfile() {
    const { data } = await supabase
      .from("profiles")
      .select("business_name,avatar_url")
      .eq("id", user?.id ?? "")
      .maybeSingle();
    return {
      businessName: profile_or_email(data?.business_name, user?.email),
      logoDataUrl: (data?.avatar_url as string | null) ?? null,
    };
  }

  function profile_or_email(name: string | null | undefined, email: string | undefined) {
    return name && name.trim().length > 0 ? name : (email?.split("@")[0] ?? "My Store");
  }

  const gate = () => {
    if (!hasFullAccess) { showUpgrade(t("export_pdf")); return false; }
    return true;
  };

  const handleSales = async () => {
    if (!gate() || busy) return;
    setBusy("sales");
    await new Promise((r) => setTimeout(r, 30));
    try {
      const { businessName, logoDataUrl } = await getProfile();
      const paid = inRange.filter((o) => o.status === "Paid");
      const totalRevenue = paid.reduce((s, o) => s + Number(o.amount), 0);
      const totalCost = paid.reduce((s, o) => s + orderCost(o), 0);
      const grossProfit = paid.reduce((s, o) => s + orderGrossProfit(o), 0);
      const profitMargin = orderProfitMargin(totalRevenue, grossProfit);
      const totalOrders = inRange.length;
      const paidOrders = paid.length;
      const unpaidAmount = inRange.filter((o) => o.status === "Unpaid").reduce((s, o) => s + Number(o.amount), 0);
      const pendingCount = inRange.filter((o) => o.status === "Pending").length;
      const unpaidCount = inRange.filter((o) => o.status === "Unpaid").length;

      const prodMap = new Map<string, { qty: number; revenue: number }>();
      inRange.forEach((o) => {
        const cur = prodMap.get(o.product) ?? { qty: 0, revenue: 0 };
        cur.qty += Number(o.quantity);
        if (o.status === "Paid") cur.revenue += Number(o.amount);
        prodMap.set(o.product, cur);
      });
      const topProducts = [...prodMap.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.qty - a.qty).slice(0, 5);

      const custMap = new Map<string, { orders: number; spent: number }>();
      inRange.forEach((o) => {
        const cur = custMap.get(o.customer_name) ?? { orders: 0, spent: 0 };
        cur.orders += 1;
        if (o.status === "Paid") cur.spent += Number(o.amount);
        custMap.set(o.customer_name, cur);
      });
      const topCustomers = [...custMap.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.spent - a.spent).slice(0, 5);

      await exportSalesReportPDF({
        lang, bizType: eff, businessName, logoDataUrl,
        rangeLabel: label,
        totalRevenue, totalCost, grossProfit, profitMargin,
        totalOrders, paidOrders, unpaidAmount,
        pendingCount, unpaidCount, completedCount: paidOrders,
        topProducts,
        topCustomers,
        rows: inRange.map((o) => ({
          date: new Date(o.created_at).toLocaleDateString("en-MY"),
          code: o.code, customer: o.customer_name, product: o.product,
          qty: Number(o.quantity), amount: Number(o.amount), status: o.status,
        })),
      });
    } catch (e) { console.error("[reports] sales pdf failed", e); toast.error(t("pdf_failed")); }
    finally { setBusy(null); }
  };

  const handleProfit = async () => {
    if (!gate() || busy) return;
    setBusy("profit");
    await new Promise((r) => setTimeout(r, 30));
    try {
      const { businessName, logoDataUrl } = await getProfile();
      const paid = inRange.filter((o) => o.status === "Paid");
      const revenue = paid.reduce((s, o) => s + Number(o.amount), 0);
      const cost = paid.reduce((s, o) => s + orderCost(o), 0);
      const grossProfit = paid.reduce((s, o) => s + orderGrossProfit(o), 0);
      const margin = orderProfitMargin(revenue, grossProfit);
      const orderCount = paid.length;
      const avgPerOrder = orderCount > 0 ? grossProfit / orderCount : 0;

      const m = new Map<string, { qty: number; revenue: number; cost: number; profit: number }>();
      paid.forEach((o) => {
        const cur = m.get(o.product) ?? { qty: 0, revenue: 0, cost: 0, profit: 0 };
        cur.qty += Number(o.quantity);
        cur.revenue += Number(o.amount);
        cur.cost += orderCost(o);
        cur.profit += orderGrossProfit(o);
        m.set(o.product, cur);
      });
      const products = [...m.entries()].map(([name, v]) => {
        const marginPct = v.revenue > 0 ? (v.profit / v.revenue) * 100 : 0;
        return { name, ...v, margin: marginPct };
      });
      const top = [...products].sort((a, b) => b.profit - a.profit).slice(0, 10);
      const bottom = [...products].sort((a, b) => a.profit - b.profit).slice(0, 10);

      await exportProfitReportPDF({
        lang, businessName, logoDataUrl, rangeLabel: label,
        revenue, cost, grossProfit, margin, orderCount, avgPerOrder,
        top, bottom,
      });
    } catch (e) { console.error("[reports] profit pdf failed", e); toast.error(t("pdf_failed")); }
    finally { setBusy(null); }
  };

  const handleStock = async () => {
    if (!gate() || busy) return;
    setBusy("stock");
    await new Promise((r) => setTimeout(r, 30));
    try {
      const { businessName, logoDataUrl } = await getProfile();
      const { data } = await supabase
        .from("inventory")
        .select("id,name,stock,price,cost_price")
        .eq("user_id", user?.id ?? "")
        .order("name", { ascending: true });
      const items = ((data ?? []) as StockInvRow[]);

      await exportStockReportPDF({
        lang, businessName, logoDataUrl,
        items,
      });
    } catch (e) { console.error("[reports] stock pdf failed", e); toast.error(t("pdf_failed")); }
    finally { setBusy(null); }
  };

  const cards: Array<{
    key: "sales" | "profit" | "stock";
    icon: typeof BarChart3;
    title: string;
    desc: string;
    onExport: () => void;
    linkTo?: "/reports/sales";
    tint: string;
  }> = [
    { key: "sales", icon: BarChart3, title: t("reports_sales_title"), desc: t("reports_sales_desc"), onExport: handleSales, linkTo: "/reports/sales", tint: "bg-primary/10 text-primary" },
    { key: "profit", icon: TrendingUp, title: t("reports_profit_title"), desc: t("reports_profit_desc"), onExport: handleProfit, tint: "bg-emerald-50 text-emerald-600" },
    { key: "stock", icon: Package, title: t("reports_stock_title"), desc: t("reports_stock_desc"), onExport: handleStock, tint: "bg-amber-50 text-amber-600" },
  ];

  return (
    <div className="px-5 pt-10 pb-6 space-y-5">
      {!hasFullAccess && (
        <div className="rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/40 p-4 flex items-center gap-3">
          <span className="text-2xl">🔒</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">{t("upgrade_title")}</p>
            <p className="text-[11px] text-muted-foreground">{t("upgrade_desc")}</p>
          </div>
          <Link to="/plans" className="text-xs font-bold px-3 py-2 rounded-xl bg-primary text-primary-foreground whitespace-nowrap">
            {t("upgrade_to_pro")}
          </Link>
        </div>
      )}
      <header className="flex items-center gap-2">
        <Link to="/profile" className="-ml-2 p-2 rounded-full active:bg-muted"><ChevronLeft className="h-5 w-5" /></Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("reports_hub_title")}</h1>
      </header>

      <div className="-mx-5 px-5 overflow-x-auto scrollbar-none">
        <div className="flex gap-2 w-max">
          {(["today", "week", "month", "custom"] as Range[]).map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${range === r ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {r === "today" ? t("today_label") : r === "week" ? t("this_week") : r === "month" ? t("this_month") : t("custom")}
            </button>
          ))}
        </div>
      </div>

      {range === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">{t("from_date")}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-xl bg-card border border-border/60 px-3 py-2 text-sm" /></label>
          <label className="text-xs">{t("to_date")}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-xl bg-card border border-border/60 px-3 py-2 text-sm" /></label>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground -mt-2">
        {t("reports_hub_hint")}
      </p>

      <section className="space-y-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const isBusy = busy === c.key;
          return (
            <div key={c.key} className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
              <div className="flex items-start gap-3">
                <span className={`h-10 w-10 rounded-xl flex items-center justify-center ${c.tint}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">{c.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{c.desc}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={c.onExport}
                  disabled={isBusy || busy !== null}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-xs active:scale-[0.98] transition disabled:opacity-60"
                >
                  {isBusy ? "…" : `📄 ${t("reports_open_pdf")}`}
                </button>
                {c.linkTo && (
                  <Link
                    to={c.linkTo}
                    className="px-3 py-2.5 rounded-xl bg-muted text-foreground text-xs font-semibold flex items-center gap-1 active:scale-[0.98]"
                  >
                    {t("reports_view_details")} <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
