import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase, type OrderRow, type OrderStatus } from "@/integrations/supabase/client";

export const Route = createFileRoute("/orders")({ component: OrdersPage });

type Filter = "All" | OrderStatus;
const filters: Filter[] = ["All", "Unpaid", "Paid", "Pending"];

const statusStyles: Record<OrderStatus, string> = {
  Paid: "bg-emerald-100 text-emerald-700",
  Unpaid: "bg-red-100 text-red-600",
  Pending: "bg-amber-100 text-amber-700",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
}

function OrdersPage() {
  const [active, setActive] = useState<Filter>("All");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setOrders((data ?? []) as OrderRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markPaid = async (id: string) => {
    await supabase.from("orders").update({ status: "Paid" }).eq("id", id);
    load();
  };

  const visible = active === "All" ? orders : orders.filter((o) => o.status === active);
  const todayCount = orders.filter((o) => {
    const d = new Date(o.created_at);
    const t = new Date();
    return d.toDateString() === t.toDateString();
  }).length;

  return (
    <div className="px-5 pt-10 pb-4 space-y-5">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Orders</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {todayCount} today
        </span>
      </header>

      <div className="-mx-5 px-5 overflow-x-auto scrollbar-none">
        <div className="flex gap-2 w-max">
          {filters.map((f) => {
            const isActive = active === f;
            return (
              <button
                key={f}
                onClick={() => setActive(f)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-[var(--shadow-soft)]"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="space-y-3">
        {loading && <p className="text-center text-sm text-muted-foreground py-10">Loading...</p>}

        {!loading && visible.map((o) => (
          <article
            key={o.id}
            className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold shrink-0">
                {o.customer_name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{o.customer_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {o.code} · {formatTime(o.created_at)}
                </p>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyles[o.status]}`}>
                {o.status}
              </span>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              {o.product} {o.quantity > 1 ? `(x${o.quantity})` : ""}
            </p>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-lg font-bold text-foreground">RM {Number(o.amount).toFixed(2)}</p>
              {o.status === "Unpaid" && (
                <button
                  onClick={() => markPaid(o.id)}
                  className="text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-500 text-white shadow-sm active:scale-95 transition-transform"
                >
                  Mark Paid ✓
                </button>
              )}
              {o.status === "Pending" && (
                <button
                  onClick={() => markPaid(o.id)}
                  className="text-xs font-semibold px-3 py-2 rounded-xl bg-amber-400 text-amber-950 shadow-sm active:scale-95 transition-transform"
                >
                  Mark Paid ✓
                </button>
              )}
            </div>
          </article>
        ))}

        {!loading && visible.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">No orders here.</p>
        )}
      </div>
    </div>
  );
}
