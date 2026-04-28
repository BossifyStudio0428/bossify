import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/customers")({
  component: CustomersPage,
});

type Customer = {
  name: string;
  orders: number;
  spent: string;
  last: string;
};

const customers: Customer[] = [
  { name: "Siti Aminah", orders: 12, spent: "RM 340", last: "Today" },
  { name: "Farah Nadia", orders: 8, spent: "RM 520", last: "Today" },
  { name: "Mei Ling", orders: 21, spent: "RM 1,240", last: "Yesterday" },
  { name: "Nurul Huda", orders: 5, spent: "RM 180", last: "2 days ago" },
  { name: "Zainab Hassan", orders: 9, spent: "RM 415", last: "Today" },
];

function CustomersPage() {
  const [query, setQuery] = useState("");
  const visible = customers.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="px-5 pt-10 pb-4 space-y-5">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Customers</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {customers.length} total
        </span>
      </header>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base">🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customers..."
          className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
        />
      </div>

      <div className="space-y-3">
        {visible.map((c) => (
          <article
            key={c.name}
            className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 flex items-center gap-3"
          >
            <div className="h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold text-base shrink-0">
              {c.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {c.orders} orders · Last: {c.last}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <p className="text-sm font-bold text-primary">{c.spent}</p>
              <button className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500 text-white active:scale-95 transition-transform">
                📲 WA
              </button>
            </div>
          </article>
        ))}

        {visible.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">No customers found.</p>
        )}
      </div>
    </div>
  );
}