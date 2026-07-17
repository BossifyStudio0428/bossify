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

  const handleFinancial = async () => {
    if (!gate() || busy) return;
    setBusy("financial");
    await new Promise((r) => setTimeout(r, 30));
    try {
      const { businessName, logoDataUrl } = await getProfile();
      const paid = inRange.filter((o) => o.status === "Paid");
      const revenue = paid.reduce((s, o) => s + Number(o.amount), 0);
      const cogs = paid.reduce((s, o) => s + orderCost(o), 0);
      const grossProfit = paid.reduce((s, o) => s + orderGrossProfit(o), 0);
      const margin = orderProfitMargin(revenue, grossProfit);
      const orderCount = paid.length;
      const avgOrder = orderCount > 0 ? revenue / orderCount : 0;
      const unpaidAmount = inRange.filter((o) => o.status === "Unpaid").reduce((s, o) => s + Number(o.amount), 0);
      await exportFinancialReportPDF({
        lang, businessName, logoDataUrl, rangeLabel: label,
        revenue, cogs, grossProfit, margin, orderCount, avgOrder, unpaidAmount,
      });
    } catch (e) { console.error("[reports] financial pdf failed", e); toast.error(t("pdf_failed")); }
    finally { setBusy(null); }
  };

  const openCustomerPicker = async () => {
    if (!gate() || busy) return;
    setPickCustomer(true);
    if (customerList.length === 0 && user?.id) {
      const { data } = await supabase
        .from("customers")
        .select("id,name,phone,total_orders,total_spent,last_order_at")
        .eq("user_id", user.id)
        .order("name", { ascending: true });
      setCustomerList((data ?? []) as typeof customerList);
    }
  };

  const handleCustomerStatement = async (c: { id: string; name: string; phone: string | null; total_orders: number; total_spent: number; last_order_at: string | null }) => {
    if (busy) return;
    setBusy("customer");
    setPickCustomer(false);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const { businessName, logoDataUrl } = await getProfile();
      // Match orders by phone OR customer_name (mirrors Customer Detail logic).
      const nphone = (c.phone ?? "").replace(/\D/g, "");
      const rows = inRange.filter((o) => {
        const op = (o.phone ?? "").replace(/\D/g, "");
        if (nphone && op && op === nphone) return true;
        return (o.customer_name ?? "").trim().toLowerCase() === c.name.trim().toLowerCase();
      });
      const unpaidBalance = rows.filter((o) => o.status === "Unpaid").reduce((s, o) => s + Number(o.amount), 0);
      const totalSpent = rows.filter((o) => o.status === "Paid").reduce((s, o) => s + Number(o.amount), 0);
      await exportCustomerStatementPDF({
        lang, businessName, logoDataUrl, rangeLabel: label,
        customerName: c.name,
        phone: c.phone,
        totalOrders: rows.length,
        totalSpent,
        unpaidBalance,
        lastOrderAt: c.last_order_at,
        rows: rows.map((o) => ({
          date: new Date(o.created_at).toLocaleDateString("en-MY"),
          code: o.code, product: o.product,
          qty: Number(o.quantity), amount: Number(o.amount), status: o.status,
        })),
      });
    } catch (e) { console.error("[reports] customer statement failed", e); toast.error(t("pdf_failed")); }
    finally { setBusy(null); }
  };

  const handleSupplier = async () => {
    if (!gate() || busy || !user?.id) return;
    setBusy("supplier");
    await new Promise((r) => setTimeout(r, 30));
    try {
      const { businessName, logoDataUrl } = await getProfile();
      const [{ data: sups }, { data: pos }] = await Promise.all([
        supabase.from("suppliers").select("id,name,contact").eq("user_id", user.id).order("name"),
        supabase.from("purchase_orders")
          .select("id,supplier_id,order_date,status,total_amount")
          .eq("user_id", user.id)
          .gte("order_date", fromDate.toISOString().slice(0, 10))
          .lte("order_date", toDate.toISOString().slice(0, 10))
          .order("order_date", { ascending: false }),
      ]);
      const poIds = (pos ?? []).map((p: { id: string }) => p.id);
      let items: Array<{ purchase_order_id: string; name: string; quantity: number; unit: string | null; unit_price: number; total_price: number }> = [];
      if (poIds.length) {
        const { data: its } = await supabase
          .from("purchase_order_items")
          .select("purchase_order_id,name,quantity,unit,unit_price,total_price")
          .in("purchase_order_id", poIds);
        items = (its ?? []) as typeof items;
      }
      const posBySupplier = new Map<string, typeof pos>();
      (pos ?? []).forEach((p) => {
        const arr = posBySupplier.get(p.supplier_id) ?? [];
        arr.push(p);
        posBySupplier.set(p.supplier_id, arr);
      });
      const poMeta = new Map<string, { supplier_id: string; order_date: string }>();
      (pos ?? []).forEach((p) => poMeta.set(p.id, { supplier_id: p.supplier_id, order_date: p.order_date }));

      const blocks: SupplierBlock[] = (sups ?? []).map((s: { id: string; name: string; contact: string | null }) => {
        const sPos = posBySupplier.get(s.id) ?? [];
        const sItems = items.filter((it) => poMeta.get(it.purchase_order_id)?.supplier_id === s.id);
        return {
          supplier: s.name,
          contact: s.contact,
          poCount: sPos.length,
          totalSpend: sPos.reduce((a, p) => a + Number(p.total_amount ?? 0), 0),
          pos: sPos.map((p) => ({
            date: p.order_date,
            code: p.id.slice(0, 8),
            status: p.status ?? "—",
            total: Number(p.total_amount ?? 0),
          })),
          items: sItems.map((it) => ({
            date: poMeta.get(it.purchase_order_id)?.order_date ?? "",
            name: it.name,
            qty: Number(it.quantity ?? 0),
            unit: it.unit ?? "",
            unitPrice: Number(it.unit_price ?? 0),
            total: Number(it.total_price ?? 0),
          })),
        };
      }).filter((b) => b.poCount > 0 || b.items.length > 0);

      await exportSupplierReportPDF({
        lang, businessName, logoDataUrl, rangeLabel: label, blocks,
      });
    } catch (e) { console.error("[reports] supplier pdf failed", e); toast.error(t("pdf_failed")); }
    finally { setBusy(null); }
  };

  const handleRecon = async () => {
    if (!gate() || busy) return;
    setBusy("recon");
    await new Promise((r) => setTimeout(r, 30));
    try {
      const { businessName, logoDataUrl } = await getProfile();
      await exportOrderReconciliationPDF({
        lang, businessName, logoDataUrl, rangeLabel: label,
        orders: inRange.map((o) => ({
          created_at: o.created_at,
          code: o.code,
          customer_name: o.customer_name,
          amount: Number(o.amount),
          status: o.status,
          payment_method: o.payment_method ?? null,
          order_source: o.order_source ?? null,
        })),
      });
    } catch (e) { console.error("[reports] recon pdf failed", e); toast.error(t("pdf_failed")); }
    finally { setBusy(null); }
  };

  const cards: Array<{
    key: "sales" | "profit" | "stock" | "financial" | "customer" | "supplier" | "recon";
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
    { key: "financial", icon: FileText, title: t("reports_financial_title"), desc: t("reports_financial_desc"), onExport: handleFinancial, tint: "bg-sky-50 text-sky-600" },
    { key: "customer", icon: Users, title: t("reports_customer_title"), desc: t("reports_customer_desc"), onExport: openCustomerPicker, tint: "bg-fuchsia-50 text-fuchsia-600" },
    { key: "supplier", icon: Truck, title: t("reports_supplier_title"), desc: t("reports_supplier_desc"), onExport: handleSupplier, tint: "bg-orange-50 text-orange-600" },
    { key: "recon", icon: ClipboardCheck, title: t("reports_recon_title"), desc: t("reports_recon_desc"), onExport: handleRecon, tint: "bg-teal-50 text-teal-600" },
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

      {pickCustomer && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setPickCustomer(false)}>
          <div className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl p-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-sm font-bold flex-1">{t("reports_customer_pick")}</p>
              <button onClick={() => setPickCustomer(false)} className="p-1 rounded-full active:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <input
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              placeholder={t("search")}
              className="w-full rounded-xl bg-muted px-3 py-2 text-sm mb-2"
            />
            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              {customerList
                .filter((c) => {
                  const q = customerQuery.trim().toLowerCase();
                  if (!q) return true;
                  return c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q);
                })
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleCustomerStatement(c)}
                    className="w-full text-left px-3 py-2.5 rounded-xl active:bg-muted flex items-center gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{c.phone ?? "—"} · {c.total_orders} · RM {Number(c.total_spent ?? 0).toFixed(2)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              {customerList.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">{t("loading")}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
