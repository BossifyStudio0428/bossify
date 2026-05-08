import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeft, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase, type OrderRow, type OrderStatus } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { renderTemplate, buildWhatsAppLink, getOrderTemplate, formatPaymentBlock } from "@/lib/wa";

export const Route = createFileRoute("/orders/$orderId")({
  validateSearch: (search: Record<string, unknown>) => ({
    edit: search.edit === true || search.edit === "true",
  }),
  component: OrderDetailPage,
});

const statusBanner: Record<OrderStatus, string> = {
  Paid: "bg-emerald-500 text-white",
  Unpaid: "bg-red-500 text-white",
  Pending: "bg-amber-400 text-amber-950",
};

function OrderDetailPage() {
  const { orderId } = useParams({ from: "/orders/$orderId" });
  const { edit } = Route.useSearch();
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(edit);
  const [form, setForm] = useState<Partial<OrderRow>>({});
  const [customOrderTpl, setCustomOrderTpl] = useState<string | null>(null);
  const [paymentBlock, setPaymentBlock] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data }, { data: pref }, { data: prof }] = await Promise.all([
        supabase.from("orders").select("*").eq("id", orderId).maybeSingle(),
        supabase.from("user_preferences").select("wa_order_template").maybeSingle(),
        supabase.from("profiles").select("payment_method_1_type,payment_method_1_number,payment_method_1_name,payment_method_1_qr_url,payment_method_2_type,payment_method_2_number,payment_method_2_name,payment_method_2_qr_url").maybeSingle(),
      ]);
      setOrder(data as OrderRow | null);
      setForm((data ?? {}) as Partial<OrderRow>);
      if (pref?.wa_order_template) setCustomOrderTpl(pref.wa_order_template);
      if (prof) {
        setPaymentBlock(formatPaymentBlock([
          { type: prof.payment_method_1_type, number: prof.payment_method_1_number, name: prof.payment_method_1_name, qr_url: prof.payment_method_1_qr_url },
          { type: prof.payment_method_2_type, number: prof.payment_method_2_number, name: prof.payment_method_2_name, qr_url: prof.payment_method_2_qr_url },
        ], lang));
      }
      setLoading(false);
    })();
  }, [orderId, lang]);

  const sendWA = () => {
    if (!order?.phone) { alert(t("no_phone_for_wa")); return; }
    const msg = renderTemplate(getOrderTemplate(lang, customOrderTpl), {
      customer_name: order.customer_name, code: order.code, product: order.product,
      quantity: order.quantity, amount: Number(order.amount).toFixed(2),
      status: order.status, notes: order.notes ?? "",
      payment_details: order.status !== "Paid" ? paymentBlock : "",
    }, lang);
    window.open(buildWhatsAppLink(order.phone, msg), "_blank");
  };

  const save = async () => {
    if (!user || !order) return;
    setSaving(true);
    const { error } = await supabase.from("orders").update({
      customer_name: form.customer_name?.trim(),
      phone: form.phone?.toString().trim() || null,
      product: form.product?.trim(),
      quantity: Number(form.quantity ?? 1),
      amount: Number(form.amount ?? 0),
      status: form.status,
      notes: form.notes?.toString().trim() || null,
    }).eq("id", order.id).eq("user_id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(t("order_updated"));
      setOrder({ ...order, ...(form as OrderRow) });
      setEditing(false);
    }
  };

  const remove = async () => {
    if (!order || !confirm(t("delete_confirm"))) return;
    const { error } = await supabase.from("orders").delete().eq("id", order.id);
    if (error) toast.error(error.message);
    else { toast.success(t("order_deleted")); navigate({ to: "/orders" }); }
  };

  if (loading) return <p className="p-6 text-sm text-muted-foreground">{t("loading")}</p>;
  if (!order) return (
    <div className="p-6 space-y-3">
      <p className="text-sm">{t("order_not_found")}</p>
      <button onClick={() => navigate({ to: "/orders" })} className="text-primary text-sm">{t("back_arrow")}</button>
    </div>
  );

  return (
    <div className="pb-8 space-y-5">
      <header className="flex items-center gap-3 px-5 pt-10">
        <button onClick={() => navigate({ to: "/orders" })} className="h-10 w-10 rounded-full bg-card border border-border/60 flex items-center justify-center">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-bold flex-1 truncate">{order.code}</h1>
        {!editing && (
          <button onClick={() => setEditing(true)} className="h-10 w-10 rounded-full bg-card border border-border/60 flex items-center justify-center">
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </header>

      <div className={`mx-5 rounded-2xl py-5 text-center font-bold text-lg ${statusBanner[order.status]}`}>
        {order.status.toUpperCase()}
      </div>

      {!editing ? (
        <div className="px-5 space-y-4">
          <div className="rounded-2xl bg-card border border-border/60 p-4 flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold">
              {order.customer_name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">👤 {order.customer_name}</p>
              {order.phone ? (
                <div className="flex gap-3 mt-1">
                  <a href={`tel:${order.phone}`} className="text-xs text-primary">📞 {t("call")}</a>
                  <a href={buildWhatsAppLink(order.phone, "")} target="_blank" rel="noreferrer" className="text-xs text-emerald-600">📱 WhatsApp</a>
                </div>
              ) : <p className="text-xs text-muted-foreground mt-1">{t("no_phone")}</p>}
            </div>
          </div>

          <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-2 text-sm">
            <Row label={`🛍️ ${t("product")}`} value={order.product} />
            <Row label={`📦 ${t("quantity")}`} value={String(order.quantity)} />
            <Row label={`💰 ${t("price")}`} value={`RM ${Number(order.amount).toFixed(2)}`} />
            <Row label={`📅 ${t("date_label")}`} value={new Date(order.created_at).toLocaleString("en-MY")} />
            <Row label={`📋 ${t("code_label")}`} value={order.code} />
            <Row label={`📝 ${t("notes")}`} value={order.notes || t("no_notes")} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button onClick={sendWA} className="py-3 rounded-2xl bg-emerald-500 text-white font-semibold text-xs">📲 WhatsApp</button>
            <button onClick={() => setEditing(true)} className="py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-xs">✏️ {t("edit")}</button>
            <button onClick={remove} className="py-3 rounded-2xl bg-red-500 text-white font-semibold text-xs">🗑️ {t("delete")}</button>
          </div>
        </div>
      ) : (
        <div className="px-5 space-y-3">
          <Input label={t("customer_name")} value={form.customer_name ?? ""} onChange={(v) => setForm((p) => ({ ...p, customer_name: v }))} />
          <Input label={t("phone_number")} value={(form.phone as string) ?? ""} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} />
          <Input label={t("product")} value={form.product ?? ""} onChange={(v) => setForm((p) => ({ ...p, product: v }))} />
          <Input label={t("quantity")} type="number" value={String(form.quantity ?? 1)} onChange={(v) => setForm((p) => ({ ...p, quantity: Number(v) }))} />
          <Input label={t("price")} type="number" value={String(form.amount ?? 0)} onChange={(v) => setForm((p) => ({ ...p, amount: Number(v) }))} />
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase font-semibold text-muted-foreground px-1">{t("payment_status")}</label>
            <div className="grid grid-cols-3 gap-2">
              {(["Paid", "Unpaid", "Pending"] as OrderStatus[]).map((s) => (
                <button key={s} type="button" onClick={() => setForm((p) => ({ ...p, status: s }))}
                  className={`py-3 rounded-xl text-xs font-semibold ${form.status === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <Input label={t("notes")} value={(form.notes as string) ?? ""} onChange={(v) => setForm((p) => ({ ...p, notes: v }))} />
          <div className="flex gap-2 pt-2">
            <button onClick={() => { setEditing(false); setForm(order); }} className="flex-1 py-3 rounded-2xl bg-muted font-semibold text-sm">{t("cancel")}</button>
            <button onClick={save} disabled={saving} className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-60">{saving ? t("saving") : t("save")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl bg-card border border-border/60 px-4 py-3 text-sm text-foreground outline-none focus:border-primary" />
    </div>
  );
}