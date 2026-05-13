import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft, X } from "lucide-react";
import { toast } from "sonner";
import { supabase, type CustomerRow, type OrderRow } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/customers/$customerId")({ component: CustomerDetail });

const statusStyles: Record<string, string> = {
  Paid: "bg-emerald-100 text-emerald-700",
  Unpaid: "bg-red-100 text-red-600",
  Pending: "bg-amber-100 text-amber-700",
};

function buildWA(phone: string, message: string) {
  const cleaned = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

function CustomerDetail() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { customerId } = Route.useParams();
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: c } = await supabase.from("customers").select("*").eq("id", customerId).maybeSingle();
    if (!c) { setLoading(false); return; }
    setCustomer(c as CustomerRow);
    const { data: o } = await supabase
      .from("orders").select("*")
      .eq("customer_name", (c as CustomerRow).name)
      .order("created_at", { ascending: false });
    setOrders((o ?? []) as OrderRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [customerId]);

  const handleDelete = async () => {
    if (!customer) return;
    const { error } = await supabase.from("customers").delete().eq("id", customer.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("customer_deleted"));
    navigate({ to: "/customers" });
  };

  if (loading) {
    return (
      <div className="px-5 pt-10 flex justify-center">
        <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }
  if (!customer) {
    return (
      <div className="px-5 pt-10 text-center">
        <p className="text-sm text-muted-foreground">{t("no_customers")}</p>
        <Link to="/customers" className="text-primary text-sm mt-3 inline-block">{t("back")}</Link>
      </div>
    );
  }

  const memberSince = new Date(customer.created_at).toLocaleDateString("en-MY", { month: "short", year: "numeric" });

  return (
    <div className="px-5 pt-10 pb-6 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/customers" })} className="p-2 -ml-2 rounded-full hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold">{t("customer_detail")}</h1>
      </div>

      <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-5 flex flex-col items-center text-center gap-2">
        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-2xl font-bold shadow-[var(--shadow-soft)]">
          {customer.name.charAt(0).toUpperCase()}
        </div>
        <h2 className="text-xl font-bold">{customer.name}</h2>
        {customer.phone ? (
          <a href={`tel:${customer.phone}`} className="text-sm text-primary">{customer.phone}</a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </section>

      <section className="grid grid-cols-3 gap-2">
        <Stat label={t("total_orders")} value={String(customer.total_orders)} />
        <Stat label={t("total_spent")} value={`RM ${Number(customer.total_spent).toFixed(0)}`} />
        <Stat label={t("member_since")} value={memberSince} />
      </section>

      <section className="space-y-2">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
          {t("order_history")}
        </p>
        <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60">
          {orders.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-6">{t("no_orders_found")}</p>
          )}
          {orders.map((o) => (
            <div key={o.id} className="p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono text-muted-foreground">{o.code}</p>
                <p className="text-sm font-semibold truncate">{o.product} {o.quantity > 1 ? `x${o.quantity}` : ""}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">RM {Number(o.amount).toFixed(0)}</p>
                <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyles[o.status]}`}>
                  {o.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2 pt-2">
        <button
          onClick={() => {
            if (!customer.phone) { toast.error(t("no_phone_for_wa")); return; }
            window.open(buildWA(customer.phone, `Hi ${customer.name}! 👋 Thank you for being a valued customer! 😊`), "_blank");
          }}
          className="w-full py-3.5 rounded-2xl bg-emerald-500 text-white font-semibold active:scale-[0.99]"
        >
          📲 {t("send_whatsapp")}
        </button>
        <button
          onClick={() => setEditing(true)}
          className="w-full py-3.5 rounded-2xl bg-primary/10 text-primary font-semibold active:scale-[0.99]"
        >
          ✏️ {t("edit_customer")}
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          className="w-full py-3.5 rounded-2xl bg-red-50 text-red-600 font-semibold active:scale-[0.99]"
        >
          🗑️ {t("delete_customer")}
        </button>
      </section>

      {editing && (
        <EditSheet
          customer={customer}
          onClose={() => setEditing(false)}
          onSaved={(c) => { setCustomer(c); setEditing(false); }}
        />
      )}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setConfirmDelete(false)}>
          <div className="w-full max-w-[390px] rounded-t-3xl bg-card p-5 pb-8 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">{t("delete_customer_confirm")}</h3>
            <p className="text-sm text-muted-foreground">{customer.name}</p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button onClick={() => setConfirmDelete(false)} className="py-3 rounded-2xl bg-muted text-foreground font-semibold">{t("cancel")}</button>
              <button onClick={handleDelete} className="py-3 rounded-2xl bg-red-500 text-white font-semibold">{t("delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-3 text-center">
      <p className="text-sm font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{label}</p>
    </div>
  );
}

function EditSheet({
  customer, onClose, onSaved,
}: { customer: CustomerRow; onClose: () => void; onSaved: (c: CustomerRow) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error(t("required_field")); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from("customers")
      .update({ name: name.trim(), phone: phone.trim() || null })
      .eq("id", customer.id)
      .select("*")
      .single();
    setSaving(false);
    if (error || !data) { toast.error(error?.message ?? t("update_failed")); return; }
    toast.success(t("customer_updated"));
    onSaved(data as CustomerRow);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-[390px] rounded-t-3xl bg-card p-5 pb-8 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{t("edit_customer")}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("customer_name")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("phone_number")}</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel"
            className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15" />
        </div>
        <button
          onClick={save} disabled={saving}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold disabled:opacity-60"
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </div>
  );
}