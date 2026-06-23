import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { Minus, Plus, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/dine/$tableId")({ component: DinePage });

type MenuItem = {
  inventory_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  cover_image_url: string | null;
  category: string | null;
  stock: number;
};

type TableInfo = { id: string; label: string; user_id: string; active: boolean };

function DinePage() {
  const { tableId } = useParams({ from: "/dine/$tableId" });
  const { t } = useI18n();
  const [table, setTable] = useState<TableInfo | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: tbl } = await supabase
        .from("restaurant_tables" as any)
        .select("id,label,user_id,active")
        .eq("id", tableId)
        .maybeSingle();
      if (!tbl || !(tbl as any).active) {
        setError(t("table_inactive"));
        setLoading(false);
        return;
      }
      setTable(tbl as any);
      const { data: items } = await supabase.rpc("get_dine_in_menu" as any, { _table_id: tableId });
      setMenu((items as any) ?? []);
      setLoading(false);
    })();
  }, [tableId, t]);

  const items = useMemo(() =>
    menu.map(m => ({ ...m, qty: cart[m.inventory_id] ?? 0 }))
  , [menu, cart]);

  const cartItems = items.filter(i => i.qty > 0);
  const total = cartItems.reduce((s, i) => s + i.qty * Number(i.price || 0), 0);
  const totalQty = cartItems.reduce((s, i) => s + i.qty, 0);

  function inc(id: string) { setCart(c => ({ ...c, [id]: (c[id] ?? 0) + 1 })); }
  function dec(id: string) { setCart(c => { const v = (c[id] ?? 0) - 1; const x = { ...c }; if (v <= 0) delete x[id]; else x[id] = v; return x; }); }

  async function submit() {
    if (!table || cartItems.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      // 1. find or create open ticket
      let ticketId: string | null = null;
      const { data: existing } = await supabase
        .rpc("get_open_dine_in_ticket" as any, { _table_id: table.id });
      const existingRow = Array.isArray(existing) ? existing[0] : existing;
      if ((existingRow as any)?.id) {
        ticketId = (existingRow as any).id;
      } else {
        const { data: newT, error: e1 } = await supabase
          .from("dine_in_tickets" as any)
          .insert({ user_id: table.user_id, table_id: table.id, status: "open" })
          .select("id")
          .single();
        if (e1) throw e1;
        ticketId = (newT as any).id;
      }
      if (!ticketId) throw new Error("ticket");

      // 2. create order
      const orderTotal = total;
      const { data: orderRow, error: e2 } = await supabase
        .from("dine_in_orders" as any)
        .insert({
          user_id: table.user_id,
          ticket_id: ticketId,
          table_id: table.id,
          status: "received",
          note: note || null,
          total_amount: orderTotal,
        })
        .select("id")
        .single();
      if (e2) throw e2;
      const orderId = (orderRow as any).id;

      // 3. items
      const rows = cartItems.map(i => ({
        user_id: table.user_id,
        order_id: orderId,
        inventory_id: i.inventory_id,
        product_name: i.name,
        quantity: i.qty,
        unit_price: Number(i.price || 0),
        line_total: i.qty * Number(i.price || 0),
      }));
      const { error: e3 } = await supabase.from("dine_in_order_items" as any).insert(rows);
      if (e3) throw e3;

      toast.success(t("order_submitted"));
      setCart({});
      setNote("");
      setShowCart(false);
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-10 text-center text-muted-foreground">…</div>;
  if (error) return <div className="p-10 text-center text-muted-foreground">{error}</div>;

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/40 px-5 py-3">
        <div className="text-[11px] text-muted-foreground">{t("your_table")}</div>
        <div className="text-lg font-bold">{table?.label} · {t("menu_label")}</div>
      </header>

      {items.length === 0 ? (
        <div className="p-10 text-center text-muted-foreground">{t("empty_menu")}</div>
      ) : (
        <div className="p-4 grid grid-cols-2 gap-3">
          {items.map(i => {
            const img = i.cover_image_url || i.image_url;
            return (
              <div key={i.inventory_id} className="rounded-2xl border border-border/60 bg-card overflow-hidden flex flex-col">
                {img ? (
                  <img src={img} alt={i.name} className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square bg-muted flex items-center justify-center text-3xl">🍱</div>
                )}
                <div className="p-2 flex-1 flex flex-col">
                  <div className="text-sm font-semibold leading-tight line-clamp-2">{i.name}</div>
                  <div className="text-sm font-bold text-primary mt-1">RM {Number(i.price || 0).toFixed(2)}</div>
                  <div className="mt-auto pt-2">
                    {i.qty === 0 ? (
                      <button onClick={() => inc(i.inventory_id)} className="w-full h-8 rounded-lg bg-primary text-primary-foreground text-xs font-semibold active:scale-95">
                        {t("add_to_cart")}
                      </button>
                    ) : (
                      <div className="flex items-center justify-between gap-1">
                        <button onClick={() => dec(i.inventory_id)} className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                        <span className="text-sm font-bold">{i.qty}</span>
                        <button onClick={() => inc(i.inventory_id)} className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Plus className="h-3 w-3" /></button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalQty > 0 && !showCart && (
        <button onClick={() => setShowCart(true)} className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 h-12 px-5 rounded-full bg-primary text-primary-foreground font-semibold shadow-lg flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" /> {t("view_cart")} · {totalQty} · RM {total.toFixed(2)}
        </button>
      )}

      {showCart && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-end" onClick={() => setShowCart(false)}>
          <div className="bg-card w-full max-w-[480px] mx-auto rounded-t-3xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-base font-bold">{t("cart")} · {table?.label}</div>
              <button onClick={() => setShowCart(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="max-h-[40vh] overflow-y-auto divide-y divide-border/40">
              {cartItems.map(i => (
                <div key={i.inventory_id} className="flex items-center gap-2 py-2">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{i.name}</div>
                    <div className="text-[11px] text-muted-foreground">RM {Number(i.price).toFixed(2)} × {i.qty}</div>
                  </div>
                  <button onClick={() => dec(i.inventory_id)} className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                  <span className="text-sm font-bold w-5 text-center">{i.qty}</span>
                  <button onClick={() => inc(i.inventory_id)} className="h-7 w-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Plus className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t("note_optional")}
              className="w-full rounded-lg border border-border bg-background p-2 text-sm min-h-[60px]"
            />
            <div className="flex items-center justify-between text-base font-bold">
              <span>{t("grand_total")}</span><span>RM {total.toFixed(2)}</span>
            </div>
            <button
              disabled={submitting || cartItems.length === 0}
              onClick={submit}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50"
            >{submitting ? "…" : t("submit_order")}</button>
          </div>
        </div>
      )}
    </div>
  );
}