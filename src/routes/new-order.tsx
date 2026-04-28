import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/new-order")({
  component: NewOrderPage,
});

type PayStatus = "Paid" | "Unpaid" | "Pending";

const fields: { label: string; placeholder: string; icon: string; type?: string }[] = [
  { label: "Customer Name", placeholder: "e.g. Siti Aminah", icon: "👤" },
  { label: "Phone Number", placeholder: "e.g. 0123456789", icon: "📱", type: "tel" },
  { label: "Product Name", placeholder: "Type or select product", icon: "🛍️" },
  { label: "Quantity", placeholder: "1", icon: "#", type: "number" },
  { label: "Price (RM)", placeholder: "0.00", icon: "💰", type: "number" },
];

const statuses: {
  key: PayStatus;
  label: string;
  bg: string;
  text: string;
  ring: string;
}[] = [
  { key: "Paid", label: "Paid ✓", bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-500" },
  { key: "Unpaid", label: "Unpaid", bg: "bg-red-50", text: "text-red-600", ring: "ring-red-500" },
  { key: "Pending", label: "Pending", bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-500" },
];

function NewOrderPage() {
  const [status, setStatus] = useState<PayStatus>("Unpaid");

  return (
    <div className="px-5 pt-10 pb-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          New Order <span className="text-primary">✦</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Fill in the details below</p>
      </header>

      <form
        className="space-y-5"
        onSubmit={(e) => e.preventDefault()}
      >
        {fields.map((f) => (
          <div key={f.label} className="space-y-1.5">
            <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
              {f.label}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base">
                {f.icon}
              </span>
              <input
                type={f.type ?? "text"}
                placeholder={f.placeholder}
                className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
              />
            </div>
          </div>
        ))}

        {/* Payment status */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
            Payment Status
          </p>
          <div className="grid grid-cols-3 gap-2">
            {statuses.map((s) => {
              const selected = status === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStatus(s.key)}
                  className={`py-3 rounded-2xl text-sm font-semibold transition-all ${s.bg} ${s.text} ${
                    selected ? `ring-2 ${s.ring}` : "ring-0"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
            Notes (Optional)
          </label>
          <textarea
            rows={3}
            placeholder="Add special instructions..."
            className="w-full rounded-2xl bg-muted/60 border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition resize-none"
          />
        </div>

        {/* Buttons */}
        <div className="space-y-3 pt-2">
          <button
            type="submit"
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-sm shadow-[var(--shadow-soft)] active:scale-[0.99] transition-transform"
          >
            Save Order
          </button>
          <button
            type="button"
            className="w-full py-4 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-sm active:scale-[0.99] transition-transform"
          >
            📲 Save & Send WhatsApp Confirmation
          </button>
        </div>
      </form>
    </div>
  );
}