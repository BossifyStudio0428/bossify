import { useEffect, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { Check, ChefHat, Truck, Package } from "lucide-react";

export const Route = createFileRoute("/track/$orderRef")({
  component: TrackingPage,
});

type DeliveryStatus = "confirmed" | "preparing" | "on_the_way" | "delivered";
type Lang = "en" | "ms" | "zh";

const STATUSES: DeliveryStatus[] = ["confirmed", "preparing", "on_the_way", "delivered"];

type TrackingData = {
  ok: true;
  order: {
    code: string;
    customer_name: string;
    product: string;
    quantity: number;
    amount: number;
    status: string;
    delivery_address: string | null;
    delivery_status: string;
    estimated_arrival: string | null;
    notes: string | null;
    created_at: string;
    delivery_method: string | null;
  };
  business: {
    name: string;
    whatsapp_number: string | null;
    store_address: string | null;
  };
};

const T = {
  en: {
    title: "Order Tracking",
    notFound: "Order not found",
    notFoundSub: "The tracking link may be invalid or the order was removed.",
    orderRef: "Order Ref",
    customer: "Customer",
    product: "Product",
    qty: "Quantity",
    total: "Total",
    deliveryTo: "Deliver to",
    statusTitle: "Delivery Status",
    eta: "Estimated arrival",
    confirmed: "Order Confirmed",
    preparing: "Preparing",
    on_the_way: "On the Way",
    delivered: "Delivered",
    pickedLang: "Language",
    contactSeller: "Contact Seller",
    pickupAt: "Pickup at",
    selfPickup: "Self-pickup order",
    selfPickupSub: "Please collect your order at the address below.",
  },
  ms: {
    title: "Penjejakan Pesanan",
    notFound: "Pesanan tidak dijumpai",
    notFoundSub: "Pautan penjejakan mungkin tidak sah atau pesanan telah dipadam.",
    orderRef: "No. Pesanan",
    customer: "Pelanggan",
    product: "Produk",
    qty: "Kuantiti",
    total: "Jumlah",
    deliveryTo: "Hantar ke",
    statusTitle: "Status Penghantaran",
    eta: "Anggaran ketibaan",
    confirmed: "Pesanan Disahkan",
    preparing: "Sedang Disediakan",
    on_the_way: "Dalam Perjalanan",
    delivered: "Telah Dihantar",
    pickedLang: "Bahasa",
    contactSeller: "Hubungi Penjual",
    pickupAt: "Ambil di",
    selfPickup: "Pesanan ambil sendiri",
    selfPickupSub: "Sila ambil pesanan anda di alamat di bawah.",
  },
  zh: {
    title: "订单追踪",
    notFound: "找不到订单",
    notFoundSub: "追踪链接可能无效，或订单已被删除。",
    orderRef: "订单编号",
    customer: "客户",
    product: "产品",
    qty: "数量",
    total: "总额",
    deliveryTo: "配送至",
    statusTitle: "配送状态",
    eta: "预计到达",
    confirmed: "订单已确认",
    preparing: "准备中",
    on_the_way: "已出发",
    delivered: "已送达",
    pickedLang: "语言",
    contactSeller: "联系商家",
    pickupAt: "自取地址",
    selfPickup: "自取订单",
    selfPickupSub: "请到以下地址领取订单。",
  },
} as const;

function TrackingPage() {
  const { orderRef } = useParams({ from: "/track/$orderRef" });
  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === "undefined") return "en";
    const saved = localStorage.getItem("bossify_lang") as Lang | null;
    if (saved === "en" || saved === "ms" || saved === "zh") return saved;
    return "en";
  });
  const tr = T[lang];

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/public/tracking?ref=${encodeURIComponent(orderRef)}`);
        const json = (await res.json()) as TrackingData | { ok: false };
        if (!alive) return;
        if ((json as any).ok) setData(json as TrackingData);
      } catch {}
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [orderRef]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf9ff]">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-[#faf9ff]">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-3">😢</div>
          <h1 className="text-xl font-bold">{tr.notFound}</h1>
          <p className="text-sm text-muted-foreground mt-2">{tr.notFoundSub}</p>
        </div>
      </div>
    );
  }

  const { order, business } = data;
  const isPickup = order.delivery_method === "pickup" || order.delivery_method === "takeaway";
  const currentStatus = (STATUSES.includes(order.delivery_status as DeliveryStatus)
    ? order.delivery_status
    : "confirmed") as DeliveryStatus;
  const currentIndex = STATUSES.indexOf(currentStatus);

  const icons: Record<DeliveryStatus, React.ReactNode> = {
    confirmed: <Check className="h-5 w-5" />,
    preparing: <ChefHat className="h-5 w-5" />,
    on_the_way: <Truck className="h-5 w-5" />,
    delivered: <Package className="h-5 w-5" />,
  };

  return (
    <div className="min-h-screen px-5 pt-8 pb-12" style={{
      background: "radial-gradient(120% 60% at 50% 0%, hsl(var(--primary) / 0.18) 0%, transparent 60%), linear-gradient(180deg, #faf9ff 0%, #f4f3f8 100%)",
    }}>
      <div className="max-w-md mx-auto space-y-5">
        {/* Language picker */}
        <div className="flex justify-end gap-1.5">
          {(["en", "ms", "zh"] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                setLang(l);
                if (typeof window !== "undefined") localStorage.setItem("bossify_lang", l);
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                lang === l
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-white text-muted-foreground border-border"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Hero */}
        <div
          className="rounded-[28px] p-6 text-white shadow-[0_20px_50px_-20px_rgba(124,58,237,0.55)]"
          style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 45%, #4f46e5 100%)" }}
        >
          <p className="text-[10px] font-bold tracking-[0.22em] text-white/70 uppercase">{tr.title}</p>
          <h1 className="text-2xl font-extrabold mt-1">{business.name || "Store"}</h1>
          <p className="text-xs text-white/85 mt-2 font-mono">{order.code}</p>
        </div>

        {/* Progress (delivery only) */}
        {!isPickup && (
        <div className="rounded-2xl bg-white border border-border/60 p-5 shadow-sm">
          <p className="text-sm font-semibold mb-4">🚚 {tr.statusTitle}</p>
          <div className="space-y-4">
            {STATUSES.map((s, i) => {
              const reached = i <= currentIndex;
              const active = i === currentIndex;
              return (
                <div key={s} className="flex items-center gap-3">
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      reached
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    } ${active ? "ring-4 ring-primary/20" : ""}`}
                  >
                    {icons[s]}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm ${active ? "font-bold text-primary" : reached ? "font-semibold" : "text-muted-foreground"}`}>
                      {tr[s]}
                    </p>
                    {active && s === "on_the_way" && order.estimated_arrival && (
                      <p className="text-xs text-primary mt-0.5">
                        ⏰ {tr.eta}: <span className="font-semibold">{order.estimated_arrival}</span>
                      </p>
                    )}
                  </div>
                  {i < STATUSES.length - 1 && (
                    <div className="absolute" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        )}

        {isPickup && business.store_address && (
          <div className="rounded-2xl bg-white border border-border/60 p-5 shadow-sm space-y-2">
            <p className="text-sm font-semibold">🏪 {tr.selfPickup}</p>
            <p className="text-xs text-muted-foreground">{tr.selfPickupSub}</p>
            <div className="rounded-xl bg-muted/40 px-3 py-2.5 text-sm whitespace-pre-wrap">
              {business.store_address}
            </div>
          </div>
        )}

        {/* Order details */}
        <div className="rounded-2xl bg-white border border-border/60 p-5 shadow-sm space-y-2 text-sm">
          <Row k={`👤 ${tr.customer}`} v={order.customer_name} />
          <Row k={`🛍️ ${tr.product}`} v={order.product} />
          <Row k={`📦 ${tr.qty}`} v={String(order.quantity)} />
          <Row k={`💰 ${tr.total}`} v={`RM ${order.amount.toFixed(2)}`} />
          {order.delivery_address && (
            <Row k={`📍 ${tr.deliveryTo}`} v={order.delivery_address} />
          )}
        </div>

        {business.whatsapp_number && (
          <a
            href={`https://wa.me/${business.whatsapp_number.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-[#25D366] text-white font-semibold text-sm shadow-md"
          >
            📱 {tr.contactSeller}
          </a>
        )}

        <p className="text-center text-[10px] text-muted-foreground">
          Powered by Bossify 💜
        </p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-sm font-medium text-right break-words max-w-[60%]">{v}</span>
    </div>
  );
}