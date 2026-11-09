import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase, type OrderRow, type OrderStatus } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { renderTemplate, buildWhatsAppLink, getOrderTemplate, fetchWAProfile } from "@/lib/wa";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { PhoneInput } from "@/components/PhoneInput";
import { orderCost, calculateOrderFinancials, calculateAdjustment, type AdjustmentType } from "@/lib/orderMath";
import { logInventoryChange } from "@/lib/inventoryAudit";

export const Route = createFileRoute("/orders_/$orderId")({
  validateSearch: (search: Record<string, unknown>) => ({
    edit: search.edit === true || search.edit === "true",
  }),
  component: OrderDetailPage,
});

const statusBanner: Record<OrderStatus, string> = {
  Paid: "bg-emerald-500 text-white",
  Unpaid: "bg-red-500 text-white",
  Pending: "bg-amber-400 text-amber-950",
};

type DeliveryStatus = "confirmed" | "preparing" | "on_the_way" | "delivered";

const DELIVERY_STATUSES: DeliveryStatus[] = [
  "confirmed",
  "preparing",
  "on_the_way",
  "delivered",
];

function deliveryStatusLabel(s: DeliveryStatus, lang: string): string {
  const map: Record<DeliveryStatus, { en: string; zh: string; ms: string }> = {
    confirmed:   { en: "Confirmed",  zh: "已确认", ms: "Disahkan" },
    preparing:   { en: "Preparing",  zh: "准备中", ms: "Sedang disediakan" },
    on_the_way:  { en: "On the Way", zh: "已出发", ms: "Dalam perjalanan" },
    delivered:   { en: "Delivered",  zh: "已送达", ms: "Telah dihantar" },
  };
  const e = map[s];
  if (lang === "zh") return e.zh;
  if (lang === "ms") return e.ms;
  return e.en;
}

function buildDeliveryStatusMessage(
  lang: string,
  name: string,
  ref: string,
  statusLabel: string,
  trackingUrl: string,
  eta?: string | null,
): string {
  const etaLine = eta
    ? lang === "zh"
      ? `预计到达：${eta} 🚗\n`
      : lang === "ms"
        ? `Anggaran ketibaan: ${eta} 🚗\n`
        : `Estimated arrival: ${eta} 🚗\n`
    : "";
  if (lang === "zh") {
    return `您好 ${name}！您的订单 ${ref} 状态已更新：${statusLabel}。\n${etaLine}追踪订单：${trackingUrl}\n谢谢！`;
  }
  if (lang === "ms") {
    return `Hai ${name}! Status pesanan ${ref} anda telah dikemaskini: ${statusLabel}.\n${etaLine}Jejaki pesanan: ${trackingUrl}\nTerima kasih!`;
  }
  return `Hi ${name}! Your order ${ref} status has been updated: ${statusLabel}.\n${etaLine}Track your order: ${trackingUrl}\nThank you!`;
}

function trackingUrlFor(code: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://bossify-malaysia.lovable.app";
  return `${origin}/track/${code}`;
}

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const { edit } = Route.useSearch();
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { type: bizType } = useBusinessType();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(edit);
  const [form, setForm] = useState<Partial<OrderRow>>({});
  const [customOrderTpl, setCustomOrderTpl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [etaModal, setEtaModal] = useState(false);
  const [etaInput, setEtaInput] = useState("");
  const [inventory, setInventory] = useState<Array<{ id: string; name: string; cost_price: number; packaging_cost: number }>>([]);
  const [refundModal, setRefundModal] = useState(false);
  const [refundType, setRefundType] = useState<AdjustmentType>("return_resellable");
  const [refundCustomAmount, setRefundCustomAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundSaving, setRefundSaving] = useState(false);
  const [adjustments, setAdjustments] = useState<Array<{ id: string; type: string; revenue_reversed: number; cogs_reversed: number; restocked: boolean; created_at: string }>>([]);
  const [buyerOrderCount, setBuyerOrderCount] = useState<number | null>(null);
  const [orderLineItems, setOrderLineItems] = useState<Array<{ product_id: string | null; product_name: string; quantity: number; unit_price_at_sale: number; unit_cost_at_sale: number; packaging_cost_at_sale: number }>>([]);
  const [refundQtyByItem, setRefundQtyByItem] = useState<Record<number, number>>({});

  useEffect(() => {
    (async () => {
      if (!user) return;
      const [{ data }, { data: pref }, { data: inv }, { data: adj }, { data: lineItems }] = await Promise.all([
        supabase.from("orders").select("*").eq("id", orderId).maybeSingle(),
        supabase.from("user_preferences").select("wa_order_template").eq("user_id", user.id).maybeSingle(),
        supabase.from("inventory").select("id,name,cost_price,packaging_cost"),
        supabase.from("order_adjustments" as any).select("*").eq("order_id", orderId).order("created_at", { ascending: false }),
        supabase.from("order_items" as any).select("product_id,product_name,quantity,unit_price_at_sale,unit_cost_at_sale,packaging_cost_at_sale").eq("order_id", orderId),
      ]);
      setAdjustments((adj ?? []) as any);
      setOrderLineItems(((lineItems ?? []) as any) as any);
      setOrder(data as OrderRow | null);
      const buyerId = (data as any)?.platform_buyer_id;
      if (buyerId && user) {
        const { count } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("platform_buyer_id", buyerId);
        setBuyerOrderCount(count ?? null);
      }
      setForm((data ?? {}) as Partial<OrderRow>);
      if (pref?.wa_order_template) setCustomOrderTpl(pref.wa_order_template);
      setInventory(((inv ?? []) as any[]).map((i) => ({
        id: i.id,
        name: i.name,
        cost_price: Number(i.cost_price ?? 0),
        packaging_cost: Number(i.packaging_cost ?? 0),
      })));
      setLoading(false);
    })();
  }, [orderId, user]);

  const sendWA = async () => {
    if (!order?.phone) { alert(t("no_phone_for_wa")); return; }
    if (!user) return;
    const { paymentDetails: rawPay, businessName } = await fetchWAProfile(user.id, lang);
    const paymentDetails = order.status !== "Paid" ? rawPay : "";
    const msg = renderTemplate(getOrderTemplate(lang, bizType, customOrderTpl), {
      customer_name: order.customer_name, business_name: businessName,
      code: order.code, product: order.product,
      quantity: order.quantity, amount: Number(order.amount).toFixed(2),
      status: order.status, notes: order.notes ?? "",
      payment_details: paymentDetails,
    }, lang);
    window.open(buildWhatsAppLink(order.phone, msg), "_blank");
  };

  const isDelivery =
    !!(order as any)?.delivery_address ||
    (order as any)?.delivery_method === "delivery";
  const currentDeliveryStatus: DeliveryStatus =
    (((order as any)?.delivery_status as DeliveryStatus) ?? "confirmed");

  const updateDeliveryStatus = async (next: DeliveryStatus) => {
    if (!user || !order) return;
    if (next === "on_the_way") {
      setEtaInput((order as any).estimated_arrival ?? "");
      setEtaModal(true);
      return;
    }
    await applyDeliveryStatus(next, null);
  };

  const applyDeliveryStatus = async (next: DeliveryStatus, eta: string | null) => {
    if (!user || !order) return;
    const patch: Record<string, unknown> = { delivery_status: next };
    if (next === "on_the_way") patch.estimated_arrival = eta;
    const { error } = await supabase
      .from("orders")
      .update(patch as any)
      .eq("id", order.id)
      .eq("user_id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setOrder({ ...(order as any), delivery_status: next, ...(next === "on_the_way" ? { estimated_arrival: eta } : {}) } as OrderRow);
    toast.success(deliveryStatusLabel(next, lang));
    if (order.phone) {
      const msg = buildDeliveryStatusMessage(
        lang,
        order.customer_name,
        order.code,
        deliveryStatusLabel(next, lang),
        trackingUrlFor(order.code),
        next === "on_the_way" ? eta : null,
      );
      window.open(buildWhatsAppLink(order.phone, msg), "_blank");
    }
  };

  const submitEta = async () => {
    const eta = etaInput.trim();
    if (!eta) {
      toast.error(lang === "zh" ? "请输入预计到达时间" : lang === "ms" ? "Sila masukkan anggaran ketibaan" : "Please enter estimated arrival");
      return;
    }
    setEtaModal(false);
    await applyDeliveryStatus("on_the_way", eta);
  };

  const save = async () => {
    if (!user || !order) return;
    setSaving(true);

    const newProductName = (form.product ?? "").toString().trim();
    const newQuantity = Number(form.quantity ?? 1);
    const newAmount = Number(form.amount ?? 0);

    // Re-resolve cost/packaging against current inventory in case the
    // product name or quantity changed. The platform fee % stays pinned to
    // whatever was snapshotted at the time of the original sale — editing a
    // typo later shouldn't silently change which fee rate applied.
    const matchedItem = inventory.find(
      (i) => i.name.trim().toLowerCase() === newProductName.toLowerCase(),
    );
    const unitCost = matchedItem ? matchedItem.cost_price : 0;
    const packagingCost = matchedItem ? matchedItem.packaging_cost : 0;
    const unitPriceAtSale = newQuantity > 0 ? newAmount / newQuantity : newAmount;
    const platformFeePercentAtSale = Number((order as any).platform_fee_percent_at_sale ?? 0);

    const financials = calculateOrderFinancials({
      items: [
        {
          quantity: newQuantity,
          unitPriceAtSale,
          unitCostAtSale: unitCost,
          packagingCostAtSale: packagingCost,
        },
      ],
      sellerDiscount: Number((order as any).seller_discount ?? 0),
      deliveryFeeCharged: Number((order as any).delivery_fee_charged ?? 0),
      shippingCost: Number((order as any).shipping_cost ?? 0),
      platformFeePercent: platformFeePercentAtSale,
      affiliateCommission: Number((order as any).affiliate_commission ?? 0),
    });

    const { error } = await supabase.from("orders").update({
      customer_name: form.customer_name?.trim(),
      phone: form.phone?.toString().trim() || null,
      product: newProductName,
      product_summary: newProductName,
      quantity: newQuantity,
      amount: financials.netRevenue,
      cost: financials.cogs,
      gross_profit: financials.grossProfit,
      platform_fee_amount: financials.platformFeeAmount,
      status: form.status,
      delivery_address: (form.delivery_address as string)?.toString().trim() || null,
      notes: form.notes?.toString().trim() || null,
    } as any).eq("id", order.id).eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    // Keep the order_items snapshot in sync with the edited line.
    try {
      await supabase.from("order_items" as any).delete().eq("order_id", order.id);
      await supabase.from("order_items" as any).insert({
        order_id: order.id,
        product_id: matchedItem?.id ?? null,
        product_name: newProductName,
        quantity: newQuantity,
        unit_price_at_sale: unitPriceAtSale,
        unit_cost_at_sale: unitCost,
        packaging_cost_at_sale: packagingCost,
      });
    } catch (e) {
      console.error("[orders.$orderId] order_items sync failed", e);
    }

    toast.success(t("order_updated"));
    setOrder({ ...order, ...(form as OrderRow), amount: financials.netRevenue, cost: financials.cogs, gross_profit: financials.grossProfit } as OrderRow);
    setEditing(false);
  };

  const remove = async () => {
    if (!order || !confirm(t("delete_confirm"))) return;
    const { error } = await supabase.from("orders").delete().eq("id", order.id).eq("user_id", user?.id ?? "");
    if (error) toast.error(error.message);
    else {
      if (user) {
        const phoneDigits = (order.phone || "").replace(/\D/g, "");
        const customerQuery = supabase.from("customers").select("*").eq("user_id", user.id);
        const { data: existing } = phoneDigits
          ? await customerQuery.eq("phone", phoneDigits).maybeSingle()
          : await customerQuery.is("phone", null).eq("name", order.customer_name).maybeSingle();
        if (existing) {
          const newOrders = Math.max(0, (existing.total_orders ?? 0) - 1);
          const newSpent = Math.max(0, Number(existing.total_spent ?? 0) - Number(order.amount));
          if (newOrders === 0) await supabase.from("customers").delete().eq("id", existing.id);
          else await supabase.from("customers").update({ total_orders: newOrders, total_spent: newSpent }).eq("id", existing.id);
        }
      }
      toast.success(t("order_deleted"));
      navigate({ to: "/orders" });
    }
  };

  const submitRefund = async () => {
    if (!order || !user) return;
    setRefundSaving(true);
    try {
      let revenueReversed = 0;
      let cogsReversed = 0;
      let restocked = false;
      // Per-item breakdown for product-profit accuracy. Populated for the
      // 4 fixed scenarios (item-based); left empty for partial_refund
      // (a flat monetary amount with no fixed per-item rule).
      const itemBreakdown: Array<{ product_id: string | null; product_name: string; quantity: number; revenueReversed: number; cogsReversed: number; restocked: boolean }> = [];

      if (refundType === "partial_refund") {
        revenueReversed = Number(refundCustomAmount) || 0;
        if (revenueReversed <= 0) {
          toast.error(lang === "zh" ? "请输入退款金额" : lang === "ms" ? "Sila masukkan jumlah bayaran balik" : "Enter a refund amount");
          setRefundSaving(false);
          return;
        }
      } else {
        const selectedIdx = Object.keys(refundQtyByItem).map(Number).filter((i) => (refundQtyByItem[i] ?? 0) > 0);
        if (selectedIdx.length === 0) {
          toast.error(lang === "zh" ? "请勾选要退的商品" : lang === "ms" ? "Sila pilih produk untuk dipulangkan" : "Select at least one item");
          setRefundSaving(false);
          return;
        }
        const ruleForFullItem = calculateAdjustment(refundType, { amount: 1, cost: 1 }); // just to read which sides reverse for this type
        for (const idx of selectedIdx) {
          const it = orderLineItems[idx];
          const qty = Math.min(refundQtyByItem[idx] ?? 0, Number(it.quantity ?? 0));
          if (qty <= 0) continue;
          const itemRevenue = Number(it.unit_price_at_sale ?? 0) * qty;
          const itemCost = (Number(it.unit_cost_at_sale ?? 0) + Number(it.packaging_cost_at_sale ?? 0)) * qty;
          const itemRevenueReversed = ruleForFullItem.revenueReversed > 0 ? itemRevenue : 0;
          const itemCogsReversed = ruleForFullItem.cogsReversed > 0 ? itemCost : 0;
          revenueReversed += itemRevenueReversed;
          cogsReversed += itemCogsReversed;
          if (ruleForFullItem.restocked) restocked = true;
          itemBreakdown.push({
            product_id: it.product_id,
            product_name: it.product_name,
            quantity: qty,
            revenueReversed: itemRevenueReversed,
            cogsReversed: itemCogsReversed,
            restocked: ruleForFullItem.restocked,
          });
        }
      }

      const { data: adjRow, error: adjErr } = await supabase.from("order_adjustments" as any).insert({
        user_id: user.id,
        order_id: order.id,
        type: refundType,
        revenue_reversed: revenueReversed,
        cogs_reversed: cogsReversed,
        restocked,
        reason: refundReason || null,
      }).select("id").single();
      if (adjErr) throw new Error(adjErr.message);

      if (itemBreakdown.length > 0) {
        const { error: itemsErr } = await supabase.from("order_adjustment_items" as any).insert(
          itemBreakdown.map((b) => ({
            adjustment_id: (adjRow as any).id,
            product_id: b.product_id,
            product_name: b.product_name,
            quantity: b.quantity,
            revenue_reversed: b.revenueReversed,
            cogs_reversed: b.cogsReversed,
            restocked: b.restocked,
          })),
        );
        if (itemsErr) throw new Error(itemsErr.message);
      }

      // Restock: only the specific items/quantities the seller selected —
      // matched by product_id (items not matched to a real inventory row
      // at sale time are skipped, same as before).
      if (restocked) {
        for (const b of itemBreakdown) {
          if (!b.product_id || !b.restocked) continue;
          const { data: invRow } = await supabase.from("inventory").select("stock").eq("id", b.product_id).maybeSingle();
          if (invRow) {
            const newStock = Number(invRow.stock ?? 0) + b.quantity;
            await supabase.from("inventory").update({ stock: newStock }).eq("id", b.product_id);
            logInventoryChange({ userId: user.id, productId: b.product_id, productName: b.product_name, fieldName: "stock", oldValue: invRow.stock, newValue: newStock, source: "refund_restock" });
          }
        }
      }

      // Denormalized summary on the order itself — display only, never
      // read by reports (those read order_adjustments for the correct period).
      const newNetRefunded = Number((order as any).net_refunded_amount ?? 0) + revenueReversed;
      await supabase.from("orders").update({ net_refunded_amount: newNetRefunded, is_refunded: true } as any).eq("id", order.id);
      setOrder({ ...order, net_refunded_amount: newNetRefunded, is_refunded: true } as any);

      const { data: adj } = await supabase.from("order_adjustments" as any).select("*").eq("order_id", order.id).order("created_at", { ascending: false });
      setAdjustments((adj ?? []) as any);

      toast.success(lang === "zh" ? "已记录退款" : lang === "ms" ? "Bayaran balik direkodkan" : "Refund recorded");
      setRefundModal(false);
      setRefundCustomAmount("");
      setRefundReason("");
      setRefundQtyByItem({});
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setRefundSaving(false);
    }
  };

  if (loading) return <p className="p-6 text-sm text-muted-foreground">{t("loading")}</p>;
  if (!order) return (
    <div className="p-6 space-y-3">
      <p className="text-sm">{t("order_not_found")}</p>
      <button onClick={() => navigate({ to: "/orders" })} className="text-primary text-sm">{t("back_arrow")}</button>
    </div>
  );

  return (
    <>
    <div className="pb-8 space-y-5">
      <header className="flex items-center gap-3 px-5 pt-10">
        <button onClick={() => navigate({ to: "/orders" })} className="h-10 w-10 rounded-full bg-card border border-border/60 flex items-center justify-center">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-bold flex-1 truncate">{order.code}</h1>
        {!editing && (
          <button onClick={() => setEditing(true)} className="h-10 w-10 rounded-full bg-card border border-border/60 flex items-center justify-center">
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </header>

      <div className={`mx-5 rounded-2xl py-5 text-center font-bold text-lg ${statusBanner[order.status]}`}>
        {order.status.toUpperCase()}
      </div>

      {!editing ? (
        <div className="px-5 space-y-4">
          <div className="rounded-2xl bg-card border border-border/60 p-4 flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold">
              {order.customer_name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">👤 {order.customer_name}</p>
              {buyerOrderCount !== null && buyerOrderCount > 1 && (
                <p className="text-[11px] font-semibold text-primary mt-0.5">
                  🔁 {lang === "zh" ? `回购客户 · 共 ${buyerOrderCount} 笔订单` : lang === "ms" ? `Pelanggan berulang · ${buyerOrderCount} pesanan` : `Repeat buyer · ${buyerOrderCount} orders`}
                </p>
              )}
              {order.phone ? (
                <div className="flex gap-3 mt-1">
                  <a href={`tel:${order.phone}`} className="text-xs text-primary">📞 {t("call")}</a>
                  <a href={buildWhatsAppLink(order.phone, "")} target="_blank" rel="noreferrer" className="text-xs text-emerald-400">📱 WhatsApp</a>
                </div>
              ) : <p className="text-xs text-muted-foreground mt-1">{t("no_phone")}</p>}
            </div>
          </div>

          <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-2 text-sm">
            <Row label={`🛍️ ${t("product")}`} value={order.product} />
            <Row label={`📦 ${t("quantity")}`} value={String(order.quantity)} />
            <Row label={`💰 ${t("price")}`} value={`RM ${Number(order.amount).toFixed(2)}`} />
            <Row label={`📅 ${t("date_label")}`} value={new Date(order.created_at).toLocaleString("en-MY")} />
            <Row label={`📋 ${t("code_label")}`} value={order.code} />
            {order.delivery_address && (
              <Row label={`📍 ${t("delivery_address" as any)}`} value={order.delivery_address} />
            )}
            {(() => {
              const dm = (order as any).delivery_method as string | undefined;
              if (!dm) return null;
              const isDel = dm === "delivery";
              return (
                <Row
                  label={`${isDel ? "🚗" : "🏪"} ${t("delivery_type" as any)}`}
                  value={isDel ? t("order_delivery" as any) : t("order_pickup" as any)}
                />
              );
            })()}
            {(() => {
              const dm = (order as any).delivery_method as string | undefined;
              const storeAddr = (order as any).store_address_snapshot as string | null | undefined;
              if (!storeAddr) return null;
              const isDel = dm === "delivery";
              return (
                <Row
                  label={`🏬 ${isDel ? t("delivering_from" as any) : t("pickup_at" as any)}`}
                  value={storeAddr}
                />
              );
            })()}
            {(order as any).payment_method && (
              <Row
                label={`💳 ${t("pof_payment_method" as any)}`}
                value={
                  (order as any).payment_method === "cash_on_delivery"
                    ? t("cash_on_delivery" as any)
                    : (order as any).payment_method === "bank_transfer"
                      ? t("bank_transfer" as any)
                      : (order as any).payment_method
                }
              />
            )}
            <Row label={`📝 ${t("notes")}`} value={order.notes || t("no_notes")} />
          </div>

          {isDelivery && (
            <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">🚚 {lang === "zh" ? "配送状态" : lang === "ms" ? "Status Penghantaran" : "Delivery Status"}</p>
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary">
                  {deliveryStatusLabel(currentDeliveryStatus, lang)}
                </span>
              </div>
              {(order as any).estimated_arrival && currentDeliveryStatus === "on_the_way" && (
                <p className="text-xs text-primary">
                  ⏰ {lang === "zh" ? "预计到达" : lang === "ms" ? "Anggaran ketibaan" : "Estimated arrival"}:{" "}
                  <span className="font-semibold">{(order as any).estimated_arrival}</span>
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {DELIVERY_STATUSES.map((s) => {
                  const active = currentDeliveryStatus === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => updateDeliveryStatus(s)}
                      className={`py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-card text-muted-foreground border-border hover:bg-muted/50"
                      }`}
                    >
                      {deliveryStatusLabel(s, lang)}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {lang === "zh"
                  ? "更新状态后会自动通过 WhatsApp 通知客户"
                  : lang === "ms"
                    ? "Pelanggan akan dimaklumkan melalui WhatsApp secara automatik"
                    : "Customer will be notified via WhatsApp automatically"}
              </p>
              <div className="rounded-xl bg-muted/40 border border-border/60 px-3 py-2 text-[11px]">
                <p className="text-muted-foreground mb-1">
                  🔗 {lang === "zh" ? "追踪链接" : lang === "ms" ? "Pautan penjejakan" : "Tracking link"}
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate font-mono text-[10px]">{trackingUrlFor(order.code)}</code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(trackingUrlFor(order.code));
                      toast.success(lang === "zh" ? "已复制" : lang === "ms" ? "Disalin" : "Copied");
                    }}
                    className="px-2 py-1 rounded-md bg-primary text-primary-foreground text-[10px] font-semibold"
                  >
                    {lang === "zh" ? "复制" : lang === "ms" ? "Salin" : "Copy"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button onClick={sendWA} className="py-3 rounded-2xl bg-emerald-500 text-white font-semibold text-xs">📲 WhatsApp</button>
            <button onClick={() => setEditing(true)} className="py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-xs">✏️ {t("edit")}</button>
            <button onClick={remove} className="py-3 rounded-2xl bg-red-500 text-white font-semibold text-xs">🗑️ {t("delete")}</button>
          </div>

          <button
            onClick={() => setRefundModal(true)}
            className="w-full py-3 rounded-2xl bg-card border border-border/60 text-amber-300 font-semibold text-xs"
          >
            ↩️ {lang === "zh" ? "记录退款 / 退货" : lang === "ms" ? "Rekod bayaran balik / pemulangan" : "Record refund / return"}
          </button>

          {(order as any).is_refunded && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-300">
                {lang === "zh" ? `已退款总额 RM ${Number((order as any).net_refunded_amount ?? 0).toFixed(2)}` : lang === "ms" ? `Jumlah bayaran balik RM ${Number((order as any).net_refunded_amount ?? 0).toFixed(2)}` : `Total refunded: RM ${Number((order as any).net_refunded_amount ?? 0).toFixed(2)}`}
              </p>
              {adjustments.map((a) => (
                <div key={a.id} className="text-[11px] text-amber-300 flex items-center justify-between">
                  <span>{a.type} · {new Date(a.created_at).toLocaleDateString("en-MY")}</span>
                  <span>−RM {Number(a.revenue_reversed).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="px-5 space-y-3">
          <Input label={t("customer_name")} value={form.customer_name ?? ""} onChange={(v) => setForm((p) => ({ ...p, customer_name: v }))} />
          <PhoneInput label={t("phone_number")} value={(form.phone as string) ?? ""} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} />
          <Input label={t("product")} value={form.product ?? ""} onChange={(v) => setForm((p) => ({ ...p, product: v }))} />
          <Input label={t("quantity")} type="number" value={String(form.quantity ?? 1)} onChange={(v) => setForm((p) => ({ ...p, quantity: Number(v) }))} />
          <Input label={t("price")} type="number" value={String(form.amount ?? 0)} onChange={(v) => setForm((p) => ({ ...p, amount: Number(v) }))} />
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase font-semibold text-muted-foreground px-1">{t("payment_status")}</label>
            <div className="grid grid-cols-3 gap-2">
              {(["Paid", "Unpaid", "Pending"] as OrderStatus[]).map((s) => (
                <button key={s} type="button" onClick={() => setForm((p) => ({ ...p, status: s }))}
                  className={`py-3 rounded-xl text-xs font-semibold ${form.status === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {s === "Paid" ? t("paid") : s === "Unpaid" ? t("unpaid") : t("pending")}
                </button>
              ))}
            </div>
          </div>
          <Textarea
            label={t("delivery_address" as any)}
            value={(form.delivery_address as string) ?? ""}
            onChange={(v) => setForm((p) => ({ ...p, delivery_address: v }))}
          />
          <Input label={t("notes")} value={(form.notes as string) ?? ""} onChange={(v) => setForm((p) => ({ ...p, notes: v }))} />
          <div className="flex gap-2 pt-2">
            <button onClick={() => { setEditing(false); setForm(order); }} className="flex-1 py-3 rounded-2xl bg-muted font-semibold text-sm">{t("cancel")}</button>
            <button onClick={save} disabled={saving} className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-60">{saving ? t("saving") : t("save")}</button>
          </div>
        </div>
      )}
    </div>
    {etaModal && (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4" onClick={() => setEtaModal(false)}>
        <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
          <div>
            <p className="text-base font-bold">
              🚗 {lang === "zh" ? "预计到达时间" : lang === "ms" ? "Anggaran ketibaan" : "Estimated Arrival"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {lang === "zh"
                ? "例如：15 分钟、30 分钟，或 3:30 PM"
                : lang === "ms"
                  ? "Contoh: 15 minit, 30 minit, atau 3:30 PM"
                  : "e.g. 15 mins, 30 mins, or 3:30 PM"}
            </p>
          </div>
          <input
            autoFocus
            value={etaInput}
            onChange={(e) => setEtaInput(e.target.value)}
            placeholder={lang === "zh" ? "15 分钟" : lang === "ms" ? "15 minit" : "15 mins"}
            className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <button onClick={() => setEtaModal(false)} className="flex-1 py-3 rounded-2xl bg-muted text-sm font-semibold">
              {t("cancel")}
            </button>
            <button onClick={submitEta} className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold">
              {lang === "zh" ? "通知客户" : lang === "ms" ? "Beritahu pelanggan" : "Notify customer"}
            </button>
          </div>
        </div>
      </div>
    )}

    {refundModal && order && (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4" onClick={() => setRefundModal(false)}>
        <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 space-y-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <p className="text-base font-bold">
            ↩️ {lang === "zh" ? "记录退款 / 退货" : lang === "ms" ? "Rekod bayaran balik" : "Record refund / return"}
          </p>
          <div className="space-y-2">
            {([
              ["cancel_before_ship", lang === "zh" ? "发货前取消" : lang === "ms" ? "Batal sebelum hantar" : "Cancelled before shipping", lang === "zh" ? "全额退款,货没发出" : "Full refund, goods never shipped"],
              ["return_resellable", lang === "zh" ? "已退货，货还能卖" : lang === "ms" ? "Dipulangkan, boleh dijual semula" : "Returned, still sellable", lang === "zh" ? "退款+成本冲回,库存加回" : "Refund + cost reversed, stock restored"],
              ["refund_no_return", lang === "zh" ? "已退款，货没退回" : lang === "ms" ? "Bayaran balik, barang tiada" : "Refunded, goods not returned", lang === "zh" ? "只退款,成本不变" : "Refund only, cost stays"],
              ["return_damaged", lang === "zh" ? "已退货，但坏了不能卖" : lang === "ms" ? "Dipulangkan tapi rosak" : "Returned but damaged", lang === "zh" ? "只退款,不加回库存" : "Refund only, no restock"],
              ["partial_refund", lang === "zh" ? "自定金额（部分退款）" : lang === "ms" ? "Jumlah tersuai" : "Custom amount (partial)", lang === "zh" ? "自己输入退款金额" : "Enter your own refund amount"],
            ] as [AdjustmentType, string, string][]).map(([val, label, desc]) => (
              <button
                key={val}
                onClick={() => setRefundType(val)}
                className={`w-full text-left p-3 rounded-2xl border ${refundType === val ? "border-primary bg-primary/5" : "border-border/60 bg-background"}`}
              >
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-[11px] text-muted-foreground">{desc}</p>
              </button>
            ))}
          </div>

          {refundType !== "partial_refund" && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                {lang === "zh" ? "勾选要退的商品" : lang === "ms" ? "Pilih produk" : "Select items to refund"}
              </p>
              {orderLineItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {lang === "zh" ? "这笔订单没有商品明细记录" : "No line items on this order"}
                </p>
              ) : (
                orderLineItems.map((it, idx) => {
                  const selectedQty = refundQtyByItem[idx] ?? 0;
                  return (
                    <div key={idx} className="flex items-center gap-2 p-2.5 rounded-xl border border-border/60 bg-background">
                      <input
                        type="checkbox"
                        checked={selectedQty > 0}
                        onChange={(e) => setRefundQtyByItem((p) => ({ ...p, [idx]: e.target.checked ? Number(it.quantity ?? 1) : 0 }))}
                        className="h-4 w-4"
                      />
                      <p className="text-xs font-medium flex-1 min-w-0 truncate">{it.product_name}</p>
                      {selectedQty > 0 && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setRefundQtyByItem((p) => ({ ...p, [idx]: Math.max(1, (p[idx] ?? 1) - 1) }))}
                            className="h-6 w-6 rounded-full bg-muted text-xs font-bold"
                          >−</button>
                          <span className="text-xs font-semibold w-6 text-center">{selectedQty}</span>
                          <button
                            type="button"
                            onClick={() => setRefundQtyByItem((p) => ({ ...p, [idx]: Math.min(Number(it.quantity ?? 1), (p[idx] ?? 1) + 1) }))}
                            className="h-6 w-6 rounded-full bg-muted text-xs font-bold"
                          >+</button>
                          <span className="text-[10px] text-muted-foreground">/ {it.quantity}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {refundType === "partial_refund" && (
            <input
              type="number"
              inputMode="decimal"
              value={refundCustomAmount}
              onChange={(e) => setRefundCustomAmount(e.target.value)}
              placeholder={lang === "zh" ? "退款金额 (RM)" : "Refund amount (RM)"}
              className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm outline-none focus:border-primary"
            />
          )}
          <input
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
            placeholder={lang === "zh" ? "备注（可选）" : lang === "ms" ? "Catatan (pilihan)" : "Note (optional)"}
            className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm outline-none focus:border-primary"
          />

          <div className="flex gap-2">
            <button onClick={() => setRefundModal(false)} className="flex-1 py-3 rounded-2xl bg-muted text-sm font-semibold">
              {t("cancel")}
            </button>
            <button disabled={refundSaving} onClick={submitRefund} className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
              {refundSaving ? "…" : (lang === "zh" ? "确认记录" : lang === "ms" ? "Sahkan" : "Confirm")}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl bg-card border border-border/60 px-4 py-3 text-sm text-foreground outline-none focus:border-primary" />
    </div>
  );
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{label}</label>
      <textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={500}
        className="w-full resize-y rounded-2xl bg-card border border-border/60 px-4 py-3 text-sm text-foreground outline-none focus:border-primary"
      />
    </div>
  );
}