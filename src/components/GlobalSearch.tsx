import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search as SearchIcon, X, ShoppingBag, Users, Package, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

type Hit = { id: string; title: string; sub: string };
type Results = { orders: Hit[]; customers: Hit[]; products: Hit[] };
const EMPTY: Results = { orders: [], customers: [], products: [] };

/**
 * Search box for the desktop top bar. Typing shows matching orders,
 * customers and products in a panel right under the box (it used to be a
 * disguised link that jumped to a separate search page). Click a result to
 * open it; Esc or clicking elsewhere closes the panel.
 */
export function GlobalSearch() {
  const { user } = useAuth();
  const { lang } = useI18n();
  const L = (zh: string, en: string, ms?: string) => (lang === "zh" ? zh : lang === "ms" ? ms ?? en : en);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Results>(EMPTY);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (!user || term.length < 2) { setRes(EMPTY); setLoading(false); return; }
    setLoading(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      // Commas / brackets would break the "or" filter syntax.
      const safe = term.replace(/[,()]/g, " ");
      const like = `%${safe}%`;
      const [o, c, p] = await Promise.all([
        supabase.from("orders").select("id,code,customer_name,product,amount")
          .eq("user_id", user.id)
          .or(`customer_name.ilike.${like},product.ilike.${like},code.ilike.${like}`)
          .order("created_at", { ascending: false }).limit(5),
        supabase.from("customers").select("id,name,phone")
          .eq("user_id", user.id)
          .or(`name.ilike.${like},phone.ilike.${like}`).limit(5),
        supabase.from("inventory").select("id,name,stock")
          .eq("user_id", user.id).ilike("name", like).limit(5),
      ]);
      if (cancelled) return;
      setRes({
        orders: ((o.data ?? []) as any[]).map((r) => ({ id: r.id, title: `${r.code} · ${r.customer_name}`, sub: `${r.product ?? ""} · RM ${Number(r.amount ?? 0).toFixed(2)}` })),
        customers: ((c.data ?? []) as any[]).map((r) => ({ id: r.id, title: r.name, sub: r.phone ?? "" })),
        products: ((p.data ?? []) as any[]).map((r) => ({ id: r.id, title: r.name, sub: `${L("库存", "Stock", "Stok")} ${Number(r.stock ?? 0)}` })),
      });
      setLoading(false);
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, user?.id]);

  const total = res.orders.length + res.customers.length + res.products.length;
  const showPanel = open && q.trim().length >= 2;
  const done = () => { setOpen(false); setQ(""); inputRef.current?.blur(); };

  const Section = ({ title, icon: Icon, hits, link }: {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    hits: Hit[];
    link: (h: Hit) => React.ReactNode;
  }) =>
    hits.length === 0 ? null : (
      <div className="py-1">
        <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Icon className="h-3 w-3" /> {title}
        </p>
        {hits.map((h) => <div key={h.id}>{link(h)}</div>)}
      </div>
    );

  const rowCls = "block px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors";

  return (
    <div ref={boxRef} className="relative w-full max-w-[420px]">
      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); } }}
        placeholder={L("搜索订单、商品、客户…", "Search orders, products, customers…", "Cari pesanan, produk, pelanggan…")}
        aria-label={L("搜索", "Search", "Cari")}
        className="h-10 w-full rounded-full border border-border bg-card pl-10 pr-9 text-[13.5px] text-foreground placeholder:text-muted-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary focus:ring-4 focus:ring-primary/15"
      />
      {q && (
        <button
          type="button"
          onClick={() => { setQ(""); inputRef.current?.focus(); }}
          aria-label="clear"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {showPanel && (
        <div className="absolute left-0 right-0 top-12 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-border/60 bg-card p-1.5 shadow-2xl">
          {loading && total === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {L("搜索中…", "Searching…", "Mencari…")}</p>
          ) : total === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">{L("找不到结果", "No results", "Tiada hasil")}</p>
          ) : (
            <>
              <Section title={L("订单", "Orders", "Pesanan")} icon={ShoppingBag} hits={res.orders}
                link={(h) => (
                  <Link to="/orders/$orderId" params={{ orderId: h.id }} search={{} as never} onClick={done} className={rowCls}>
                    <p className="text-sm font-semibold text-foreground truncate">{h.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{h.sub}</p>
                  </Link>
                )} />
              <Section title={L("客户", "Customers", "Pelanggan")} icon={Users} hits={res.customers}
                link={(h) => (
                  <Link to="/customer/$customerId" params={{ customerId: h.id }} onClick={done} className={rowCls}>
                    <p className="text-sm font-semibold text-foreground truncate">{h.title}</p>
                    {h.sub && <p className="text-[11px] text-muted-foreground truncate">{h.sub}</p>}
                  </Link>
                )} />
              <Section title={L("产品", "Products", "Produk")} icon={Package} hits={res.products}
                link={(h) => (
                  <Link to="/inventory/$itemId" params={{ itemId: h.id }} onClick={done} className={rowCls}>
                    <p className="text-sm font-semibold text-foreground truncate">{h.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{h.sub}</p>
                  </Link>
                )} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
