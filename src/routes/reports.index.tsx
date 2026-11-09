import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, BarChart3, TrendingUp, Package, FileText, Users, Truck, ClipboardCheck, X, Lock, AlertTriangle, FileDown } from "lucide-react";
import { toast } from "sonner";
import { supabase, type OrderRow } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { orderCost, orderGrossProfit, orderProfitMargin } from "@/lib/orderMath";
import { downloadCSV } from "@/lib/csvExport";
import { loadPrefs } from "@/lib/notifPrefs";
import { fetchPeriodAdjustments } from "@/lib/refundAdjustments";
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

type OrderItemRow = {
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price_at_sale: number;
  unit_cost_at_sale: number;
  packaging_cost_at_sale: number;
};

/** Strips the trailing " (SKU)" suffix tiktok-products-sync.server.ts
 *  appends to variant rows, so the Sales/Profit PDF product breakdowns
 *  rank the parent product (e.g. "T恤") instead of splitting it into
 *  weaker "T恤 (S)" / "T恤 (M)" entries. */
function stripVariantSuffix(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;
}

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
  // Paid Orders / All Orders — deliberately NOT called "Cash/Accrual Basis":
  // we don't yet track separate paid_at / fulfilled_at dates, so this is a
  // simpler distinction (only Paid-status orders vs every non-cancelled
  // order in the date range), not true cash/accrual accounting.
  const [reportBasis, setReportBasis] = useState<"paid_orders" | "all_orders">("paid_orders");
  type OrderExt = OrderRow & {
    payment_method?: string | null;
    order_source?: string | null;
    platform_fee_amount?: number | null;
    shipping_cost?: number | null;
    affiliate_commission?: number | null;
    financial_status?: string | null;
  };
  const [orders, setOrders] = useState<OrderExt[]>([]);
  const [busy, setBusy] = useState<null | "sales" | "profit" | "stock" | "financial" | "customer" | "supplier" | "recon">(null);
  const [pickCustomer, setPickCustomer] = useState(false);
  const [customerList, setCustomerList] = useState<Array<{ id: string; name: string; phone: string | null; total_orders: number; total_spent: number; last_order_at: string | null }>>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [orderCategories, setOrderCategories] = useState<Record<string, Set<string>>>({});
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("__all");
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([]);
  const [tiktokIdByProduct, setTiktokIdByProduct] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,code,customer_name,phone,product,quantity,amount,cost,gross_profit,status,created_at,payment_method,order_source,platform_fee_amount,shipping_cost,affiliate_commission,financial_status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!cancelled) setOrders((data ?? []) as OrderExt[]);

      const orderIds = ((data ?? []) as any[]).map((o) => o.id);
      if (orderIds.length > 0) {
        const { data: items } = await supabase
          .from("order_items" as any)
          .select("order_id,product_id,product_name,quantity,unit_price_at_sale,unit_cost_at_sale,packaging_cost_at_sale")
          .in("order_id", orderIds);
        if (!cancelled) setOrderItems(((items ?? []) as any) as OrderItemRow[]);
        const productIds = Array.from(new Set(((items ?? []) as any[]).map((i) => i.product_id).filter(Boolean)));
        const catByProduct: Record<string, string> = {};
        if (productIds.length > 0) {
          const { data: invRows } = await supabase.from("inventory").select("id,category,tiktok_product_id").in("id", productIds);
          const tidByProduct: Record<string, string> = {};
          for (const r of ((invRows ?? []) as any[])) {
            catByProduct[r.id] = r.category || "";
            if (r.tiktok_product_id) tidByProduct[r.id] = r.tiktok_product_id;
          }
          if (!cancelled) setTiktokIdByProduct(tidByProduct);
        }
        const map: Record<string, Set<string>> = {};
        for (const it of ((items ?? []) as any[])) {
          const c = it.product_id ? catByProduct[it.product_id] : "";
          if (!c) continue;
          (map[it.order_id] ??= new Set()).add(c);
        }
        if (!cancelled) setOrderCategories(map);
      }
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
      const inWindow = d >= fromDate && d <= toDate;
      if (!inWindow) return false;
      if (activeCategoryFilter === "__all") return true;
      return orderCategories[o.id]?.has(activeCategoryFilter) ?? false;
    }),
    [orders, fromDate, toDate, activeCategoryFilter, orderCategories],
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

      // Aggregated from order LINE ITEMS, not the order-level "product" text
      // field (which is every item in that order joined with commas, e.g.
      // "T恤 (S) × 2, 裤子 × 1" — treating that whole string as one
      // "product" silently broke ranking for any multi-item order). Same-
      // product TikTok variants (S/M/L etc., sharing tiktok_product_id) are
      // merged into one ranking entry.
      const inRangeIds = new Set(inRange.map((o) => o.id));
      const orderById = new Map(orders.map((o) => [o.id, o]));
      const variantMap = new Map<string, { name: string; qty: number; revenue: number; productId: string | null }>();
      orderItems.forEach((it) => {
        if (!inRangeIds.has(it.order_id)) return;
        const o = orderById.get(it.order_id);
        const key = it.product_name || "—";
        const cur = variantMap.get(key) ?? { name: key, qty: 0, revenue: 0, productId: it.product_id ?? null };
        cur.qty += Number(it.quantity ?? 0);
        if (o?.status === "Paid") cur.revenue += Number(it.unit_price_at_sale ?? 0) * Number(it.quantity ?? 0);
        if (!cur.productId && it.product_id) cur.productId = it.product_id;
        variantMap.set(key, cur);
      });
      const salesByTiktokId = new Map<string, Array<{ name: string; qty: number; revenue: number; productId: string | null }>>();
      for (const v of variantMap.values()) {
        const tid = v.productId ? tiktokIdByProduct[v.productId] : undefined;
        if (!tid) continue;
        if (!salesByTiktokId.has(tid)) salesByTiktokId.set(tid, []);
        salesByTiktokId.get(tid)!.push(v);
      }
      const salesGroupedIds = new Set<string>();
      for (const [tid, arr] of salesByTiktokId) if (arr.length > 1) salesGroupedIds.add(tid);
      const mergedProducts: { name: string; qty: number; revenue: number }[] = [];
      const salesSeen = new Set<string>();
      for (const v of variantMap.values()) {
        const tid = v.productId ? tiktokIdByProduct[v.productId] : undefined;
        if (tid && salesGroupedIds.has(tid)) {
          if (salesSeen.has(tid)) continue;
          salesSeen.add(tid);
          const vs = salesByTiktokId.get(tid)!;
          mergedProducts.push({
            name: stripVariantSuffix(vs[0].name),
            qty: vs.reduce((s, x) => s + x.qty, 0),
            revenue: vs.reduce((s, x) => s + x.revenue, 0),
          });
        } else {
          mergedProducts.push({ name: v.name, qty: v.qty, revenue: v.revenue });
        }
      }
      const topProducts = mergedProducts.sort((a, b) => b.qty - a.qty).slice(0, 5);

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

      // Same fix as the Sales PDF above: aggregate from order line items
      // (unit_cost_at_sale + packaging_cost_at_sale per item — the same
      // COGS basis that rolls up into order.cost) instead of attributing
      // an entire multi-item order's cost/profit to its joined "product"
      // text. Same-product TikTok variants are merged into one entry.
      const paidIds = new Set(paid.map((o) => o.id));
      const variantProfitMap = new Map<string, { name: string; qty: number; revenue: number; cost: number; profit: number; productId: string | null }>();
      orderItems.forEach((it) => {
        if (!paidIds.has(it.order_id)) return;
        const key = it.product_name || "—";
        const qty = Number(it.quantity ?? 0);
        const revenue = Number(it.unit_price_at_sale ?? 0) * qty;
        const cost = (Number(it.unit_cost_at_sale ?? 0) + Number(it.packaging_cost_at_sale ?? 0)) * qty;
        const cur = variantProfitMap.get(key) ?? { name: key, qty: 0, revenue: 0, cost: 0, profit: 0, productId: it.product_id ?? null };
        cur.qty += qty;
        cur.revenue += revenue;
        cur.cost += cost;
        cur.profit += revenue - cost;
        if (!cur.productId && it.product_id) cur.productId = it.product_id;
        variantProfitMap.set(key, cur);
      });
      const profitByTiktokId = new Map<string, Array<{ name: string; qty: number; revenue: number; cost: number; profit: number; productId: string | null }>>();
      for (const v of variantProfitMap.values()) {
        const tid = v.productId ? tiktokIdByProduct[v.productId] : undefined;
        if (!tid) continue;
        if (!profitByTiktokId.has(tid)) profitByTiktokId.set(tid, []);
        profitByTiktokId.get(tid)!.push(v);
      }
      const profitGroupedIds = new Set<string>();
      for (const [tid, arr] of profitByTiktokId) if (arr.length > 1) profitGroupedIds.add(tid);
      const products: { name: string; qty: number; revenue: number; cost: number; profit: number; margin: number }[] = [];
      const profitSeen = new Set<string>();
      for (const v of variantProfitMap.values()) {
        const tid = v.productId ? tiktokIdByProduct[v.productId] : undefined;
        if (tid && profitGroupedIds.has(tid)) {
          if (profitSeen.has(tid)) continue;
          profitSeen.add(tid);
          const vs = profitByTiktokId.get(tid)!;
          const qty = vs.reduce((s, x) => s + x.qty, 0);
          const revenue = vs.reduce((s, x) => s + x.revenue, 0);
          const cost = vs.reduce((s, x) => s + x.cost, 0);
          const profit = revenue - cost;
          products.push({ name: stripVariantSuffix(vs[0].name), qty, revenue, cost, profit, margin: revenue > 0 ? (profit / revenue) * 100 : 0 });
        } else {
          products.push({ name: v.name, qty: v.qty, revenue: v.revenue, cost: v.cost, profit: v.profit, margin: v.revenue > 0 ? (v.profit / v.revenue) * 100 : 0 });
        }
      }
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
        .select("id,name,stock,price,cost_price,category")
        .eq("user_id", user?.id ?? "")
        .order("name", { ascending: true });
      const items = (((data ?? []) as StockInvRow[]).filter(
        (i: any) => activeCategoryFilter === "__all" || (i.category ?? "") === activeCategoryFilter,
      ));
      const lowStockThreshold = user ? (await loadPrefs(user.id)).low_stock_threshold : 5;

      await exportStockReportPDF({
        lang, businessName, logoDataUrl,
        items, lowStockThreshold,
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
      const basisOrders = reportBasis === "paid_orders"
        ? inRange.filter((o) => o.status === "Paid")
        : inRange;
      // TikTok placeholder orders (financial_status = "pending") are excluded
      // from every figure below — they have no real amount/cost yet.
      const pending = basisOrders.filter((o) => o.financial_status === "pending");
      const paid = basisOrders.filter((o) => o.financial_status !== "pending");

      // Refunds/returns are dated on when they happened, not silently
      // rewritten into the original order — net them out of THIS period.
      const adjustments = await fetchPeriodAdjustments(user?.id ?? "", fromDate.toISOString(), toDate.toISOString());

      const revenue = paid.reduce((s, o) => s + Number(o.amount), 0) - adjustments.revenueReversed;
      const cogs = paid.reduce((s, o) => s + orderCost(o), 0) - adjustments.cogsReversed;
      const grossProfit = paid.reduce((s, o) => s + orderGrossProfit(o), 0) - (adjustments.revenueReversed - adjustments.cogsReversed);
      const platformFees = paid.reduce((s, o) => s + Number(o.platform_fee_amount ?? 0), 0);
      const shippingCosts = paid.reduce((s, o) => s + Number(o.shipping_cost ?? 0), 0);
      const affiliateCosts = paid.reduce((s, o) => s + Number(o.affiliate_commission ?? 0), 0);
      const contributionProfit = grossProfit - platformFees - shippingCosts - affiliateCosts;

      const { data: expenseRows } = await supabase
        .from("operating_expenses" as any)
        .select("amount")
        .eq("user_id", user?.id ?? "")
        .gte("incurred_at", fromDate.toISOString().slice(0, 10))
        .lte("incurred_at", toDate.toISOString().slice(0, 10));
      const operatingExpenses = ((expenseRows ?? []) as any[]).reduce((s, e) => s + Number(e.amount ?? 0), 0);

      const netProfit = contributionProfit - operatingExpenses;
      const margin = orderProfitMargin(revenue, grossProfit);
      const orderCount = paid.length;
      const avgOrder = orderCount > 0 ? revenue / orderCount : 0;
      const unpaidAmount = inRange.filter((o) => o.status === "Unpaid").reduce((s, o) => s + Number(o.amount), 0);
      await exportFinancialReportPDF({
        lang, businessName, logoDataUrl, rangeLabel: label,
        revenue, cogs, grossProfit, platformFees, contributionProfit,
        operatingExpenses, netProfit, margin, orderCount, avgOrder, unpaidAmount,
        pendingSyncCount: pending.length,
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

  const handleCSVExport = () => {
    if (!gate()) return;
    const qtyLabel = lang === "zh" ? "数量" : lang === "ms" ? "Kuantiti" : "Qty";
    const costLabel = lang === "zh" ? "成本" : lang === "ms" ? "Kos" : "Cost";
    downloadCSV(
      `orders-${label.replace(/\s+/g, "-")}`,
      [t("date_label"), t("code_label"), t("customer_name"), t("product"), qtyLabel, t("price"), costLabel, t("payment_status")],
      inRange.map((o) => [
        new Date(o.created_at).toLocaleDateString("en-MY"),
        o.code ?? "",
        o.customer_name ?? "",
        o.product ?? "",
        Number(o.quantity ?? 0),
        Number(o.amount ?? 0).toFixed(2),
        orderCost(o).toFixed(2),
        o.status,
      ]),
    );
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
    { key: "profit", icon: TrendingUp, title: t("reports_profit_title"), desc: t("reports_profit_desc"), onExport: handleProfit, tint: "bg-emerald-500/10 text-emerald-600" },
    { key: "stock", icon: Package, title: t("reports_stock_title"), desc: t("reports_stock_desc"), onExport: handleStock, tint: "bg-amber-500/10 text-amber-600" },
    { key: "financial", icon: FileText, title: t("reports_financial_title"), desc: t("reports_financial_desc"), onExport: handleFinancial, tint: "bg-sky-500/10 text-sky-600" },
    { key: "customer", icon: Users, title: t("reports_customer_title"), desc: t("reports_customer_desc"), onExport: openCustomerPicker, tint: "bg-fuchsia-500/10 text-fuchsia-600" },
    { key: "supplier", icon: Truck, title: t("reports_supplier_title"), desc: t("reports_supplier_desc"), onExport: handleSupplier, tint: "bg-orange-500/10 text-orange-600" },
    { key: "recon", icon: ClipboardCheck, title: t("reports_recon_title"), desc: t("reports_recon_desc"), onExport: handleRecon, tint: "bg-teal-500/10 text-teal-600" },
  ];

  return (
    <div className="px-5 pt-10 pb-6 space-y-5 lg:max-w-6xl lg:mx-auto lg:px-8 lg:pt-8">
      {!hasFullAccess && (
        <div className="rounded-2xl bg-primary/10 border border-primary/40 p-4 flex items-center gap-3">
          <Lock className="h-6 w-6 text-primary shrink-0" />
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

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {lang === "zh" ? "计算范围" : lang === "ms" ? "Skop kiraan" : "Basis"}
        </span>
        <div className="flex gap-1 bg-muted rounded-full p-1">
          {(["paid_orders", "all_orders"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setReportBasis(b)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${reportBasis === b ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              {b === "paid_orders"
                ? (lang === "zh" ? "已付款订单" : lang === "ms" ? "Pesanan dibayar" : "Paid orders")
                : (lang === "zh" ? "全部订单" : lang === "ms" ? "Semua pesanan" : "All orders")}
            </button>
          ))}
        </div>
      </div>

      {(() => {
        const cats = Array.from(new Set(Object.values(orderCategories).flatMap((s) => Array.from(s))));
        if (cats.length === 0) return null;
        return (
          <div className="space-y-1">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setActiveCategoryFilter("__all")}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${activeCategoryFilter === "__all" ? "bg-primary text-primary-foreground" : "bg-card border border-border/60 text-muted-foreground"}`}
              >
                {lang === "zh" ? "全部分类" : lang === "ms" ? "Semua kategori" : "All categories"}
              </button>
              {cats.map((c) => (
                <button
                  key={c}
                  onClick={() => setActiveCategoryFilter(c)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${activeCategoryFilter === c ? "bg-primary text-primary-foreground" : "bg-card border border-border/60 text-muted-foreground"}`}
                >
                  {c}
                </button>
              ))}
            </div>
            {activeCategoryFilter !== "__all" && (
              <p className="text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" />{lang === "zh" ? "客户对账单/供应商报表不受此筛选影响" : lang === "ms" ? "Penyata pelanggan/pembekal tidak terjejas" : "Customer statement/Supplier report are not affected by this filter"}</span>
              </p>
            )}
          </div>
        );
      })()}

      <button
        onClick={handleCSVExport}
        className="w-full py-3 rounded-2xl bg-card border border-border/60 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      >
        <FileDown className="h-4 w-4" /> {lang === "zh" ? "导出原始订单 CSV（给会计师/报税用）" : lang === "ms" ? "Eksport CSV pesanan mentah" : "Export raw orders CSV (for your accountant/tax)"}
      </button>

      <section className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:items-start">
        {cards.map((c) => {
          const Icon = c.icon;
          const isBusy = busy === c.key;
          return (
            <div key={c.key} className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 lg:p-5">
              <div className="flex items-start gap-3">
                <span className={`h-10 w-10 lg:h-12 lg:w-12 rounded-xl flex items-center justify-center shrink-0 ${c.tint}`}>
                  <Icon className="h-5 w-5 lg:h-6 lg:w-6" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm lg:text-base font-bold text-foreground">{c.title}</p>
                  <p className="text-[11px] lg:text-xs text-muted-foreground mt-0.5">{c.desc}</p>
                </div>
              </div>
              <div className="mt-3 lg:mt-4 flex items-center gap-2">
                <button
                  onClick={c.onExport}
                  disabled={isBusy || busy !== null}
                  className="flex-1 py-2.5 lg:py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs active:scale-[0.98] transition disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {isBusy ? "…" : (<><FileDown className="h-3.5 w-3.5" />{t("reports_open_pdf")}</>)}
                </button>
                {c.linkTo && (
                  <Link
                    to={c.linkTo}
                    className="px-3 py-2.5 rounded-xl bg-muted text-foreground text-xs font-semibold flex items-center gap-1 active:scale-[0.98] transition-transform whitespace-nowrap"
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