import { useEffect, useState, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw, X, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/dine-in")({ component: DineInPage });

type Ticket = {
  id: string;
  table_id: string;
  total_amount: number;
  created_at: string;
  table_label?: string;
};
type DOrder = {
  id: string;
  ticket_id: string;
  status: "received" | "preparing" | "ready" | "served" | "cancelled";
  note: string | null;
  total_amount: number;
  created_at: string;
};
type DItem = {
  id: string;
  order_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

const STATUS_FLOW: DOrder["status"][] = ["received", "preparing", "ready", "served"];

function DineInPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [orders, setOrders] = useState<DOrder[]>([]);
  const [items, setItems] = useState<DItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutTicket, setCheckoutTicket] = useState<Ticket | null>(null);
  const [payMethod, setPayMethod] = useState<"cash" | "qr" | "bank">("cash");
  const [phone, setPhone] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: tk }, { data: tbl }] = await Promise.all([
      supabase.from("dine_in_tickets" as any).select("id,table_id,total_amount,created_at")
        .eq("user_id", user.id).eq("status", "open").order("created_at"),
      supabase.from("restaurant_tables" as any).select("id,label").eq("user_id", user.id),
    ]);
    const labelMap = new Map<string, string>(((tbl as any) ?? []).map((r: any) => [r.id, r.label]));
    const ticketRows: Ticket[] = ((tk as any) ?? []).map((r: any) => ({ ...r, table_label: labelMap.get(r.table_id) ?? r.table_id.slice(0, 6) }));
    setTickets(ticketRows);
    const ticketIds = ticketRows.map(r => r.id);
    if (ticketIds.length === 0) {
      setOrders([]); setItems([]); setLoading(false); return;
    }
    const { data: ords } = await supabase
      .from("dine_in_orders" as any)
      .select("id,ticket_id,status,note,total_amount,created_at")
      .in("ticket_id", ticketIds).order("created_at");
    setOrders((ords as any) ?? []);
    const orderIds = ((ords as any) ?? []).map((o: any) => o.id);
    if (orderIds.length > 0) {
      const { data: its } = await supabase
        .from("dine_in_order_items" as any)
        .select("id,order_id,product_name,quantity,unit_price,line_total")
        .in("order_id", orderIds);
      setItems((its as any) ?? []);
    } else {
      setItems([]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime refresh on new orders for this user
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("dine-in-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "dine_in_orders", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "dine_in_tickets", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  async function advance(order: DOrder) {
    const idx = STATUS_FLOW.indexOf(order.status as any);
    const next = STATUS_FLOW[Math.min(idx + 1, STATUS_FLOW.length - 1)];
    if (next === order.status) return;
    const { error } = await supabase.from("dine_in_orders" as any).update({ status: next }).eq("id", order.id);
    if (error) toast.error(error.message);
    else setOrders(os => os.map(o => o.id === order.id ? { ...o, status: next } : o));
  }

  async function markPaid() {
    if (!checkoutTicket || !user) return;
    const tkt = checkoutTicket;
    const tktItems = orders.filter(o => o.ticket_id === tkt.id).flatMap(o => items.filter(i => i.order_id === o.id));
    const totalQty = tktItems.reduce((s, i) => s + i.quantity, 0);
    const productSummary = tktItems.map(i => `${i.product_name} × ${i.quantity}`).join(", ").slice(0, 200);

    const { error } = await supabase
      .from("dine_in_tickets" as any)
      .update({ status: "paid", payment_method: payMethod, paid_at: new Date().toISOString() })
      .eq("id", tkt.id);
    if (error) { toast.error(error.message); return; }

    // Update the orders row that was created at customer submission. If for
    // some reason it doesn't exist (legacy ticket), insert one as Paid.
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("ticket_id", tkt.id)
      .maybeSingle();
    if ((existingOrder as any)?.id) {
      await supabase
        .from("orders")
        .update({
          status: "Paid",
          payment_method: payMethod,
          amount: Number(tkt.total_amount || 0),
          quantity: totalQty || 1,
          product: productSummary || "Dine-in",
        } as any)
        .eq("id", (existingOrder as any).id);
    } else {
      const code = `DT-${Date.now().toString().slice(-6)}`;
      await supabase.from("orders").insert({
        user_id: user.id,
        code,
        customer_name: tkt.table_label ?? "Dine-in",
        product: productSummary || "Dine-in",
        quantity: totalQty || 1,
        amount: Number(tkt.total_amount || 0),
        status: "Paid",
        order_source: "dine_in" as any,
        payment_method: payMethod,
        ticket_id: tkt.id,
      } as any);
    }

    toast.success(t("paid"));
    setCheckoutTicket(null);
    setPhone("");
    load();
  }

  function sendReceipt(tkt: Ticket) {
    const tktItems = orders.filter(o => o.ticket_id === tkt.id).flatMap(o => items.filter(i => i.order_id === o.id));
    const lines = tktItems.map(i => `• ${i.product_name} × ${i.quantity} — RM ${Number(i.line_total).toFixed(2)}`).join("\n");
    const msg = `🧾 ${tkt.table_label}\n${lines}\n\n${t("grand_total")}: RM ${Number(tkt.total_amount).toFixed(2)}\n${t("paid")} (${payMethod.toUpperCase()})`;
    const tel = phone.replace(/\D/g, "");
    const url = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="px-5 pt-10 pb-24 space-y-4 max-w-[480px] mx-auto">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/" })} className="h-9 w-9 rounded-full bg-card border border-border/60 flex items-center justify-center" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">🍽️ {t("dine_in")}</h1>
          <p className="text-[11px] text-muted-foreground">{t("open_tickets")}</p>
        </div>
        <button onClick={load} className="h-9 w-9 rounded-full bg-card border border-border/60 flex items-center justify-center"><RefreshCw className="h-4 w-4" /></button>
      </header>

      {loading && <div className="text-sm text-muted-foreground">…</div>}
      {!loading && tickets.length === 0 && (
        <div className="text-center py-10 text-sm text-muted-foreground">{t("no_open_tickets")}</div>
      )}

      {tickets.map(tkt => {
        const tktOrders = orders.filter(o => o.ticket_id === tkt.id);
        return (
          <div key={tkt.id} className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-bold">{tkt.table_label}</div>
                <div className="text-[11px] text-muted-foreground">{new Date(tkt.created_at).toLocaleTimeString()}</div>
              </div>
              <div className="text-base font-bold text-primary">RM {Number(tkt.total_amount).toFixed(2)}</div>
            </div>
            <div className="space-y-2">
              {tktOrders.map(o => {
                const its = items.filter(i => i.order_id === o.id);
                return (
                  <div key={o.id} className="rounded-xl bg-muted/40 p-2">
                    <div className="flex items-center justify-between mb-1">
                      <button onClick={() => advance(o)} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        o.status === "received" ? "bg-blue-500/15 text-blue-600" :
                        o.status === "preparing" ? "bg-amber-500/15 text-amber-600" :
                        o.status === "ready" ? "bg-emerald-500/15 text-emerald-600" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {t(o.status as any)} →
                      </button>
                      <span className="text-[11px] text-muted-foreground">{new Date(o.created_at).toLocaleTimeString()}</span>
                    </div>
                    <ul className="text-xs space-y-0.5">
                      {its.map(i => (
                        <li key={i.id}>• {i.product_name} × {i.quantity}</li>
                      ))}
                    </ul>
                    {o.note && <div className="text-[11px] italic text-muted-foreground mt-1">“{o.note}”</div>}
                  </div>
                );
              })}
            </div>
            <button onClick={() => setCheckoutTicket(tkt)} className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-semibold active:scale-95">
              {t("checkout")} · RM {Number(tkt.total_amount).toFixed(2)}
            </button>
          </div>
        );
      })}

      {checkoutTicket && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={() => setCheckoutTicket(null)}>
          <div className="bg-card w-full max-w-[480px] mx-auto rounded-t-3xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-base font-bold">{t("checkout")} · {checkoutTicket.table_label}</div>
              <button onClick={() => setCheckoutTicket(null)}><X className="h-5 w-5" /></button>
            </div>
            <div className="text-2xl font-bold text-primary">RM {Number(checkoutTicket.total_amount).toFixed(2)}</div>

            <div>
              <div className="text-sm font-medium mb-1">{t("payment_method")}</div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ["cash", t("pay_cash")],
                  ["qr", t("pay_qr")],
                  ["bank", t("pay_bank")],
                ] as const).map(([k, lbl]) => (
                  <button key={k} onClick={() => setPayMethod(k)}
                    className={`h-10 rounded-lg text-xs font-semibold border ${payMethod === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="60123456789"
              className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm"
            />

            <div className="flex gap-2">
              <button onClick={() => sendReceipt(checkoutTicket)} className="flex-1 h-11 rounded-xl border border-border font-semibold flex items-center justify-center gap-2">
                <MessageCircle className="h-4 w-4" /> {t("send_receipt")}
              </button>
              <button onClick={markPaid} className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground font-bold">
                {t("mark_paid")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}