import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { X, Search as SearchIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/search")({ component: SearchPage });

function SearchPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ orders: any[]; customers: any[]; inventory: any[] }>({ orders: [], customers: [], inventory: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults({ orders: [], customers: [], inventory: [] });
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      const term = `%${q.trim()}%`;
      const [o, c, i] = await Promise.all([
        supabase.from("orders").select("id,code,customer_name,product,amount,status").or(`customer_name.ilike.${term},product.ilike.${term},code.ilike.${term}`).limit(10),
        supabase.from("customers").select("id,name,phone,total_orders").or(`name.ilike.${term},phone.ilike.${term}`).limit(10),
        supabase.from("inventory").select("id,name,stock,unit").ilike("name", term).limit(10),
      ]);
      setResults({ orders: o.data ?? [], customers: c.data ?? [], inventory: i.data ?? [] });
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const close = () => navigate({ to: "/" });

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center gap-2 px-4 pt-10 pb-3 border-b border-border/60">
        <SearchIcon className="h-5 w-5 text-muted-foreground" />
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t("search_placeholder")}
          className="flex-1 bg-transparent outline-none text-base" />
        <button onClick={close} className="p-2 rounded-full active:bg-muted"><X className="h-5 w-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {loading && <p className="text-center text-sm text-muted-foreground">{t("loading")}</p>}

        {results.orders.length > 0 && (
          <section>
            <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-2">{t("orders")}</p>
            <div className="space-y-2">
              {results.orders.map((o) => (
                <Link key={o.id} to="/orders" onClick={close} className="block p-3 rounded-xl bg-card border border-border/60">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">{o.customer_name}</span>
                    <span className="text-sm font-bold">RM {Number(o.amount).toFixed(0)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{o.code} · {o.product}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {results.customers.length > 0 && (
          <section>
            <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-2">{t("customers")}</p>
            <div className="space-y-2">
              {results.customers.map((c) => (
                <Link key={c.id} to="/customers/$customerId" params={{ customerId: c.id }} onClick={close} className="block p-3 rounded-xl bg-card border border-border/60">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.phone || "—"} · {c.total_orders} {t("orders_word")}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {results.inventory.length > 0 && (
          <section>
            <p className="text-[11px] font-semibold uppercase text-muted-foreground mb-2">{t("inventory")}</p>
            <div className="space-y-2">
              {results.inventory.map((i) => (
                <Link key={i.id} to="/inventory" onClick={close} className="block p-3 rounded-xl bg-card border border-border/60">
                  <p className="text-sm font-medium">{i.name}</p>
                  <p className="text-xs text-muted-foreground">{i.stock} {i.unit} {t("left")}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {!loading && q.trim().length >= 2 &&
         results.orders.length === 0 && results.customers.length === 0 && results.inventory.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">—</p>
        )}
      </div>
    </div>
  );
}
