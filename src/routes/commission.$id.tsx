import { useEffect, useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";

export const Route = createFileRoute("/commission/$id")({ component: CommissionEditor });

type Listing = { id: string; title: string };

function CommissionEditor() {
  const { id } = useParams({ from: "/commission/$id" });
  const isNew = id === "new";
  const { t } = useI18n();
  const { user } = useAuth();
  const { type: bizType, loading: bizLoading } = useBusinessType();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [listingId, setListingId] = useState<string | "">("");
  const [clientName, setClientName] = useState("");
  const [transactionType, setTransactionType] = useState<"sale" | "rental">("sale");
  const [price, setPrice] = useState("");
  const [rate, setRate] = useState("3");
  const [status, setStatus] = useState<"pending" | "received" | "cancelled">("pending");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);

  useEffect(() => {
    if (!bizLoading && bizType && bizType !== "property") {
      navigate({ to: "/", replace: true });
    }
  }, [bizLoading, bizType, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("property_listings" as never)
      .select("id,title")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setListings((data as Listing[]) ?? []));
  }, [user?.id]);

  useEffect(() => {
    if (isNew || !user) return;
    (async () => {
      const { data, error } = await supabase
        .from("commissions" as never)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) toast.error(error.message);
      const r = data as any;
      if (r) {
        setListingId(r.listing_id ?? "");
        setClientName(r.client_name ?? "");
        setTransactionType((r.transaction_type as any) ?? "sale");
        setPrice(r.transaction_price != null ? String(r.transaction_price) : "");
        setRate(r.commission_rate != null ? String(r.commission_rate) : "3");
        setStatus((r.status as any) ?? "pending");
        setDate((r.transaction_date as string) ?? new Date().toISOString().slice(0, 10));
        setNotes(r.notes ?? "");
      }
      setLoading(false);
    })();
  }, [id, isNew, user?.id]);

  const amount = useMemo(() => {
    const p = Number(price) || 0;
    const r = Number(rate) || 0;
    return Math.max(0, (p * r) / 100);
  }, [price, rate]);

  const save = async () => {
    if (!user) return;
    if (!clientName.trim() && !listingId) { toast.error(t("required_field")); return; }
    setSaving(true);
    const payload: any = {
      listing_id: listingId || null,
      client_name: clientName.trim(),
      transaction_type: transactionType,
      transaction_price: Math.max(0, Number(price) || 0),
      commission_rate: Math.max(0, Number(rate) || 0),
      commission_amount: amount,
      status,
      transaction_date: date,
      notes: notes.trim() || null,
    };
    const { error } = isNew
      ? await supabase.from("commissions" as never).insert({ ...payload, user_id: user.id } as never)
      : await supabase.from("commissions" as never).update(payload as never).eq("id", id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("commission_saved"));
    navigate({ to: "/commissions" });
  };

  const remove = async () => {
    if (isNew || !confirm(t("delete_commission_confirm"))) return;
    const { error } = await supabase.from("commissions" as never).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("commission_deleted"));
    navigate({ to: "/commissions" });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  const inputCls = "w-full px-3 py-3 rounded-2xl bg-background border border-border text-sm outline-none focus:border-primary";
  const labelCls = "text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1";

  return (
    <div className="px-5 pt-10 pb-28 space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/commissions" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{t(isNew ? "new_commission" : "edit_commission")}</h1>
        {!isNew && (
          <button onClick={remove} className="ml-auto p-2 rounded-full text-red-500 active:bg-red-50" aria-label={t("delete")}>
            <Trash2 className="h-5 w-5" />
          </button>
        )}
      </header>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_link_listing")}</p>
        <select value={listingId} onChange={(e) => setListingId(e.target.value)} className={inputCls}>
          <option value="">{t("comm_no_listing")}</option>
          {listings.map((l) => (<option key={l.id} value={l.id}>{l.title}</option>))}
        </select>
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_client_name")}</p>
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputCls} />
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_transaction_type")}</p>
        <div className="grid grid-cols-2 gap-2">
          {(["sale", "rental"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setTransactionType(v)}
              className={`py-2.5 rounded-xl text-xs font-semibold border ${transactionType === v ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
            >
              {t(v === "sale" ? "comm_type_sale" : "comm_type_rental")}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_transaction_price")}</p>
        <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <p className={labelCls}>{t("fld_commission_rate")}</p>
          <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <p className={labelCls}>{t("fld_commission_amount")}</p>
          <input
            value={amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            readOnly
            className={`${inputCls} bg-muted/40 font-bold text-primary`}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_status")}</p>
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} className={inputCls}>
          <option value="pending">{t("comm_status_pending")}</option>
          <option value="received">{t("comm_status_received")}</option>
          <option value="cancelled">{t("comm_status_cancelled")}</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_transaction_date")}</p>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_notes")}</p>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold disabled:opacity-60 active:scale-[0.99] transition-transform"
      >
        {saving ? t("saving") : t("save")}
      </button>
    </div>
  );
}