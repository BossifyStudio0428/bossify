import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Plus, X, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";

export const Route = createFileRoute("/services")({ component: ServicesPage });

type Service = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  duration_minutes: number | null;
  is_active: boolean;
};

type Sheet =
  | { kind: "none" }
  | { kind: "form"; item?: Service }
  | { kind: "delete"; item: Service };

function ServicesPage() {
  const { t } = useI18n();
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
      .select("id,name,description,price,duration_minutes,is_active")
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
          <p className="text-center text-sm text-muted-foreground py-10">{t(emptyKey)}</p>
        )}
        {!loading && items.map((it) => (
          <article key={it.id} className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
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

      <button
        onClick={() => setSheet({ kind: "form" })}
        aria-label={t(addKey)}
        className="fixed bottom-24 z-30 h-14 w-14 rounded-full text-primary-foreground shadow-[var(--shadow-soft)] flex items-center justify-center active:scale-95 transition-transform bg-gradient-to-br from-primary to-primary/80"
        style={{ right: "max(1.5rem, calc(50vw - 180px + 1rem))" }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

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
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error(t("required_field")); return; }
    if (!userId) return;
    setSaving(true);
    const payload: any = {
      name: name.trim(),
      description: description.trim() || null,
      price: Math.max(0, Number(price) || 0),
      duration_minutes: showDuration && duration ? Math.max(0, Number(duration) || 0) : null,
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
      <Field label={nameLabel} value={name} onChange={setName} />
      <Field label={t("description_label")} value={description} onChange={setDescription} multiline />
      <Field label={`${t("price")} (RM)`} value={price} onChange={setPrice} type="number" />
      {showDuration && (
        <Field label={`${t("duration_label")} (${t("minutes_short")})`} value={duration} onChange={setDuration} type="number" />
      )}
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