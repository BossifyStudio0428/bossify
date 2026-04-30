import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase, type OrderRow, type OrderStatus } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/orders")({ component: OrdersPage });

type Filter = "All" | OrderStatus;
const filters: Filter[] = ["All", "Unpaid", "Paid", "Pending"];

const statusStyles: Record<OrderStatus, string> = {
  Paid: "bg-emerald-100 text-emerald-700",
  Unpaid: "bg-red-100 text-red-600",
  Pending: "bg-amber-100 text-amber-700",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const isYest = d.toDateString() === yest.toDateString();
  if (sameDay) return d.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
  if (isYest) return "Yesterday";
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

function buildWhatsAppLink(phone: string, message: string) {
  const cleaned = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

function OrdersPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [active, setActive] = useState<Filter>("All");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<OrderRow | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setOrders((data ?? []) as OrderRow[]);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, []);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("orders-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` }, () => {
        load(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  // Pull to refresh
  useEffect(() => {
    let startY = 0;
    let pulling = false;
    const onStart = (e: TouchEvent) => {
      if (window.scrollY === 0) { startY = e.touches[0].clientY; pulling = true; }
    };
    const onMove = (e: TouchEvent) => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 80 && !refreshing) { setRefreshing(true); load(true); pulling = false; }
    };
    const onEnd = () => { pulling = false; };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [refreshing]);

  const updateStatus = async (id: string, next: OrderStatus) => {
    const prev = orders;
    setOrders((p) => p.map((o) => (o.id === id ? { ...o, status: next } : o)));
    if (detail?.id === id) setDetail({ ...detail, status: next });
    const { error } = await supabase.from("orders").update({ status: next }).eq("id", id);
    if (error) {
      setOrders(prev);
      toast.error(t("update_failed"));
    } else {
      toast.success(t("order_updated"));
    }
  };

  const remind = (o: OrderRow) => {
    if (!o.phone) { alert(t("no_phone_for_wa")); return; }
    const msg =
      `Hi ${o.customer_name}! 👋\n\n` +
      `Just a friendly reminder that your order is still pending payment. 😊\n\n` +
      `📋 Order: ${o.code}\n` +
      `🛒 Product: ${o.product} x${o.quantity}\n` +
      `💰 Amount due: RM ${Number(o.amount).toFixed(2)}\n\n` +
      `Please make payment when you can. Thank you! 🙏`;
    window.open(buildWhatsAppLink(o.phone, msg), "_blank");
  };

  const remove = async (id: string) => {
    if (!confirm(t("delete_confirm"))) return;
    setRemovingId(id);
    setTimeout(async () => {
      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) {
        toast.error(t("update_failed"));
        setRemovingId(null);
        return;
      }
      setOrders((p) => p.filter((o) => o.id !== id));
      setRemovingId(null);
      setDetail(null);
      toast.success(t("order_deleted"));
    }, 220);
  };

  const visible = active === "All" ? orders : orders.filter((o) => o.status === active);
  const todayCount = orders.filter((o) => new Date(o.created_at).toDateString() === new Date().toDateString()).length;
  const unpaidCount = orders.filter((o) => o.status === "Unpaid").length;

  return (
    <div className="px-5 pt-10 pb-4 space-y-5">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("orders")}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {todayCount} {t("today_count")}
        </span>
        {refreshing && <span className="text-[10px] text-muted-foreground">↻</span>}
      </header>

      <div className="-mx-5 px-5 overflow-x-auto scrollbar-none">
        <div className="flex gap-2 w-max">
          {filters.map((f) => {
            const isActive = active === f;
            const label = f === "All" ? t("all") : f === "Paid" ? t("paid") : f === "Unpaid" ? t("unpaid") : t("pending");
            return (
              <button
                key={f}
                onClick={() => setActive(f)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isActive
                    ? "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-[var(--shadow-soft)]"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {label}
                {f === "Unpaid" && unpaidCount > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/25" : "bg-red-500 text-white"}`}>
                    {unpaidCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {loading && <p className="text-center text-sm text-muted-foreground py-10">{t("loading")}</p>}

        {!loading && visible.map((o) => {
          const statusLabel = o.status === "Paid" ? t("paid") : o.status === "Unpaid" ? t("unpaid") : t("pending");
          const removing = removingId === o.id;
          return (
            <article
              key={o.id}
              onClick={() => setDetail(o)}
              className={`rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 cursor-pointer transition-all ${removing ? "opacity-0 scale-95" : "opacity-100"}`}
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold shrink-0">
                  {o.customer_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{o.customer_name}</p>
                  <p className="text-[11px] text-muted-foreground">{o.code} · {formatTime(o.created_at)}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyles[o.status]}`}>
                  {statusLabel}
                </span>
              </div>

              <p className="mt-3 text-sm text-muted-foreground">
                {o.product} {o.quantity > 1 ? `(x${o.quantity})` : ""}
              </p>

              <div className="mt-3 flex items-center justify-between">
                <p className="text-lg font-bold text-foreground">RM {Number(o.amount).toFixed(2)}</p>
                {o.status === "Unpaid" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); remind(o); }}
                    className="text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-500 text-white shadow-sm active:scale-95 transition-transform"
                  >
                    {t("remind")}
                  </button>
                )}
                {o.status === "Pending" && (
                  <button
                    onClick={(e) => { e.stopPropagation(); updateStatus(o.id, "Paid"); }}
                    className="text-xs font-semibold px-3 py-2 rounded-xl bg-amber-400 text-amber-950 shadow-sm active:scale-95 transition-transform"
                  >
                    {t("mark_paid")}
                  </button>
                )}
              </div>
            </article>
          );
        })}

        {!loading && visible.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">
            {orders.length === 0 ? t("no_orders_create") : t("no_orders_here")}
          </p>
        )}
      </div>

      {detail && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
          onClick={() => setDetail(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[390px] bg-background rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-fade-in"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{t("order_details")}</h2>
              <button onClick={() => setDetail(null)} className="text-2xl text-muted-foreground leading-none">×</button>
            </div>

            <div className="space-y-2 text-sm">
              <Row label={t("customer_name")} value={detail.customer_name} />
              <Row label={t("phone_number")} value={detail.phone || "—"} />
              <Row label="Code" value={detail.code} />
              <Row label={t("product")} value={`${detail.product} x${detail.quantity}`} />
              <Row label={t("price")} value={`RM ${Number(detail.amount).toFixed(2)}`} />
              <Row label={t("payment_status")} value={
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyles[detail.status]}`}>
                  {detail.status}
                </span>
              } />
              <Row label={t("notes")} value={detail.notes || "—"} />
              <Row label="Date" value={new Date(detail.created_at).toLocaleString("en-MY")} />
            </div>

            <div className="space-y-2 pt-2">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">{t("edit_status")}</p>
              <div className="grid grid-cols-3 gap-2">
                {(["Paid", "Unpaid", "Pending"] as OrderStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus(detail.id, s)}
                    className={`py-2 rounded-xl text-xs font-semibold ${statusStyles[s]} ${detail.status === s ? "ring-2 ring-primary" : ""}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => remove(detail.id)}
              className="w-full py-3 rounded-2xl bg-red-50 text-red-600 border border-red-200 font-semibold text-sm"
            >
              🗑 {t("delete_order")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-border/40 last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right">{value}</span>
    </div>
  );
}