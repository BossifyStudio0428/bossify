import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Pencil, Trash2, Phone, Mail, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { SheetShell, SheetField, ConfirmSheet } from "@/components/InventorySheets";
import { StockTabs } from "@/components/StockTabs";

export const Route = createFileRoute("/suppliers")({ component: SuppliersPage });

export type Supplier = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  products_supplied: string | null;
  notes: string | null;
  created_at: string;
};

type Sheet =
  | { kind: "none" }
  | { kind: "form"; item?: Supplier }
  | { kind: "delete"; item: Supplier };

function SuppliersPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { type: bizType, loading: btLoading } = useBusinessType();
  const navigate = useNavigate();
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<Sheet>({ kind: "none" });

  const allowed = bizType === "retail" || bizType === "fnb";

  useEffect(() => {
    if (!btLoading && !allowed) navigate({ to: "/inventory" });
  }, [btLoading, allowed, navigate]);

  const load = async () => {
    const { data, error } = await supabase
      .from("suppliers" as any)
      .select("*")
      .order("name", { ascending: true });
    if (error) toast.error(error.message);
    setItems(((data ?? []) as unknown) as Supplier[]);
    setLoading(false);
  };
  useEffect(() => { if (allowed) load(); }, [allowed]);

  const handleDelete = async (it: Supplier) => {
    const prev = items;
    setItems((p) => p.filter((x) => x.id !== it.id));
    const { error } = await supabase.from("suppliers" as any).delete().eq("id", it.id);
    if (error) {
      setItems(prev);
      toast.error(error.message);
    } else {
      toast.success(t("supplier_deleted"));
    }
    setSheet({ kind: "none" });
  };

  if (!allowed) return null;

  return (
    <div className="px-5 pt-10 pb-24 space-y-5 relative">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("suppliers")}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {items.length}
        </span>
      </header>

      <StockTabs active="suppliers" />

      {loading && (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        </div>
      )}
      {!loading && items.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-10 px-4">{t("no_suppliers")}</p>
      )}

      <div className="space-y-3">
        {items.map((it) => (
          <article key={it.id} className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-semibold text-foreground truncate">{it.name}</p>
                {it.products_supplied && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{it.products_supplied}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setSheet({ kind: "form", item: it })} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" aria-label={t("edit")}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setSheet({ kind: "delete", item: it })} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" aria-label={t("delete")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {it.phone && (
                <a href={`tel:${it.phone}`} className="inline-flex items-center gap-1 hover:text-primary">
                  <Phone className="h-3 w-3" />{it.phone}
                </a>
              )}
              {it.email && (
                <a href={`mailto:${it.email}`} className="inline-flex items-center gap-1 hover:text-primary">
                  <Mail className="h-3 w-3" />{it.email}
                </a>
              )}
            </div>
          </article>
        ))}
      </div>

      <button
        onClick={() => setSheet({ kind: "form" })}
        aria-label={t("add_supplier")}
        className="fixed bottom-24 z-30 h-14 w-14 rounded-full text-primary-foreground shadow-[var(--shadow-soft)] flex items-center justify-center active:scale-95 transition-transform bg-gradient-to-br from-primary to-primary/80"
        style={{ right: "max(1.5rem, calc(50vw - 180px + 1rem))" }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      {sheet.kind === "form" && (
        <SupplierFormSheet
          item={sheet.item}
          userId={user?.id ?? ""}
          onClose={() => setSheet({ kind: "none" })}
          onSaved={() => { setSheet({ kind: "none" }); load(); }}
        />
      )}
      {sheet.kind === "delete" && (
        <ConfirmSheet
          title={t("delete_supplier_confirm")}
          subtitle={sheet.item.name}
          onClose={() => setSheet({ kind: "none" })}
          onConfirm={() => handleDelete(sheet.item)}
        />
      )}
    </div>
  );
}

function SupplierFormSheet({
  item, userId, onClose, onSaved,
}: { item?: Supplier; userId: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(item?.name ?? "");
  const [phone, setPhone] = useState(item?.phone ?? "");
  const [email, setEmail] = useState(item?.email ?? "");
  const [address, setAddress] = useState(item?.address ?? "");
  const [products, setProducts] = useState(item?.products_supplied ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error(t("required_field")); return; }
    if (!userId) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      products_supplied: products.trim() || null,
      notes: notes.trim() || null,
    };
    const { error } = item
      ? await supabase.from("suppliers" as any).update(payload).eq("id", item.id)
      : await supabase.from("suppliers" as any).insert({ ...payload, user_id: userId });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("supplier_saved"));
    onSaved();
  };

  return (
    <SheetShell onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">{item ? t("edit_supplier") : t("add_supplier")}</h3>
        <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
      </div>
      <SheetField label={t("supplier_name")} value={name} onChange={setName} />
      <SheetField label={t("supplier_phone")} value={phone} onChange={setPhone} type="tel" />
      <SheetField label={t("supplier_email")} value={email} onChange={setEmail} type="email" />
      <SheetField label={t("supplier_address")} value={address} onChange={setAddress} />
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("supplier_products")}</label>
        <textarea
          value={products}
          onChange={(e) => setProducts(e.target.value)}
          rows={2}
          className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition resize-none"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">{t("supplier_notes")}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-2xl bg-muted/40 border border-border/60 px-4 py-3 text-sm text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition resize-none"
        />
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold disabled:opacity-60 active:scale-[0.99]"
      >
        {saving ? t("saving") : t("save")}
      </button>
    </SheetShell>
  );
}