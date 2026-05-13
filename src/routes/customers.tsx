import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { supabase, type CustomerRow } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/customers")({ component: CustomersPage });

function relTime(iso: string | null, t: (k: any) => string) {
  if (!iso) return t("never");
  const d = new Date(iso);
  const today = new Date(); today.setHours(0,0,0,0);
  const that = new Date(d); that.setHours(0,0,0,0);
  const diff = Math.floor((today.getTime() - that.getTime()) / 86400000);
  if (diff <= 0) return t("today_word");
  if (diff === 1) return t("yesterday");
  if (diff < 7) return `${diff} ${t("days_ago")}`;
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

function buildWA(phone: string, message: string) {
  const cleaned = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

function CustomersPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuFor, setMenuFor] = useState<CustomerRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CustomerRow | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const doDelete = async () => {
    if (!confirmDelete || !user) return;
    const c = confirmDelete;
    setRemovingId(c.id);
    setConfirmDelete(null);
    setTimeout(async () => {
      const { error } = await supabase.from("customers").delete().eq("id", c.id).eq("user_id", user.id);
      if (error) {
        toast.error(error.message);
        setRemovingId(null);
        return;
      }
      setCustomers((prev) => prev.filter((x) => x.id !== c.id));
      setRemovingId(null);
      toast.success(t("customer_deleted"));
    }, 220);
  };

  const load = async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("last_order_at", { ascending: false, nullsFirst: false });
    if (error) toast.error(error.message);
    setCustomers((data ?? []) as CustomerRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("cust-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const visible = customers.filter((c) => {
    const q = query.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="px-5 pt-10 pb-4 space-y-5">
      <header className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("customers")}</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {customers.length} {t("total")}
        </span>
      </header>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base">🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search_customers")}
          className="w-full rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15 transition"
        />
      </div>

      <div className="space-y-3">
        {loading && (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        )}
        {!loading && customers.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10 px-4">{t("no_customers_create")}</p>
        )}
        {!loading && customers.length > 0 && visible.map((c, idx) => (
          <div
            key={c.id}
            className={`rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] flex items-center gap-3 p-4 transition-all duration-200 ${removingId === c.id ? "opacity-0 scale-95" : "opacity-100"}`}
          >
            <Link
              to="/customer/$customerId"
              params={{ customerId: c.id }}
              className="flex items-center gap-3 flex-1 min-w-0"
            >
              <div className="h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold text-base shrink-0">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                {c.phone && (
                  <p className="text-[11px] text-primary font-medium mt-0.5 truncate">📱 {c.phone}</p>
                )}
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {c.total_orders} {t("orders_word")} · {t("last")}: {relTime(c.last_order_at, t)}
                </p>
              </div>
            </Link>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <p className="text-sm font-bold text-primary">RM {Number(c.total_spent).toFixed(0)}</p>
              <button
                onClick={() => {
                  if (!c.phone) { toast.error(t("no_phone_for_wa")); return; }
                  window.open(buildWA(c.phone, `Hi ${c.name}! 👋 Thank you for being a valued customer! 😊`), "_blank");
                }}
                id={idx === 0 ? "tour-cust-wa" : undefined}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500 text-white active:scale-95 transition-transform"
              >
                📲 WA
              </button>
            </div>
            <button
              onClick={() => setMenuFor(c)}
              aria-label="More"
              className="p-2 -mr-1 rounded-full text-muted-foreground hover:bg-muted active:scale-95 transition"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>
        ))}
        {!loading && customers.length > 0 && visible.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">{t("no_customers")}</p>
        )}
      </div>

      {menuFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setMenuFor(null)}>
          <div className="w-full max-w-[420px] bg-card rounded-t-3xl p-3 space-y-1 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-semibold text-muted-foreground px-3 py-2 truncate">{menuFor.name}</p>
            <button
              onClick={() => { const c = menuFor; setMenuFor(null); navigate({ to: "/customer/$customerId", params: { customerId: c.id } }); }}
              className="w-full text-left px-4 py-3 rounded-2xl text-sm font-semibold hover:bg-muted"
            >
              ✏️ {t("edit_customer")}
            </button>
            <button
              onClick={() => { setConfirmDelete(menuFor); setMenuFor(null); }}
              className="w-full text-left px-4 py-3 rounded-2xl text-sm font-semibold text-red-500 hover:bg-red-500/10"
            >
              🗑️ {t("delete_customer")}
            </button>
            <button onClick={() => setMenuFor(null)} className="w-full px-4 py-3 rounded-2xl text-sm text-muted-foreground">
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm bg-card rounded-3xl p-5 space-y-4 animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-500/15 text-red-500 flex items-center justify-center text-xl">⚠️</div>
              <h3 className="text-base font-bold text-foreground">{t("delete_customer")}?</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("delete_customer_confirm").replace("{name}", confirmDelete.name)}
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => setConfirmDelete(null)} className="py-3 rounded-2xl bg-muted text-foreground font-semibold text-sm">{t("cancel")}</button>
              <button onClick={doDelete} className="py-3 rounded-2xl bg-red-500 text-white font-semibold text-sm">{t("delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}