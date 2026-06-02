import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";

export const Route = createFileRoute("/documents")({ component: DocumentsPage });

type DocItem = { name: string; status: "pending" | "received" | "verified" };
type Checklist = {
  id: string;
  customer_id: string | null;
  listing_id: string | null;
  title: string;
  items: DocItem[];
  customer_name?: string | null;
};

function DocumentsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { type: bizType, loading: bizLoading } = useBusinessType();
  const navigate = useNavigate();
  const [items, setItems] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!bizLoading && bizType && bizType !== "property") {
      navigate({ to: "/", replace: true });
    }
  }, [bizLoading, bizType, navigate]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("property_document_checklists" as never)
      .select("id,customer_id,listing_id,title,items")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const rows = ((data as any[]) ?? []).map((r) => ({ ...r, items: Array.isArray(r.items) ? r.items : [] })) as Checklist[];
    const ids = Array.from(new Set(rows.map((r) => r.customer_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: cs } = await supabase.from("customers").select("id,name").in("id", ids);
      const map = new Map<string, string>(((cs as any[]) ?? []).map((c) => [c.id, c.name]));
      rows.forEach((r) => { if (r.customer_id) r.customer_name = map.get(r.customer_id) ?? null; });
    }
    setItems(rows);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((c) => ((c.customer_name ?? "") + " " + c.title).toLowerCase().includes(term));
  }, [items, q]);

  return (
    <div className="px-5 pt-10 pb-28 space-y-4">
      <header className="flex items-center gap-2">
        <Link to="/" className="-ml-2 p-2 rounded-full active:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("documents_title")}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary ml-auto">
          {items.length}
        </span>
      </header>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("doc_search")}
          className="w-full pl-9 pr-3 py-2.5 rounded-2xl bg-background border border-border text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="space-y-3">
        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}
        {!loading && visible.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">{t("no_checklists_yet")}</p>
        )}
        {!loading && visible.map((c) => {
          const total = c.items.length;
          const done = c.items.filter((i) => i.status === "verified").length;
          const received = c.items.filter((i) => i.status === "received").length;
          return (
            <Link
              key={c.id}
              to="/document/$id"
              params={{ id: c.id }}
              className="block rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-2 active:scale-[0.99] transition-transform"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{c.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{c.customer_name || "—"}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                  {done}/{total}
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${total ? ((done + received * 0.5) / total) * 100 : 0}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>

      <Link
        to="/document/$id"
        params={{ id: "new" }}
        aria-label={t("new_checklist")}
        className="fixed bottom-24 z-30 h-14 w-14 rounded-full text-primary-foreground shadow-[var(--shadow-soft)] flex items-center justify-center active:scale-95 transition-transform bg-gradient-to-br from-primary to-primary/80"
        style={{ right: "max(1.5rem, calc(50vw - 180px + 1rem))" }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </Link>
    </div>
  );
}