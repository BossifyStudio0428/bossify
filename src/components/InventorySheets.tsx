import { useState, useRef } from "react";
import { useEffect } from "react";
import { X, Upload, Trash2, ImageIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { CATEGORY_PRESETS } from "@/lib/businessType";
import { parseVariants, type InvRow, type Variant } from "@/lib/inventoryTypes";

export function SheetShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-[390px] max-h-[90vh] overflow-y-auto rounded-t-3xl bg-card text-foreground p-5 pb-8 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function SheetField({
  label, value, onChange, type = "text", placeholder,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
      />
    </div>
  );
}

export function QtySheet({
  title, label, current, max, onClose, onConfirm,
}: { title: string; label: string; current: number; max?: number; onClose: () => void; onConfirm: (q: number) => void }) {
  const { t } = useI18n();
  const [qty, setQty] = useState("1");
  return (
    <SheetShell onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold">{title}</h3>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <p className="text-xs text-muted-foreground">{t("current_stock")}: <span className="font-semibold text-foreground">{current}</span></p>
      <SheetField label={label} value={qty} onChange={setQty} type="number" />
      <button
        onClick={() => {
          const q = Number(qty) || 0;
          if (q < 1) { toast.error(t("required_field")); return; }
          if (max !== undefined && q > max) { toast.error(t("cant_remove_more")); return; }
          onConfirm(q);
        }}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold active:scale-[0.99]"
      >
        {t("confirm")}
      </button>
    </SheetShell>
  );
}

export function ConfirmSheet({
  title, subtitle, onClose, onConfirm, confirmLabel, variant = "destructive",
}: { title: string; subtitle?: string; onClose: () => void; onConfirm: () => void; confirmLabel?: string; variant?: "destructive" | "primary" }) {
  const { t } = useI18n();
  const btnClass = variant === "primary"
    ? "py-3 rounded-2xl bg-primary text-primary-foreground font-semibold"
    : "py-3 rounded-2xl bg-red-500 text-white font-semibold";
  return (
    <SheetShell onClose={onClose}>
      <h3 className="text-base font-bold">{title}</h3>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      <div className="grid grid-cols-2 gap-2 pt-2">
        <button onClick={onClose} className="py-3 rounded-2xl bg-muted text-foreground font-semibold">{t("cancel")}</button>
        <button onClick={onConfirm} className={btnClass}>{confirmLabel ?? t("delete")}</button>
      </div>
    </SheetShell>
  );
}

export function ProductFormSheet({
  item, onClose, onSaved, userId,
}: { item?: InvRow; onClose: () => void; onSaved: () => void; userId: string }) {
  const { t } = useI18n();
  const { type: bizType } = useBusinessType();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(item?.name ?? "");
  const [stock, setStock] = useState(item?.stock != null ? String(item.stock) : "");
  const PRESET_UNITS = [
    { value: "pcs", label: t("unit_pieces"), icon: "🔢" },
    { value: "packs", label: t("unit_packs"), icon: "📦" },
    { value: "bottles", label: t("unit_bottles"), icon: "🍶" },
    { value: "jars", label: t("unit_jars"), icon: "🧴" },
    { value: "boxes", label: t("unit_boxes"), icon: "🎁" },
  ];
  const initialUnit = item?.unit ?? "pcs";
  const isPreset = PRESET_UNITS.some((u) => u.value === initialUnit);
  const [unit, setUnit] = useState(isPreset ? initialUnit : "other");
  const [customUnit, setCustomUnit] = useState(isPreset ? "" : initialUnit);
  const [price, setPrice] = useState(item?.price ? String(item.price) : "");
  const [costPrice, setCostPrice] = useState(item?.cost_price ? String(item.cost_price) : "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [variants, setVariants] = useState<Variant[]>(parseVariants(item?.variants));
  const [imageUrl, setImageUrl] = useState<string | null>(item?.image_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supplierId, setSupplierId] = useState<string>((item as any)?.supplier_id ?? "");
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const showSuppliers = bizType === "retail" || bizType === "fnb";

  useEffect(() => {
    if (!showSuppliers) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("suppliers" as any)
        .select("id,name")
        .order("name", { ascending: true });
      if (active) setSuppliers(((data ?? []) as unknown) as Array<{ id: string; name: string }>);
    })();
    return () => { active = false; };
  }, [showSuppliers]);

  const categoryPresets = CATEGORY_PRESETS[bizType ?? "retail"];

  const onPickImage = async (file: File) => {
    if (!userId) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("image_too_large"));
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) {
      setUploading(false);
      toast.error(error.message);
      return;
    }
    const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
    setImageUrl(pub.publicUrl);
    setUploading(false);
  };

  const addVariant = () => setVariants((p) => [...p, { id: crypto.randomUUID(), name: "", price: 0 }]);
  const updateVariant = (id: string, patch: Partial<Variant>) =>
    setVariants((p) => p.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const removeVariant = (id: string) => setVariants((p) => p.filter((v) => v.id !== id));

  const save = async () => {
    if (!name.trim()) { toast.error(t("required_field")); return; }
    if (!userId) return;
    const finalUnit = unit === "other" ? customUnit.trim() || "pcs" : unit;
    const cleanVariants = variants
      .filter((v) => v.name.trim())
      .map((v) => ({ id: v.id, name: v.name.trim(), price: Math.max(0, Number(v.price) || 0) }));
    setSaving(true);
    const payload = {
      name: name.trim(),
      stock: Math.max(0, Number(stock) || 0),
      unit: finalUnit,
      max_stock: 999,
      price: Math.max(0, Number(price) || 0),
      cost_price: Math.max(0, Number(costPrice) || 0),
      category: category.trim() || null,
      description: description.trim() || null,
      variants: cleanVariants,
      image_url: imageUrl,
      ...(showSuppliers ? { supplier_id: supplierId || null } : {}),
    };
    const { error } = item
      ? await supabase.from("inventory").update(payload).eq("id", item.id)
      : await supabase.from("inventory").insert({ ...payload, user_id: userId });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(item ? t("customer_updated") : t("product_added"));
    onSaved();
  };

  return (
    <SheetShell onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">{item ? t("edit") : t("new_product")}</h3>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
      </div>

      {/* Image */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("image")}</label>
        <div className="flex items-center gap-3">
          <div className="h-20 w-20 rounded-2xl bg-muted/50 border border-border/60 overflow-hidden flex items-center justify-center">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-semibold disabled:opacity-60"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? t("uploading") : imageUrl ? t("change_image") : t("upload_image")}
            </button>
            {imageUrl && (
              <button
                type="button"
                onClick={() => setImageUrl(null)}
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-muted text-muted-foreground text-xs font-semibold"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("remove_image")}
              </button>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickImage(f);
            e.target.value = "";
          }}
        />
      </div>

      <SheetField label={t("product_name")} value={name} onChange={setName} placeholder={t("product_name_ph")} />

      {/* Category */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("category")}</label>
        <div className="flex flex-wrap gap-1.5">
          {categoryPresets.map((c) => {
            const selected = category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(selected ? "" : c)}
                className={`px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition active:scale-95 ${
                  selected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 text-foreground border-border/60 hover:bg-muted"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder={t("custom_category")}
          className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
        />
      </div>

      <SheetField label={t("how_many_now")} value={stock} onChange={setStock} type="number" placeholder={t("stock_now_ph")} />

      <div className="space-y-2">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("measure_in")}</label>
        <div className="flex flex-wrap gap-2">
          {PRESET_UNITS.map((u) => {
            const selected = unit === u.value;
            return (
              <button
                key={u.value}
                type="button"
                onClick={() => setUnit(u.value)}
                className={`px-3 py-2 rounded-full text-xs font-semibold border transition active:scale-95 ${
                  selected
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/40 text-foreground border-border/60 hover:bg-muted"
                }`}
              >
                <span className="mr-1">{u.icon}</span>{u.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setUnit("other")}
            className={`px-3 py-2 rounded-full text-xs font-semibold border transition active:scale-95 ${
              unit === "other"
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-muted/40 text-foreground border-border/60 hover:bg-muted"
            }`}
          >
            <span className="mr-1">✏️</span>{t("unit_others")}
          </button>
        </div>
        {unit === "other" && (
          <input
            value={customUnit}
            onChange={(e) => setCustomUnit(e.target.value)}
            placeholder={t("custom_unit_ph")}
            className="mt-2 w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
          />
        )}
      </div>

      <SheetField label={t("selling_price")} value={price} onChange={setPrice} type="number" placeholder={t("price_ph")} />
      <SheetField label={t("cost_price")} value={costPrice} onChange={setCostPrice} type="number" placeholder={t("cost_price_placeholder")} />

      {showSuppliers && (
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("supplier")}</label>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
          >
            <option value="">{t("no_supplier")}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Description */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("description")}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("description_ph")}
          rows={3}
          className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition resize-none"
        />
      </div>

      {/* Variants */}
      <div className="space-y-2">
        <div>
          <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("variants")}</label>
          <p className="text-[11px] text-muted-foreground px-1 mt-0.5">{t("variants_subtitle")}</p>
        </div>
        {variants.length === 0 && (
          <p className="text-xs text-muted-foreground italic px-1">{t("no_variants")}</p>
        )}
        {variants.map((v) => (
          <div key={v.id} className="flex gap-2 items-center">
            <input
              value={v.name}
              onChange={(e) => updateVariant(v.id, { name: e.target.value })}
              placeholder={t("variant_name")}
              className="flex-1 rounded-xl bg-muted/40 border border-border/60 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              type="number"
              value={v.price || ""}
              onChange={(e) => updateVariant(v.id, { price: Number(e.target.value) || 0 })}
              placeholder={t("variant_price")}
              className="w-24 rounded-xl bg-muted/40 border border-border/60 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => removeVariant(v.id)}
              className="p-2 rounded-xl text-red-500 hover:bg-red-50"
              aria-label="remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addVariant}
          className="w-full py-2 rounded-xl border border-dashed border-border/80 text-xs font-semibold text-primary hover:bg-primary/5 transition"
        >
          <Plus className="inline h-3.5 w-3.5 mr-1" />
          {t("add_variant")}
        </button>
      </div>

      <button
        onClick={save} disabled={saving || uploading}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold disabled:opacity-60 active:scale-[0.99] transition-transform"
      >
        {saving ? t("saving") : t("save")}
      </button>
    </SheetShell>
  );
}