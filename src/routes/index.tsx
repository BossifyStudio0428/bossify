import { createFileRoute } from "@tanstack/react-router";
import { DollarSign, ShoppingBag, AlertCircle, PackageX } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

const stats = [
  { label: "Today's Revenue", value: "RM 243", icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
  { label: "New Orders", value: "7", icon: ShoppingBag, color: "text-primary", bg: "bg-primary/10" },
  { label: "Unpaid", value: "3", icon: AlertCircle, color: "text-red-500", bg: "bg-red-50" },
  { label: "Low Stock", value: "2", icon: PackageX, color: "text-amber-500", bg: "bg-amber-50" },
];

const weekly = [
  { day: "Mon", value: 120 },
  { day: "Tue", value: 80 },
  { day: "Wed", value: 160 },
  { day: "Thu", value: 95 },
  { day: "Fri", value: 210 },
  { day: "Sat", value: 175 },
  { day: "Sun", value: 243 },
];
const todayIdx = 6;
const maxVal = Math.max(...weekly.map((w) => w.value));

type Status = "Paid" | "Unpaid" | "Pending";
const orders: { name: string; product: string; amount: string; status: Status }[] = [
  { name: "Siti Aminah", product: "Kuih Lapis (x3)", amount: "RM 18", status: "Unpaid" },
  { name: "Farah Nadia", product: "Nasi Lemak Pack (x5)", amount: "RM 45", status: "Paid" },
  { name: "Mei Ling", product: "Baju Kurung Moden", amount: "RM 120", status: "Paid" },
];

const statusStyles: Record<Status, string> = {
  Paid: "bg-emerald-100 text-emerald-700",
  Unpaid: "bg-red-100 text-red-600",
  Pending: "bg-amber-100 text-amber-700",
};

function Index() {
  const today = new Date().toLocaleDateString("en-MY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="px-5 pt-10 pb-4 space-y-6">
      {/* Greeting */}
      <header>
        <p className="text-sm text-muted-foreground">Good morning,</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Kak Siti 👋</h1>
        <p className="mt-1 text-xs text-muted-foreground">{today}</p>
      </header>

      {/* Stats grid */}
      <section className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4"
          >
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${s.bg}`}>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </div>
            <p className={`mt-3 text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </section>

      {/* Weekly Sales */}
      <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
          Weekly Sales (RM)
        </p>
        <div className="mt-4 flex items-end justify-between gap-2 h-32">
          {weekly.map((w, i) => {
            const h = Math.max(8, (w.value / maxVal) * 100);
            const isToday = i === todayIdx;
            return (
              <div key={w.day} className="flex-1 flex flex-col items-center gap-2">
                <div
                  className={`w-full rounded-t-lg ${
                    isToday
                      ? "bg-gradient-to-t from-primary to-primary/70"
                      : "bg-primary/20"
                  }`}
                  style={{ height: `${h}%` }}
                />
                <span
                  className={`text-[10px] ${
                    isToday ? "text-primary font-semibold" : "text-muted-foreground"
                  }`}
                >
                  {w.day}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent Orders */}
      <section>
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground mb-2 px-1">
          Recent Orders
        </p>
        <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60">
          {orders.map((o) => (
            <div key={o.name} className="flex items-center gap-3 p-4">
              <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
                {o.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{o.name}</p>
                <p className="text-xs text-muted-foreground truncate">{o.product}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-foreground">{o.amount}</p>
                <span
                  className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyles[o.status]}`}
                >
                  {o.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
