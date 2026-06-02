import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";

export const Route = createFileRoute("/requirement/$id")({ component: RequirementEditor });

type Customer = { id: string; name: string };
type Status = "searching" | "found" | "closed";
type ListingType = "buy" | "rent";
type PropertyType = "condo" | "terrace" | "semi_d" | "bungalow" | "office" | "shop" | "land";

function RequirementEditor() {
  const { id } = useParams({ from: "/requirement/$id" });
  const isNew = id === "new";
  const { t } = useI18n();
  const { user } = useAuth();
  const { type: bizType, loading: bizLoading } = useBusinessType();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("condo");
  const [listingType, setListingType] = useState<ListingType>("buy");
  const [budgetMin, setBudgetMin] = useState("0");
  const [budgetMax, setBudgetMax] = useState("0");
  const [location, setLocation] = useState("");
  const [minBed, setMinBed] = useState("0");
  const [minBath, setMinBath] = useState("0");
  const [minSize, setMinSize] = useState("0");
  const [other, setOther] = useState("");
  const [status, setStatus] = useState<Status>("searching");

  useEffect(() => {
    if (!bizLoading && bizType && bizType !== "property") {
      navigate({ to: "/", replace: true });
    }
  }, [bizLoading, bizType, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase.from("customers").select("id,name").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setCustomers((data as Customer[]) ?? []));
  }, [user?.id]);

  useEffect(() => {
    if (isNew || !user) return;
    (async () => {
      const { data, error } = await supabase
        .from("property_client_requirements" as never)
        .select("*").eq("id", id).maybeSingle();
      if (error) toast.error(error.message);
      const r = data as any;
      if (r) {
        setCustomerId(r.customer_id ?? "");
        setPropertyType(r.property_type ?? "condo");
        setListingType(r.listing_type ?? "buy");
        setBudgetMin(String(r.budget_min ?? 0));
        setBudgetMax(String(r.budget_max ?? 0));
        setLocation(r.preferred_location ?? "");
        setMinBed(String(r.min_bedrooms ?? 0));
        setMinBath(String(r.min_bathrooms ?? 0));
        setMinSize(String(r.min_size_sqft ?? 0));
        setOther(r.other_requirements ?? "");
        setStatus(r.status ?? "searching");
      }
      setLoading(false);
    })();
  }, [id, isNew, user?.id]);

  // When creating a new requirement from a customer profile, prefill the
  // selected client via ?customerId=... so the user doesn't re-pick it.
  useEffect(() => {
    if (!isNew || typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const cid = sp.get("customerId");
    if (cid) setCustomerId(cid);
  }, [isNew]);

  const returnTo = (): { to: string } | null => {
    if (typeof window === "undefined") return null;
    const sp = new URLSearchParams(window.location.search);
    const r = sp.get("returnTo");
    return r ? { to: r } : null;
  };

  const save = async () => {
    if (!user) return;
    if (!customerId) { toast.error(t("fld_select_client")); return; }
    setSaving(true);
    const payload: any = {
      customer_id: customerId,
      property_type: propertyType,
      listing_type: listingType,
      budget_min: Number(budgetMin) || 0,
      budget_max: Number(budgetMax) || 0,
      preferred_location: location.trim() || null,
      min_bedrooms: Number(minBed) || 0,
      min_bathrooms: Number(minBath) || 0,
      min_size_sqft: Number(minSize) || 0,
      other_requirements: other.trim() || null,
      status,
    };
    const res = isNew
      ? await supabase.from("property_client_requirements" as never).insert({ ...payload, user_id: user.id } as never)
      : await supabase.from("property_client_requirements" as never).update(payload as never).eq("id", id);
    setSaving(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(t("requirement_saved"));
    const back = returnTo();
    if (back) navigate({ to: back.to as any, replace: true });
    else navigate({ to: "/requirements" });
  };

  const remove = async () => {
    if (isNew || !confirm(t("delete_requirement_confirm"))) return;
    const { error } = await supabase.from("property_client_requirements" as never).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("requirement_deleted"));
    const back = returnTo();
    if (back) navigate({ to: back.to as any, replace: true });
    else navigate({ to: "/requirements" });
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

  const propTypes: PropertyType[] = ["condo", "terrace", "semi_d", "bungalow", "office", "shop", "land"];

  return (
    <div className="px-5 pt-10 pb-28 space-y-4">
      <header className="flex items-center gap-2">
        <button
          onClick={() => {
            const back = returnTo();
            if (back) navigate({ to: back.to as any });
            else navigate({ to: "/requirements" });
          }}
          className="-ml-2 p-2 rounded-full active:bg-muted"
          aria-label="back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold tracking-tight">{t(isNew ? "new_requirement" : "edit_requirement")}</h1>
        {!isNew && (
          <button onClick={remove} className="ml-auto p-2 rounded-full text-red-500 active:bg-red-50" aria-label={t("delete")}>
            <Trash2 className="h-5 w-5" />
          </button>
        )}
      </header>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_select_client")}</p>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputCls}>
          <option value="">—</option>
          {customers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_property_type")}</p>
        <select value={propertyType} onChange={(e) => setPropertyType(e.target.value as PropertyType)} className={inputCls}>
          {propTypes.map((p) => (<option key={p} value={p}>{p}</option>))}
        </select>
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_listing_type")}</p>
        <div className="grid grid-cols-2 gap-2">
          {(["buy", "rent"] as ListingType[]).map((v) => (
            <button key={v} type="button" onClick={() => setListingType(v)}
              className={`py-2.5 rounded-xl text-xs font-semibold border ${listingType === v ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
              {t(v === "rent" ? "lt_rent" : "lt_buy")}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <p className={labelCls}>{t("fld_budget_min")}</p>
          <input type="number" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <p className={labelCls}>{t("fld_budget_max")}</p>
          <input type="number" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_preferred_location")}</p>
        <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <p className={labelCls}>{t("fld_min_bedrooms")}</p>
          <input type="number" min={0} value={minBed} onChange={(e) => setMinBed(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <p className={labelCls}>{t("fld_min_bathrooms")}</p>
          <input type="number" min={0} value={minBath} onChange={(e) => setMinBath(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <p className={labelCls}>{t("fld_min_size")}</p>
          <input type="number" min={0} value={minSize} onChange={(e) => setMinSize(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_other_requirements")}</p>
        <textarea value={other} onChange={(e) => setOther(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_status")}</p>
        <div className="grid grid-cols-3 gap-2">
          {(["searching", "found", "closed"] as Status[]).map((v) => (
            <button key={v} type="button" onClick={() => setStatus(v)}
              className={`py-2.5 rounded-xl text-xs font-semibold border ${status === v ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
              {t(v === "found" ? "cr_status_found" : v === "closed" ? "cr_status_closed" : "cr_status_searching")}
            </button>
          ))}
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold disabled:opacity-60 active:scale-[0.99] transition-transform">
        {saving ? t("saving") : t("save")}
      </button>
    </div>
  );
}