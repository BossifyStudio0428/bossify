import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/orders")({
  component: OrdersPage,
});

type Status = "Unpaid" | "Paid" | "Pending";
type Filter = "All" | Status;

const orders: {
  id: string;
  name: string;
  product: string;
  amount: string;
  status: Status;
  time: string;
}[] = [
  { id: "ORD-001", name: "Siti Aminah", product: "Kuih Lapis (x3)", amount: "RM 18", status: "Unpaid", time: "9:41 AM" },
  { id: "ORD-002", name: "Farah Nadia", product: "Nasi Lemak Pack (x5)", amount: "RM 45", status: "Paid", time: "9:15 AM" },
  { id: "ORD-003", name: "Mei Ling", product: "Baju Kurung Moden", amount: "RM 120", status: "Paid", time: "8:50 AM" },
  { id: "ORD-004", name: "Nurul Huda", product: "Handmade Scrunchie (x10)", amount: "RM 60", status: "Pending", time: "8:30 AM" },
  { id: "ORD-005", name: "Zainab Hassan", product: "Kek Batik (Large)", amount: "RM 35", status: "Unpaid", time: "8:00 AM" },
];

const filters: Filter[] = ["All", "Unpaid", "Paid", "Pending"];

const statusStyles: Record<Status, string> = {
  Paid: "bg-emerald-100 text-emerald-700",
  Unpaid: "bg-red-100 text-red-600",
  Pending: "bg-amber-100 text-amber-700",
};

function OrdersPage() {
  const [active, setActive] = useState<Filter>("All");
  const visible = active === "All" ? orders : orders.filter((o) => o.status === active);

  return (
    <div className="px-5 pt-10 pb-4 space-y-5">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Orders</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          5 today
        </span>
      </header>

      {/* Filter tabs */}
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

      {/* Order cards */}
      <div className="space-y-3">
        {visible.map((o) => (
          <article
            key={o.id}
            className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold shrink-0">
                {o.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{o.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {o.id} · {o.time}
                </p>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyles[o.status]}`}
              >
                {o.status}
              </span>
            </div>

            <p className="mt-3 text-sm text-muted-foreground">{o.product}</p>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-lg font-bold text-foreground">{o.amount}</p>
              {o.status === "Unpaid" && (
                <button className="text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-500 text-white shadow-sm active:scale-95 transition-transform">
                  📲 Send Reminder
                </button>
              )}
              {o.status === "Pending" && (
                <button className="text-xs font-semibold px-3 py-2 rounded-xl bg-amber-400 text-amber-950 shadow-sm active:scale-95 transition-transform">
                  Mark Paid ✓
                </button>
              )}
            </div>
          </article>
        ))}

        {visible.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">No orders here.</p>
        )}
      </div>
    </div>
  );
}