import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Plus, X, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import type { BizType } from "@/lib/businessType";
import type { Lang } from "@/contexts/I18nContext";
import { ImagesUploader } from "@/components/ImagesUploader";
import { parseVariants, type Variant } from "@/lib/inventoryTypes";

export const Route = createFileRoute("/services")({ component: ServicesPage });

type Service = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number | null;
  is_active: boolean;
  image_url: string | null;
  images?: string[] | null;
  stock?: number | null;
  variants?: unknown;
};

type Sheet =
  | { kind: "none" }
  | { kind: "form"; item?: Service }
  | { kind: "delete"; item: Service };

function ServicesPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { type: bizType } = useBusinessType();
  const isPackages = bizType === "property";
  const showDuration = bizType === "beauty";

  const [items, setItems] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<Sheet>({ kind: "none" });

  const titleKey = isPackages ? "packages_title" : "services_title";
  const addKey = isPackages ? "add_package" : "add_service";
  const emptyKey = isPackages ? "no_packages_yet" : "no_services_yet";
  const deleteConfirmKey = isPackages ? "delete_package_confirm" : "delete_service_confirm";

  const load = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("services")
      .select("id,name,description,price,duration_minutes,is_active,image_url,images,stock,variants")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data ?? []) as Service[]);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const handleDelete = async (it: Service) => {
    const prev = items;
    setItems((p) => p.filter((x) => x.id !== it.id));
    const { error } = await supabase.from("services").delete().eq("id", it.id);
    if (error) {
      setItems(prev);
      toast.error(error.message);
    } else {
      toast.success(t(isPackages ? "package_deleted" : "service_deleted"));
    }
    setSheet({ kind: "none" });
  };

  return (
    <div className="px-5 pt-10 pb-24 space-y-5">
      <header className="flex items-center gap-2">
        <Link to="/profile" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t(titleKey)}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary ml-auto">
          {items.length}
        </span>
      </header>

      <div className="space-y-3">
        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}
        {!loading && items.length === 0 && (
          <EmptyState bizType={bizType} lang={lang} onAdd={() => setSheet({ kind: "form" })} addLabel={t(addKey)} />
        )}
        {!loading && items.map((it) => (
          <article key={it.id} className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              {it.image_url && (
                <div className="h-14 w-14 rounded-xl overflow-hidden bg-muted/50 border border-border/60 shrink-0">
                  <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{it.name}</p>
                {it.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{it.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setSheet({ kind: "form", item: it })} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" aria-label={t("edit")}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setSheet({ kind: "delete", item: it })} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" aria-label={t("delete")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              {showDuration && it.duration_minutes ? (
                <span className="text-xs text-muted-foreground">⏱ {it.duration_minutes} {t("minutes_short")}</span>
              ) : <span />}
              <span className="text-sm font-bold text-primary">RM {Number(it.price).toFixed(2)}</span>
            </div>
          </article>
        ))}
      </div>

      {!loading && items.length > 0 && (
        <button
          onClick={() => setSheet({ kind: "form" })}
          aria-label={t(addKey)}
          className="fixed bottom-24 z-30 h-14 w-14 rounded-full text-primary-foreground shadow-[var(--shadow-soft)] flex items-center justify-center active:scale-95 transition-transform bg-gradient-to-br from-primary to-primary/80"
          style={{ right: "max(1.5rem, calc(50vw - 180px + 1rem))" }}
        >
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </button>
      )}

      {sheet.kind === "form" && (
        <ServiceFormSheet
          item={sheet.item}
          isPackages={isPackages}
          showDuration={showDuration}
          userId={user?.id ?? ""}
          onClose={() => setSheet({ kind: "none" })}
          onSaved={() => { setSheet({ kind: "none" }); load(); }}
        />
      )}
      {sheet.kind === "delete" && (
        <ConfirmSheet
          title={t(deleteConfirmKey)}
          subtitle={sheet.item.name}
          onClose={() => setSheet({ kind: "none" })}
          onConfirm={() => handleDelete(sheet.item)}
        />
      )}
    </div>
  );
}

function ServiceFormSheet({
  item, isPackages, showDuration, userId, onClose, onSaved,
}: {
  item?: Service;
  isPackages: boolean;
  showDuration: boolean;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [price, setPrice] = useState(item?.price != null ? String(item.price) : "");
  const [duration, setDuration] = useState(item?.duration_minutes != null ? String(item.duration_minutes) : "");
  const initialImages = (() => {
    const arr = Array.isArray(item?.images) ? (item!.images as string[]).map(String) : [];
    if (arr.length > 0) return arr;
    return item?.image_url ? [item.image_url] : [];
  })();
  const [images, setImages] = useState<string[]>(initialImages);
  const [stock, setStock] = useState(item?.stock != null ? String(item.stock) : "");
  const [variants, setVariants] = useState<Variant[]>(parseVariants(item?.variants));
  const [saving, setSaving] = useState(false);

  const addVariant = () => setVariants((p) => [...p, { id: crypto.randomUUID(), name: "", price: 0 }]);
  const updateVariant = (id: string, patch: Partial<Variant>) =>
    setVariants((p) => p.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const removeVariant = (id: string) => setVariants((p) => p.filter((v) => v.id !== id));

  const save = async () => {
    if (!name.trim()) { toast.error(t("required_field")); return; }
    if (!userId) return;
    const cleanVariants = variants
      .filter((v) => v.name.trim())
      .map((v) => ({ id: v.id, name: v.name.trim(), price: Math.max(0, Number(v.price) || 0) }));
    setSaving(true);
    const payload: any = {
      name: name.trim(),
      description: description.trim() || null,
      price: Math.max(0, Number(price) || 0),
      duration_minutes: showDuration && duration ? Math.max(0, Number(duration) || 0) : null,
      image_url: images[0] ?? null,
      images,
      stock: stock.trim() === "" ? null : Math.max(0, Number(stock) || 0),
      variants: cleanVariants,
    };
    const { error } = item
      ? await supabase.from("services").update(payload).eq("id", item.id)
      : await supabase.from("services").insert({ ...payload, user_id: userId });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onSaved();
  };

  const nameLabel = isPackages ? t("package_name") : t("service_name");
  const titleNew = isPackages ? t("new_package") : t("new_service");
  const titleEdit = isPackages ? t("edit_package") : t("edit_service");

  return (
    <SheetShell onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">{item ? titleEdit : titleNew}</h3>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
      </div>
      <ImagesUploader images={images} onChange={setImages} userId={userId} max={6} />
      <Field label={nameLabel} value={name} onChange={setName} />
      <Field label={t("description_label")} value={description} onChange={setDescription} multiline />
      <Field label={`${t("price")} (RM)`} value={price} onChange={setPrice} type="number" />
      {showDuration && (
        <Field label={`${t("duration_label")} (${t("minutes_short")})`} value={duration} onChange={setDuration} type="number" />
      )}
      <Field label={t("how_many_now")} value={stock} onChange={setStock} type="number" />

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
        onClick={save} disabled={saving}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold disabled:opacity-60 active:scale-[0.99] transition-transform"
      >
        {saving ? t("saving") : t("save")}
      </button>
    </SheetShell>
  );
}

function ConfirmSheet({ title, subtitle, onClose, onConfirm }: { title: string; subtitle?: string; onClose: () => void; onConfirm: () => void }) {
  const { t } = useI18n();
  return (
    <SheetShell onClose={onClose}>
      <h3 className="text-base font-bold">{title}</h3>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      <div className="grid grid-cols-2 gap-2 pt-2">
        <button onClick={onClose} className="py-3 rounded-2xl bg-muted text-foreground font-semibold">{t("cancel")}</button>
        <button onClick={onConfirm} className="py-3 rounded-2xl bg-red-500 text-white font-semibold">{t("delete")}</button>
      </div>
    </SheetShell>
  );
}

function SheetShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-[390px] rounded-t-3xl bg-card text-foreground p-5 pb-8 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", multiline,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; multiline?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition resize-none"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
        />
      )}
    </div>
  );
}

type EmptyContent = {
  icon: string;
  title: Record<Lang, string>;
  desc: Record<Lang, string>;
  examples: string[];
};

const EMPTY_CONTENT: Partial<Record<BizType, EmptyContent>> = {
  education: {
    icon: "🎓",
    title: {
      en: "Add Your Services",
      ms: "Tambah Perkhidmatan Anda",
      zh: "添加您的服务",
    },
    desc: {
      en: "Add services you offer like 'University Application', 'Consultation Session', etc. These will appear when creating a new case.",
      ms: "Tambah perkhidmatan yang anda tawarkan seperti 'Permohonan Universiti', 'Sesi Perundingan' dan sebagainya. Perkhidmatan ini akan muncul semasa anda membuat kes baru.",
      zh: "添加您提供的服务，例如'大学申请'、'咨询课程'等。创建新案例时可以直接选择。",
    },
    examples: [
      "University Application — RM 500",
      "Consultation Session — RM 100",
      "Document Preparation — RM 200",
    ],
  },
  beauty: {
    icon: "💄",
    title: {
      en: "Add Your Services",
      ms: "Tambah Perkhidmatan Anda",
      zh: "添加您的服务",
    },
    desc: {
      en: "Add beauty services like 'Facial', 'Manicure', etc. These will appear when creating a new appointment.",
      ms: "Tambah perkhidmatan kecantikan anda seperti 'Facial', 'Manicure' dan sebagainya. Perkhidmatan ini akan muncul semasa anda membuat temujanji baru.",
      zh: "添加您的美容服务，例如'面部护理'、'美甲'等。创建新预约时可以直接选择。",
    },
    examples: [
      "Facial — 60 mins — RM 150",
      "Manicure — 45 mins — RM 80",
      "Hair Treatment — 90 mins — RM 200",
    ],
  },
  property: {
    icon: "🏠",
    title: {
      en: "Add Your Packages",
      ms: "Tambah Pakej Anda",
      zh: "添加您的配套",
    },
    desc: {
      en: "Add packages or products you offer. These will appear when creating a new lead.",
      ms: "Tambah pakej atau produk yang anda tawarkan. Ini akan muncul semasa anda membuat prospek baru.",
      zh: "添加您提供的配套或产品。创建新潜在客户时可以直接选择。",
    },
    examples: [
      "Basic Coverage — RM 200/year",
      "Premium Package — RM 500/year",
      "Property Consultation — RM 300",
    ],
  },
  freelance: {
    icon: "💼",
    title: {
      en: "Add Your Services",
      ms: "Tambah Perkhidmatan Anda",
      zh: "添加您的服务",
    },
    desc: {
      en: "Add freelance services like 'Logo Design', 'Website Development', etc. These will appear when creating a new project.",
      ms: "Tambah perkhidmatan freelance anda seperti 'Rekabentuk Logo', 'Pembangunan Laman Web' dan sebagainya. Ini akan muncul semasa anda membuat projek baru.",
      zh: "添加您的自由职业服务，例如'Logo设计'、'网站开发'等。创建新项目时可以直接选择。",
    },
    examples: [
      "Logo Design — RM 300",
      "Website Development — RM 2,000",
      "Social Media Management — RM 500/month",
    ],
  },
};

function EmptyState({
  bizType, lang, onAdd, addLabel,
}: { bizType: BizType | null | undefined; lang: Lang; onAdd: () => void; addLabel: string }) {
  const content = EMPTY_CONTENT[(bizType ?? "freelance") as BizType] ?? EMPTY_CONTENT.freelance!;
  return (
    <div className="flex flex-col items-center text-center py-8 px-2 space-y-4">
      <div className="text-[60px] leading-none">{content.icon}</div>
      <h2 className="text-[18px] font-bold text-foreground">{content.title[lang]}</h2>
      <p className="text-sm text-muted-foreground max-w-[320px]">{content.desc[lang]}</p>
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        {content.examples.map((ex) => (
          <span
            key={ex}
            className="text-xs px-3 py-1.5 rounded-full bg-muted text-muted-foreground border border-border/60"
          >
            {ex}
          </span>
        ))}
      </div>
      <button
        onClick={onAdd}
        className="mt-2 inline-flex items-center gap-1.5 px-5 py-3 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold shadow-[var(--shadow-soft)] active:scale-[0.99] transition-transform"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} /> {addLabel}
      </button>
    </div>
  );
}