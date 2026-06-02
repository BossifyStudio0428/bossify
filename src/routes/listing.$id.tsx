import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeft, ImagePlus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { propTypeKey, statusKey } from "./listings";

export const Route = createFileRoute("/listing/$id")({ component: ListingEditor });

const PROPERTY_TYPES: { value: string; labelKey: TKey }[] = [
  { value: "condo", labelKey: "pt_condo" },
  { value: "terrace", labelKey: "pt_terrace" },
  { value: "semi_d", labelKey: "pt_semi_d" },
  { value: "bungalow", labelKey: "pt_bungalow" },
  { value: "office", labelKey: "pt_office" },
  { value: "shop", labelKey: "pt_shop" },
  { value: "land", labelKey: "pt_land" },
];

const STATUSES: { value: string; labelKey: TKey }[] = [
  { value: "available", labelKey: "status_available" },
  { value: "reserved", labelKey: "status_reserved" },
  { value: "sold", labelKey: "status_sold" },
  { value: "rented", labelKey: "status_rented" },
];

type Customer = { id: string; name: string };

function ListingEditor() {
  const { id } = useParams({ from: "/listing/$id" });
  const isNew = id === "new";
  const { t } = useI18n();
  const { user } = useAuth();
  const { type: bizType, loading: bizLoading } = useBusinessType();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [title, setTitle] = useState("");
  const [propertyType, setPropertyType] = useState("condo");
  const [listingType, setListingType] = useState("sale");
  const [price, setPrice] = useState("");
  const [address, setAddress] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [size, setSize] = useState("");
  const [status, setStatus] = useState("available");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [interestedCustomerId, setInterestedCustomerId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    if (!bizLoading && bizType && bizType !== "property") {
      navigate({ to: "/", replace: true });
    }
  }, [bizLoading, bizType, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("customers")
      .select("id,name")
      .eq("user_id", user.id)
      .order("name")
      .then(({ data }) => setCustomers((data as Customer[]) ?? []));
  }, [user?.id]);

  useEffect(() => {
    if (isNew || !user) return;
    (async () => {
      const { data, error } = await supabase
        .from("property_listings" as never)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) toast.error(error.message);
      const r = data as any;
      if (r) {
        setTitle(r.title ?? "");
        setPropertyType(r.property_type ?? "condo");
        setListingType(r.listing_type ?? "sale");
        setPrice(r.price != null ? String(r.price) : "");
        setAddress(r.address ?? "");
        setBedrooms(r.bedrooms != null ? String(r.bedrooms) : "");
        setBathrooms(r.bathrooms != null ? String(r.bathrooms) : "");
        setSize(r.size_sqft != null ? String(r.size_sqft) : "");
        setStatus(r.status ?? "available");
        setDescription(r.description ?? "");
        setImages(Array.isArray(r.images) ? r.images : []);
        setInterestedCustomerId(r.interested_customer_id ?? null);
      }
      setLoading(false);
    })();
  }, [id, isNew, user?.id]);

  const pickImages = async (files: FileList | null) => {
    if (!files || !user) return;
    setUploading(true);
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) { toast.error(t("image_too_large")); continue; }
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/listings/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("product-images")
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
      if (error) { toast.error(error.message); continue; }
      const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
      uploaded.push(pub.publicUrl);
    }
    setImages((prev) => [...prev, ...uploaded]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const save = async () => {
    if (!title.trim()) { toast.error(t("required_field")); return; }
    if (!user) return;
    setSaving(true);
    const payload: any = {
      title: title.trim(),
      property_type: propertyType,
      listing_type: listingType,
      price: Math.max(0, Number(price) || 0),
      address: address.trim() || null,
      bedrooms: bedrooms ? Math.max(0, parseInt(bedrooms) || 0) : null,
      bathrooms: bathrooms ? Math.max(0, parseInt(bathrooms) || 0) : null,
      size_sqft: size ? Math.max(0, parseInt(size) || 0) : null,
      status,
      description: description.trim() || null,
      images,
      interested_customer_id: interestedCustomerId,
    };
    const { error } = isNew
      ? await supabase.from("property_listings" as never).insert({ ...payload, user_id: user.id } as never)
      : await supabase.from("property_listings" as never).update(payload as never).eq("id", id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("listing_saved"));
    navigate({ to: "/listings" });
  };

  const remove = async () => {
    if (isNew || !confirm(t("delete_listing_confirm"))) return;
    const { error } = await supabase.from("property_listings" as never).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("listing_deleted"));
    navigate({ to: "/listings" });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  const interestedName = customers.find((c) => c.id === interestedCustomerId)?.name;

  return (
    <div className="px-5 pt-10 pb-28 space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/listings" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{t(isNew ? "new_listing" : "edit_listing")}</h1>
        {!isNew && (
          <button onClick={remove} className="ml-auto p-2 rounded-full text-red-500 active:bg-red-50" aria-label={t("delete")}>
            <Trash2 className="h-5 w-5" />
          </button>
        )}
      </header>

      <Section label={t("fld_images")}>
        <div className="grid grid-cols-3 gap-2">
          {images.map((url, i) => (
            <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-muted">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground active:bg-muted"
          >
            {uploading ? (
              <div className="h-5 w-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            ) : (
              <>
                <ImagePlus className="h-5 w-5" />
                <span className="text-[10px] mt-1">+</span>
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => pickImages(e.target.files)}
          />
        </div>
      </Section>

      <TextField label={t("fld_title")} value={title} onChange={setTitle} />

      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label={t("fld_property_type")}
          value={propertyType}
          onChange={setPropertyType}
          options={PROPERTY_TYPES.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
        />
        <SelectField
          label={t("fld_listing_type")}
          value={listingType}
          onChange={setListingType}
          options={[
            { value: "sale", label: t("lt_sale") },
            { value: "rent", label: t("lt_rent") },
          ]}
        />
      </div>

      <TextField label={t("price")} value={price} onChange={setPrice} type="number" />
      <TextField label={t("fld_address")} value={address} onChange={setAddress} />

      <div className="grid grid-cols-3 gap-2">
        <TextField label={t("fld_bedrooms")} value={bedrooms} onChange={setBedrooms} type="number" />
        <TextField label={t("fld_bathrooms")} value={bathrooms} onChange={setBathrooms} type="number" />
        <TextField label={t("fld_size")} value={size} onChange={setSize} type="number" />
      </div>

      <SelectField
        label={t("fld_status")}
        value={status}
        onChange={setStatus}
        options={STATUSES.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
      />

      <TextField label={t("description_label")} value={description} onChange={setDescription} multiline />

      <Section label={t("interested_customer")}>
        <select
          value={interestedCustomerId ?? ""}
          onChange={(e) => setInterestedCustomerId(e.target.value || null)}
          className="w-full px-3 py-3 rounded-2xl bg-background border border-border text-sm outline-none focus:border-primary"
        >
          <option value="">{t("no_interested_customer")}</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {interestedCustomerId && (
          <Link
            to="/customer/$customerId"
            params={{ customerId: interestedCustomerId }}
            className="text-xs text-primary font-semibold mt-1 inline-block"
          >
            → {interestedName}
          </Link>
        )}
      </Section>

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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">{label}</p>
      {children}
    </div>
  );
}

function TextField({
  label, value, onChange, type = "text", multiline,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; multiline?: boolean }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">{label}</p>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full px-3 py-3 rounded-2xl bg-background border border-border text-sm outline-none focus:border-primary resize-none"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-3 rounded-2xl bg-background border border-border text-sm outline-none focus:border-primary"
        />
      )}
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-3 rounded-2xl bg-background border border-border text-sm outline-none focus:border-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}