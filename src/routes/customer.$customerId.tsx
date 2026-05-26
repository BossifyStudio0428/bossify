import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft, X, Calendar as CalendarIcon, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase, type CustomerRow, type OrderRow, type CustomerStatus, type FollowUpRow } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { PhoneInput } from "@/components/PhoneInput";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { EducationDetailsForm } from "@/components/EducationDetailsForm";
import { FollowupPipeline } from "@/components/FollowupPipeline";
import { AdditionalServices } from "@/components/AdditionalServices";

export const Route = createFileRoute("/customer/$customerId")({ component: CustomerDetail });

const statusStyles: Record<string, string> = {
  Paid: "bg-emerald-100 text-emerald-700",
  Unpaid: "bg-red-100 text-red-600",
  Pending: "bg-amber-100 text-amber-700",
};

const CUSTOMER_STATUS_ORDER: CustomerStatus[] = ["enquiry", "in_progress", "completed", "rejected"];
const CUSTOMER_STATUS_STYLES: Record<CustomerStatus, string> = {
  enquiry: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-600",
};
const CUSTOMER_STATUS_DOT: Record<CustomerStatus, string> = {
  enquiry: "🔵", in_progress: "🟡", completed: "🟢", rejected: "🔴",
};

function buildWA(phone: string, message: string) {
  const cleaned = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

function CustomerDetail() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { type: bizType } = useBusinessType();
  const { customerId } = Route.useParams();
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [savingRemarks, setSavingRemarks] = useState(false);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [fuDate, setFuDate] = useState("");
  const [fuNote, setFuNote] = useState("");
  const [savingFu, setSavingFu] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: c } = await supabase.from("customers").select("*").eq("id", customerId).maybeSingle();
    if (!c) { setLoading(false); return; }
    setCustomer(c as CustomerRow);
    setRemarks(((c as CustomerRow).remarks ?? "") as string);
    const { data: o } = await supabase
      .from("orders").select("*")
      .eq("customer_name", (c as CustomerRow).name)
      .order("created_at", { ascending: false });
    setOrders((o ?? []) as OrderRow[]);
    const { data: fu } = await supabase
      .from("follow_ups").select("*")
      .eq("customer_id", customerId)
      .order("follow_up_date", { ascending: true });
    setFollowUps((fu ?? []) as FollowUpRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [customerId]);

  useEffect(() => {
    if (loading) return;
    const h = typeof window !== "undefined" ? window.location.hash : "";
    if (!h) return;
    const id = h.replace("#", "");
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, [loading]);

  const handleDelete = async () => {
    if (!customer) return;
    const { error } = await supabase.from("customers").delete().eq("id", customer.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("customer_deleted"));
    navigate({ to: "/customers" });
  };

  const cycleStatus = async () => {
    if (!customer) return;
    const current = (customer.customer_status ?? "enquiry") as CustomerStatus;
    const next = CUSTOMER_STATUS_ORDER[(CUSTOMER_STATUS_ORDER.indexOf(current) + 1) % CUSTOMER_STATUS_ORDER.length];
    const prev = customer;
    setCustomer({ ...customer, customer_status: next });
    const { error } = await supabase.from("customers").update({ customer_status: next }).eq("id", customer.id);
    if (error) { setCustomer(prev); toast.error(error.message); }
  };

  const saveRemarks = async () => {
    if (!customer) return;
    setSavingRemarks(true);
    const { error } = await supabase.from("customers").update({ remarks: remarks || null }).eq("id", customer.id);
    setSavingRemarks(false);
    if (error) { toast.error(error.message); return; }
    setCustomer({ ...customer, remarks: remarks || null });
    toast.success(t("customer_updated"));
  };

  const saveFollowUp = async () => {
    if (!customer || !fuDate) { toast.error(t("required_field")); return; }
    setSavingFu(true);
    const { data, error } = await supabase.from("follow_ups").insert({
      user_id: customer.user_id,
      customer_id: customer.id,
      follow_up_date: fuDate,
      note: fuNote || null,
      is_done: false,
    }).select("*").single();
    setSavingFu(false);
    if (error || !data) { toast.error(error?.message ?? "Failed"); return; }
    setFollowUps((prev) => [...prev, data as FollowUpRow].sort((a, b) => a.follow_up_date.localeCompare(b.follow_up_date)));
    setShowFollowUp(false); setFuDate(""); setFuNote("");
    toast.success(t("followup_saved"));
  };

  const markFollowUpDone = async (fu: FollowUpRow) => {
    const { error } = await supabase.from("follow_ups").update({ is_done: true }).eq("id", fu.id);
    if (error) { toast.error(error.message); return; }
    setFollowUps((prev) => prev.map((x) => x.id === fu.id ? { ...x, is_done: true } : x));
    toast.success(t("followup_done"));
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
  const currentStatus = (customer.customer_status ?? "enquiry") as CustomerStatus;
  const todayStr = new Date().toISOString().slice(0, 10);
  const openFollowUps = followUps.filter((f) => !f.is_done);

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
        <button
          onClick={cycleStatus}
          className={`mt-2 text-xs font-semibold px-3 py-1.5 rounded-full active:scale-95 transition ${CUSTOMER_STATUS_STYLES[currentStatus]}`}
        >
          {CUSTOMER_STATUS_DOT[currentStatus]} {t(`cs_${currentStatus}` as any)}
        </button>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <Stat label={t("total_orders")} value={String(customer.total_orders)} />
        <Stat label={t("total_spent")} value={`RM ${Number(customer.total_spent).toFixed(0)}`} />
        <Stat label={t("member_since")} value={memberSince} />
      </section>

      <section className="space-y-2">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
          {t("remarks")}
        </p>
        <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-3 space-y-2">
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder={t("remarks_placeholder")}
            rows={4}
            className="w-full resize-y rounded-xl bg-muted/40 border border-border/60 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
          {remarks !== (customer.remarks ?? "") && (
            <button
              onClick={saveRemarks}
              disabled={savingRemarks}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60 active:scale-[0.99]"
            >
              {savingRemarks ? t("saving") : t("save")}
            </button>
          )}
        </div>
      </section>

      {bizType === "education" && (
        <>
          <EducationDetailsForm clientId={customer.id} userId={customer.user_id} />
          <div id="pipeline" className="scroll-mt-16">
            <FollowupPipeline clientId={customer.id} userId={customer.user_id} />
          </div>
          <div id="services" className="scroll-mt-16">
            <AdditionalServices clientId={customer.id} userId={customer.user_id} />
          </div>
        </>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
            {t("followup_reminder")}
          </p>
          <button
            onClick={() => setShowFollowUp(true)}
            className="text-[11px] font-semibold text-primary flex items-center gap-1 active:scale-95"
          >
            <CalendarIcon className="h-3.5 w-3.5" /> {t("set_followup")}
          </button>
        </div>
        <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60">
          {openFollowUps.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-5">{t("no_followups")}</p>
          )}
          {openFollowUps.map((f) => {
            const overdue = f.follow_up_date < todayStr;
            return (
              <div key={f.id} className="p-3 flex items-center gap-3">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${overdue ? "bg-red-50 text-red-600" : "bg-primary/10 text-primary"}`}>
                  <CalendarIcon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${overdue ? "text-red-600" : "text-foreground"}`}>
                    {new Date(f.follow_up_date).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}
                    {overdue && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">{t("followup_overdue")}</span>}
                  </p>
                  {f.note && <p className="text-xs text-muted-foreground truncate">{f.note}</p>}
                </div>
                <button onClick={() => markFollowUpDone(f)} aria-label="done" className="p-2 rounded-full bg-emerald-50 text-emerald-600 active:scale-95">
                  <Check className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
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
                {o.delivery_address && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    📍 {t("delivery_address" as any)}: {o.delivery_address}
                  </p>
                )}
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
      {showFollowUp && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowFollowUp(false)}>
          <div className="w-full max-w-[390px] rounded-t-3xl bg-card p-5 pb-8 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{t("set_followup")}</h3>
              <button onClick={() => setShowFollowUp(false)} className="p-1.5 rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("set_followup")}</label>
              <input
                type="date" value={fuDate} min={todayStr}
                onChange={(e) => setFuDate(e.target.value)}
                className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("notes")}</label>
              <textarea
                value={fuNote} onChange={(e) => setFuNote(e.target.value)} rows={3}
                placeholder={t("followup_note_ph")}
                className="w-full resize-y rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
            <button
              onClick={saveFollowUp} disabled={savingFu || !fuDate}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold disabled:opacity-60"
            >
              {savingFu ? t("saving") : t("save")}
            </button>
          </div>
        </div>
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
        <PhoneInput label={t("phone_number")} value={phone} onChange={setPhone} />
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