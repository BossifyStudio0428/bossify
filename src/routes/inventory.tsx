import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/inventory")({
  component: InventoryPage,
});

type Item = {
  name: string;
  stock: number;
  unit: string;
  max: number;
  low: boolean;
};

const items: Item[] = [
  { name: "Kuih Lapis", stock: 24, unit: "pcs", max: 50, low: false },
  { name: "Nasi Lemak Pack", stock: 6, unit: "packs", max: 30, low: true },
  { name: "Kek Batik (Large)", stock: 3, unit: "pcs", max: 20, low: true },
  { name: "Baju Kurung Moden", stock: 15, unit: "pcs", max: 30, low: false },
  { name: "Handmade Scrunchie", stock: 42, unit: "pcs", max: 60, low: false },
];

function InventoryPage() {
  const [query, setQuery] = useState("");
  const lowCount = items.filter((i) => i.low).length;
  const visible = items.filter((i) =>
    i.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="px-5 pt-10 pb-4 space-y-5">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Inventory</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {items.length} items
        </span>
      </header>

      {lowCount > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
          <span className="text-base leading-tight">⚠️</span>
          <p className="text-xs text-amber-800 leading-snug">
            <span className="font-semibold">{lowCount} items running low</span> — Restock before you run out
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base">🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products..."
          className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
        />
      </div>

      {/* Items */}
      <div className="space-y-3">
        {visible.map((it) => {
          const pct = Math.min(100, Math.round((it.stock / it.max) * 100));
          return (
            <article
              key={it.name}
              className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{it.name}</p>
                {it.low && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                    LOW STOCK
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-1.5">
                <span
                  className={`text-2xl font-bold ${
                    it.low ? "text-red-500" : "text-foreground"
                  }`}
                >
                  {it.stock}
                </span>
                <span className="text-xs text-muted-foreground">{it.unit} left</span>
              </div>

              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    it.low
                      ? "bg-red-500"
                      : "bg-gradient-to-r from-primary to-primary/70"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button className="py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold active:scale-[0.98] transition-transform">
                  – Remove
                </button>
                <button className="py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-sm font-semibold shadow-[var(--shadow-soft)] active:scale-[0.98] transition-transform">
                  + Restock
                </button>
              </div>
            </article>
          );
        })}

        {visible.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">No products found.</p>
        )}
      </div>
    </div>
  );
}