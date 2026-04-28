import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase, type OrderStatus } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/new-order")({ component: NewOrderPage });

const statuses: { key: OrderStatus; label: string; bg: string; text: string; ring: string }[] = [
  { key: "Paid", label: "Paid ✓", bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-500" },
  { key: "Unpaid", label: "Unpaid", bg: "bg-red-50", text: "text-red-600", ring: "ring-red-500" },
  { key: "Pending", label: "Pending", bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-500" },
];

function NewOrderPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<OrderStatus>("Unpaid");
  const [form, setForm] = useState({
    customer_name: "", phone: "", product: "", quantity: "1", amount: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);

    const code = `ORD-${Date.now().toString().slice(-6)}`;
    const { error: orderErr } = await supabase.from("orders").insert({
      user_id: user.id,
      code,
      customer_name: form.customer_name,
      phone: form.phone || null,
      product: form.product,
      quantity: Number(form.quantity) || 1,
      amount: Number(form.amount) || 0,
      status,
      notes: form.notes || null,
    });

    if (orderErr) { setError(orderErr.message); setSaving(false); return; }

    // Upsert customer aggregate
    const amount = Number(form.amount) || 0;
    const { data: existing } = await supabase
      .from("customers")
      .select("*")
      .eq("user_id", user.id)
      .eq("name", form.customer_name)
      .maybeSingle();

    if (existing) {
      await supabase.from("customers").update({
        total_orders: (existing.total_orders ?? 0) + 1,
        total_spent: Number(existing.total_spent ?? 0) + amount,
        last_order_at: new Date().toISOString(),
        phone: existing.phone ?? form.phone ?? null,
      }).eq("id", existing.id);
    } else {
      await supabase.from("customers").insert({
        user_id: user.id,
        name: form.customer_name,
        phone: form.phone || null,
        total_orders: 1,
        total_spent: amount,
        last_order_at: new Date().toISOString(),
      });
    }

    setSaving(false);
    navigate({ to: "/orders" });
  };

  return (
    <div className="px-5 pt-10 pb-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          New Order <span className="text-primary">✦</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Fill in the details below</p>
      </header>

      <form className="space-y-5" onSubmit={save}>
        <Field label="Customer Name" icon="👤" placeholder="e.g. Siti Aminah" value={form.customer_name} onChange={upd("customer_name")} required />
        <Field label="Phone Number" icon="📱" placeholder="e.g. 0123456789" value={form.phone} onChange={upd("phone")} type="tel" />
        <Field label="Product Name" icon="🛍️" placeholder="Type or select product" value={form.product} onChange={upd("product")} required />
        <Field label="Quantity" icon="#" placeholder="1" value={form.quantity} onChange={upd("quantity")} type="number" />
        <Field label="Price (RM)" icon="💰" placeholder="0.00" value={form.amount} onChange={upd("amount")} type="number" required />

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
            Payment Status
          </p>
          <div className="grid grid-cols-3 gap-2">
            {statuses.map((s) => {
              const sel = status === s.key;
              return (
                <button
                  key={s.key} type="button" onClick={() => setStatus(s.key)}
                  className={`py-3 rounded-2xl text-sm font-semibold transition-all ${s.bg} ${s.text} ${sel ? `ring-2 ${s.ring}` : "ring-0"}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
            Notes (Optional)
          </label>
          <textarea
            rows={3} value={form.notes} onChange={upd("notes")}
            placeholder="Add special instructions..."
            className="w-full rounded-2xl bg-muted/60 border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition resize-none"
          />
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="space-y-3 pt-2">
          <button
            type="submit" disabled={saving}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-bold text-sm shadow-[var(--shadow-soft)] active:scale-[0.99] transition-transform disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Order"}
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

function Field({ label, icon, ...rest }: { label: string; icon: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base">{icon}</span>
        <input
          {...rest}
          className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
        />
      </div>
    </div>
  );
}
