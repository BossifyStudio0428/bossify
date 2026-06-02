import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";

export const Route = createFileRoute("/viewing/$id")({ component: ViewingEditor });

type Listing = { id: string; title: string };
type Customer = { id: string; name: string };
type Status = "scheduled" | "completed" | "cancelled";
type Interest = "high" | "medium" | "low";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function defaultLocalInput(): string {
  return toLocalInput(new Date().toISOString());
}

function ViewingEditor() {
  const { id } = useParams({ from: "/viewing/$id" });
  const isNew = id === "new";
  const { t } = useI18n();
  const { user } = useAuth();
  const { type: bizType, loading: bizLoading } = useBusinessType();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [listingId, setListingId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [viewingAt, setViewingAt] = useState<string>(defaultLocalInput());
  const [status, setStatus] = useState<Status>("scheduled");
  const [interest, setInterest] = useState<Interest | "">("");
  const [feedback, setFeedback] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

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
    supabase
      .from("customers")
      .select("id,name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setCustomers((data as Customer[]) ?? []));
  }, [user?.id]);

  useEffect(() => {
    if (isNew || !user) return;
    (async () => {
      const { data, error } = await supabase
        .from("property_viewings" as never)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) toast.error(error.message);
      const r = data as any;
      if (r) {
        setListingId(r.listing_id ?? "");
        setCustomerId(r.customer_id ?? "");
        setViewingAt(r.viewing_at ? toLocalInput(r.viewing_at) : defaultLocalInput());
        setStatus((r.status as Status) ?? "scheduled");
        setInterest((r.interest_level as Interest) ?? "");
        setFeedback(r.feedback ?? "");
      }
      setLoading(false);
    })();
  }, [id, isNew, user?.id]);

  const persist = async (overrides?: Partial<{ status: Status; interest_level: Interest | null; feedback: string }>) => {
    if (!user) return null;
    if (!listingId) { toast.error(t("fld_select_listing")); return null; }
    setSaving(true);
    const payload: any = {
      listing_id: listingId,
      customer_id: customerId || null,
      viewing_at: new Date(viewingAt).toISOString(),
      status: overrides?.status ?? status,
      interest_level: overrides?.interest_level !== undefined ? overrides.interest_level : (interest || null),
      feedback: (overrides?.feedback ?? feedback).trim() || null,
    };
    const res = isNew
      ? await supabase.from("property_viewings" as never).insert({ ...payload, user_id: user.id } as never).select("id").maybeSingle()
      : await supabase.from("property_viewings" as never).update(payload as never).eq("id", id).select("id").maybeSingle();
    setSaving(false);
    if (res.error) { toast.error(res.error.message); return null; }
    return res.data as { id: string } | null;
  };

  const save = async () => {
    const r = await persist();
    if (!r) return;
    toast.success(t("viewing_saved"));
    navigate({ to: "/viewings" });
  };

  const remove = async () => {
    if (isNew || !confirm(t("delete_viewing_confirm"))) return;
    const { error } = await supabase.from("property_viewings" as never).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("viewing_deleted"));
    navigate({ to: "/viewings" });
  };

  const markCompleted = () => setStatus("completed");

  const createFollowUp = async () => {
    if (!user || !customerId) { toast.error(t("fld_select_client")); return; }
    const d = new Date(viewingAt); d.setDate(d.getDate() + 3);
    const dateStr = d.toISOString().slice(0, 10);
    const { error } = await supabase.from("follow_ups").insert({
      user_id: user.id,
      customer_id: customerId,
      follow_up_date: dateStr,
      note: feedback?.trim() || null,
      is_done: false,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(t("schedule_followup"));
  };

  const goCreateCommission = async () => {
    // Persist current state first if new
    if (isNew) {
      const r = await persist();
      if (!r) return;
    }
    navigate({ to: "/commission/$id", params: { id: "new" } });
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

  const showCommissionSuggestion = status === "completed" && interest === "high";

  return (
    <div className="px-5 pt-10 pb-28 space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/viewings" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{t(isNew ? "new_viewing" : "edit_viewing")}</h1>
        {!isNew && (
          <button onClick={remove} className="ml-auto p-2 rounded-full text-red-500 active:bg-red-50" aria-label={t("delete")}>
            <Trash2 className="h-5 w-5" />
          </button>
        )}
      </header>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_select_listing")}</p>
        <select value={listingId} onChange={(e) => setListingId(e.target.value)} className={inputCls}>
          <option value="">—</option>
          {listings.map((l) => (<option key={l.id} value={l.id}>{l.title}</option>))}
        </select>
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_select_client")}</p>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputCls}>
          <option value="">—</option>
          {customers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_viewing_at")}</p>
        <input type="datetime-local" value={viewingAt} onChange={(e) => setViewingAt(e.target.value)} className={inputCls} />
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_status")}</p>
        <div className="grid grid-cols-3 gap-2">
          {(["scheduled", "completed", "cancelled"] as Status[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setStatus(v)}
              className={`py-2.5 rounded-xl text-xs font-semibold border ${status === v ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
            >
              {t(v === "completed" ? "vw_status_completed" : v === "cancelled" ? "vw_status_cancelled" : "vw_status_scheduled")}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_interest_level")}</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            { v: "high" as const, emoji: "🔥", key: "vw_interest_high" as const },
            { v: "medium" as const, emoji: "😐", key: "vw_interest_medium" as const },
            { v: "low" as const, emoji: "👎", key: "vw_interest_low" as const },
          ]).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setInterest(interest === o.v ? "" : o.v)}
              className={`py-2.5 rounded-xl text-xs font-semibold border ${interest === o.v ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
            >
              {o.emoji} {t(o.key)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_feedback")}</p>
        <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
      </div>

      {status !== "completed" && (
        <button
          onClick={markCompleted}
          className="w-full py-2.5 rounded-2xl bg-emerald-100 text-emerald-700 font-semibold active:scale-[0.99] transition-transform"
        >
          ✓ {t("mark_completed")}
        </button>
      )}

      {!isNew && customerId && (
        <button
          onClick={createFollowUp}
          className="w-full py-2.5 rounded-2xl bg-card border border-border font-semibold active:scale-[0.99] transition-transform"
        >
          📅 {t("schedule_followup")}
        </button>
      )}

      {showCommissionSuggestion && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 space-y-2">
          <p className="text-sm font-semibold text-amber-800">🔥 {t("suggest_create_commission")}</p>
          <button
            onClick={goCreateCommission}
            className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-semibold active:scale-[0.99] transition-transform"
          >
            {t("create_commission_btn")}
          </button>
        </div>
      )}

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