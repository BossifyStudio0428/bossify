import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, X, Rocket, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { safeLocalStorage } from "@/lib/safeStorage";
import { loadPaymentSummary } from "@/lib/paymentSetup";

const DISMISS_KEY = "bossify_setup_checklist_dismissed";

type Item = {
  key: string;
  label: string;
  to: string;
  done: boolean;
};

export function SetupChecklist() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDismissed(safeLocalStorage.getItem(`${DISMISS_KEY}:${user.id}`) === "1");
  }, [user?.id]);

  const load = async () => {
    if (!user) return;
    try {
      const [profileRes, invRes, ordersRes, custRes, paySummary] = await Promise.all([
        supabase.from("profiles").select("business_name").eq("id", user.id).maybeSingle(),
        supabase.from("inventory").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        loadPaymentSummary(user.id).catch(() => ({ hasMethod: false, type: null, number: null })),
      ]);
      setItems([
        {
          key: "biz",
          label: "Lengkapkan profil perniagaan",
          to: "/business-profile",
          done: !!(profileRes.data as any)?.business_name?.trim(),
        },
        {
          key: "inv",
          label: "Tambah produk pertama",
          to: "/inventory",
          done: (invRes.count ?? 0) > 0,
        },
        {
          key: "pay",
          label: "Tetapkan kaedah pembayaran",
          to: "/payment-details",
          done: paySummary.hasMethod,
        },
        {
          key: "ord",
          label: "Cipta pesanan pertama",
          to: "/new-order",
          done: (ordersRes.count ?? 0) > 0,
        },
        {
          key: "cust",
          label: "Jemput pelanggan pertama",
          to: "/customers",
          done: (custRes.count ?? 0) > 0,
        },
      ]);
    } catch (e) {
      console.error("setup checklist load failed", e);
      setItems(null);
    }
  };

  useEffect(() => { load(); }, [user?.id]);

  // Realtime: refresh as the user completes actions on other screens.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`setup-checklist-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory", filter: `user_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `user_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, load)
      .subscribe();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener("focus", onFocus);
    };
  }, [user?.id]);

  const dismiss = () => {
    if (!user) return;
    safeLocalStorage.setItem(`${DISMISS_KEY}:${user.id}`, "1");
    setDismissed(true);
  };

  if (dismissed || !items) return null;
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const pct = Math.round((done / total) * 100);
  const allDone = done === total;

  return (
    <section className="rounded-3xl bg-gradient-to-br from-primary/10 via-card to-card border border-primary/30 shadow-[var(--shadow-card)] p-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center shrink-0 shadow-[var(--shadow-soft)]">
          <Rocket className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">🚀 Mulakan Perniagaan Anda</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{done} / {total} selesai</p>
        </div>
        <button
          type="button"
          aria-label="dismiss"
          onClick={dismiss}
          className="h-7 w-7 rounded-full text-muted-foreground active:bg-muted flex items-center justify-center shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {allDone ? (
        <p className="mt-3 text-[12px] font-semibold text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2 text-center">
          ✅ Anda sudah bersedia! Semua telah disediakan 🎉
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                to={item.to}
                className="flex items-center gap-3 px-2 py-2 rounded-xl active:bg-muted transition"
              >
                <span
                  className={`h-5 w-5 rounded-md flex items-center justify-center shrink-0 ${
                    item.done
                      ? "bg-emerald-500 text-white"
                      : "border-2 border-muted-foreground/40"
                  }`}
                >
                  {item.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                <span
                  className={`flex-1 text-[13px] ${
                    item.done
                      ? "text-muted-foreground line-through"
                      : "text-foreground font-medium"
                  }`}
                >
                  {item.label}
                </span>
                {!item.done && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
