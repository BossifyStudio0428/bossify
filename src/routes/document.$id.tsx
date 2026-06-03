import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeft, Plus, Trash2, X, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { exportDocumentChecklistPDF } from "@/lib/propertyPdf";

export const Route = createFileRoute("/document/$id")({ component: DocumentEditor });

type Customer = { id: string; name: string };
type Listing = { id: string; title: string };
type DocStatus = "pending" | "received" | "verified";
type DocItem = { name: string; status: DocStatus };

const DEFAULT_DOC_KEYS: TKey[] = [
  "doc_ic_copy",
  "doc_income_statement",
  "doc_bank_3m",
  "doc_epf",
  "doc_spa",
  "doc_loan_agreement",
  "doc_title_deed",
];

function statusKey(s: DocStatus): TKey {
  if (s === "received") return "doc_status_received";
  if (s === "verified") return "doc_status_verified";
  return "doc_status_pending";
}

function DocumentEditor() {
  const { id } = useParams({ from: "/document/$id" });
  const isNew = id === "new";
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { type: bizType, loading: bizLoading } = useBusinessType();
  const { hasFullAccess, showUpgrade } = useSubscription();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);

  const [customerId, setCustomerId] = useState("");
  const [listingId, setListingId] = useState("");
  const [title, setTitle] = useState("Document Checklist");
  const [items, setItems] = useState<DocItem[]>([]);
  const [newDoc, setNewDoc] = useState("");

  useEffect(() => {
    if (!bizLoading && bizType && bizType !== "property") {
      navigate({ to: "/", replace: true });
    }
  }, [bizLoading, bizType, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase.from("customers").select("id,name").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setCustomers((data as Customer[]) ?? []));
    supabase.from("listings").select("id,title").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setListings(((data as any[]) ?? []) as Listing[]));
  }, [user?.id]);

  useEffect(() => {
    if (isNew) {
      setItems(DEFAULT_DOC_KEYS.map((k) => ({ name: t(k), status: "pending" as DocStatus })));
      return;
    }
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("property_document_checklists" as never)
        .select("*").eq("id", id).maybeSingle();
      if (error) toast.error(error.message);
      const r = data as any;
      if (r) {
        setCustomerId(r.customer_id ?? "");
        setListingId(r.listing_id ?? "");
        setTitle(r.title ?? "Document Checklist");
        setItems(Array.isArray(r.items) ? r.items : []);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line
  }, [id, isNew, user?.id]);

  const updateItem = (i: number, patch: Partial<DocItem>) => {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };
  const removeItem = (i: number) => setItems((arr) => arr.filter((_, idx) => idx !== i));
  const addItem = () => {
    const name = newDoc.trim();
    if (!name) return;
    setItems((arr) => [...arr, { name, status: "pending" }]);
    setNewDoc("");
  };

  const save = async () => {
    if (!user) return;
    if (!customerId) { toast.error(t("fld_select_client")); return; }
    setSaving(true);
    const payload: any = {
      customer_id: customerId,
      listing_id: listingId || null,
      title: title.trim() || "Document Checklist",
      items,
    };
    const res = isNew
      ? await supabase.from("property_document_checklists" as never).insert({ ...payload, user_id: user.id } as never)
      : await supabase.from("property_document_checklists" as never).update(payload as never).eq("id", id);
    setSaving(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(t("checklist_saved"));
    navigate({ to: "/documents" });
  };

  const remove = async () => {
    if (isNew || !confirm(t("delete_checklist_confirm"))) return;
    const { error } = await supabase.from("property_document_checklists" as never).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("checklist_deleted"));
    navigate({ to: "/documents" });
  };

  const onExport = async () => {
    if (!hasFullAccess) { showUpgrade(t("pro_feature_required")); return; }
    if (!user) return;
    try {
      const { data: prof } = await supabase.from("profiles").select("business_name").eq("id", user.id).maybeSingle();
      const clientName = customers.find((c) => c.id === customerId)?.name || "—";
      const propTitle = listings.find((l) => l.id === listingId)?.title || null;
      await exportDocumentChecklistPDF({
        lang,
        businessName: (prof as any)?.business_name || "Bossify",
        clientName,
        propertyTitle: propTitle,
        items: items.map((it) => ({ name: it.name, status: t(statusKey(it.status)) })),
      });
    } catch (e: any) { toast.error(e?.message || "Failed to export"); }
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

  const cycleStatus = (s: DocStatus): DocStatus =>
    s === "pending" ? "received" : s === "received" ? "verified" : "pending";

  const statusCls = (s: DocStatus) =>
    s === "verified" ? "bg-emerald-100 text-emerald-700"
      : s === "received" ? "bg-amber-100 text-amber-700"
      : "bg-muted text-foreground";

  return (
    <div className="px-5 pt-10 pb-28 space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/documents" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{t(isNew ? "new_checklist" : "edit_checklist")}</h1>
        {!isNew && (
          <div className="ml-auto flex items-center gap-1">
            <button onClick={onExport} className="p-2 rounded-full text-primary active:bg-primary/10" aria-label={t("export_pdf")}>
              <Download className="h-5 w-5" />
            </button>
            <button onClick={remove} className="p-2 rounded-full text-red-500 active:bg-red-50" aria-label={t("delete")}>
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        )}
      </header>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_checklist_title")}</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_select_client")}</p>
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputCls}>
          <option value="">—</option>
          {customers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
      </div>

      <div className="space-y-1.5">
        <p className={labelCls}>{t("fld_select_listing_optional")}</p>
        <select value={listingId} onChange={(e) => setListingId(e.target.value)} className={inputCls}>
          <option value="">—</option>
          {listings.map((l) => (<option key={l.id} value={l.id}>{l.title}</option>))}
        </select>
      </div>

      <div className="space-y-2">
        <p className={labelCls}>{t("documents_title")}</p>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 rounded-2xl bg-card border border-border/60 p-3">
              <input
                value={it.name}
                onChange={(e) => updateItem(i, { name: e.target.value })}
                className="flex-1 bg-transparent text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => updateItem(i, { status: cycleStatus(it.status) })}
                className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${statusCls(it.status)}`}
              >
                {t(statusKey(it.status))}
              </button>
              <button type="button" onClick={() => removeItem(i)} className="p-1 text-muted-foreground active:bg-muted rounded-full" aria-label={t("delete")}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            value={newDoc}
            onChange={(e) => setNewDoc(e.target.value)}
            placeholder={t("doc_name_placeholder")}
            className={inputCls}
          />
          <button type="button" onClick={addItem} className="h-11 w-11 shrink-0 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center active:scale-95">
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold disabled:opacity-60 active:scale-[0.99] transition-transform">
        {saving ? t("saving") : t("save")}
      </button>
    </div>
  );
}