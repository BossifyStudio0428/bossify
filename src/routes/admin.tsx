import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/admin")({ component: AdminPage });

type AdminUser = {
  id: string; business_name: string | null; is_admin: boolean | null;
  created_at: string; plan: string | null; status: string | null;
  expires_at: string | null; order_count: number | null;
  total_orders: number; total_revenue: number;
};

function AdminPage() {
  const { user } = useAuth();
  const { refresh: refreshSub } = useSubscription();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [tab, setTab] = useState<"stats" | "users" | "orders">("stats");
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [grantOpen, setGrantOpen] = useState<{ uid: string; name: string } | null>(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState<"All" | "Paid" | "Unpaid" | "Pending">("All");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      const ok = !!data?.is_admin;
      setIsAdmin(ok);
      setChecking(false);
      if (!ok) { navigate({ to: "/" }); return; }
      loadAll();
    })();
  }, [user?.id]);

  const loadAll = async () => {
    const [{ data: u }, { data: o }] = await Promise.all([
      supabase.from("admin_users_view").select("*").order("created_at", { ascending: false }),
      supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    setUsers((u ?? []) as AdminUser[]);
    setAllOrders(o ?? []);
  };

  if (checking) return <p className="p-6 text-sm text-muted-foreground">Checking access…</p>;
  if (!isAdmin) return null;

  const totalUsers = users.length;
  const totalOrders = users.reduce((s, u) => s + (u.total_orders ?? 0), 0);
  const totalRevenue = users.reduce((s, u) => s + Number(u.total_revenue ?? 0), 0);
  const proUsers = users.filter((u) => u.plan === "pro").length;
  const freeUsers = users.filter((u) => u.plan !== "pro").length;
  const today = new Date(); today.setHours(0,0,0,0);
  const newToday = users.filter((u) => new Date(u.created_at) >= today).length;

  const filteredOrders = orderStatusFilter === "All" ? allOrders : allOrders.filter((o) => o.status === orderStatusFilter);
  const userMap = new Map(users.map((u) => [u.id, u.business_name || u.id.slice(0, 8)]));

  const grantPro = async (uid: string, months: number | "lifetime") => {
    const expires = months === "lifetime"
      ? new Date(2099, 0, 1)
      : new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000);
    const { error } = await supabase.from("subscriptions").update({
      plan: "pro", status: "active", expires_at: expires.toISOString(),
      started_at: new Date().toISOString(),
    }).eq("user_id", uid);
    if (error) toast.error(error.message);
    else {
      toast.success(`${t("admin_pro_granted")}${months === "lifetime" ? ` (${t("admin_lifetime")})` : ` ${months} ${t("months_short")}`}`);
      if (uid === user?.id) refreshSub();
      loadAll();
      setGrantOpen(null);
    }
  };

  const revokePro = async (uid: string) => {
    if (!confirm(t("admin_revoke_confirm"))) return;
    const { error } = await supabase.from("subscriptions").update({
      plan: "free", status: "active", expires_at: null,
    }).eq("user_id", uid);
    if (error) toast.error(error.message);
    else {
      toast.success(t("admin_reverted_free"));
      if (uid === user?.id) refreshSub();
      loadAll();
    }
  };

  const grantSelfPro = () => user && grantPro(user.id, 1);
  const revokeSelf = () => user && revokePro(user.id);

  return (
    <div className="pb-8">
      <header className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground px-5 pt-10 pb-6 rounded-b-3xl">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate({ to: "/profile" })} className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <Sparkles className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold">{t("admin_panel")} ⚙️</h1>
        <p className="text-xs opacity-80 mt-1">{t("admin_console_sub")}</p>
      </header>

      <div className="px-5 pt-5 space-y-5">
        <div className="flex gap-2">
          {(["stats","users","orders"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-2 rounded-full text-xs font-semibold capitalize ${tab===k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {k}
            </button>
          ))}
        </div>

        {tab === "stats" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Total Users" value={totalUsers} />
              <Stat label="Total Orders" value={totalOrders} />
              <Stat label="Total Revenue" value={`RM ${totalRevenue.toFixed(0)}`} />
              <Stat label="Pro Users" value={proUsers} accent />
              <Stat label="Free Users" value={freeUsers} />
              <Stat label="New Today" value={newToday} />
            </div>

            <section className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 p-4 space-y-3">
              <h3 className="text-sm font-bold">🧪 Test Mode</h3>
              <p className="text-xs text-muted-foreground">Toggle your own Pro plan to test gated features.</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={grantSelfPro} className="py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-xs">Grant Pro to Me (30d)</button>
                <button onClick={revokeSelf} className="py-3 rounded-2xl bg-muted text-muted-foreground font-semibold text-xs">Revert to Free</button>
              </div>
            </section>
          </>
        )}

        {tab === "users" && (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="rounded-2xl bg-card border border-border/60 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{u.business_name || u.id.slice(0, 12)}</p>
                    <p className="text-[10px] text-muted-foreground">Joined {new Date(u.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.plan === "pro" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {(u.plan ?? "free").toUpperCase()}
                  </span>
                </div>
                <div className="flex gap-3 text-[11px] text-muted-foreground">
                  <span>📦 {u.total_orders}</span>
                  <span>💰 RM {Number(u.total_revenue).toFixed(0)}</span>
                  {u.is_admin && <span className="text-primary font-semibold">👑 Admin</span>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {u.plan === "pro"
                    ? <button onClick={() => revokePro(u.id)} className="py-2 rounded-xl bg-muted text-muted-foreground text-[11px] font-semibold">Revoke Pro</button>
                    : <button onClick={() => setGrantOpen({ uid: u.id, name: u.business_name || u.id.slice(0, 8) })} className="py-2 rounded-xl bg-primary text-primary-foreground text-[11px] font-semibold">Grant Pro</button>}
                  <button onClick={() => toast.info(`User ID: ${u.id}`)} className="py-2 rounded-xl bg-muted text-muted-foreground text-[11px] font-semibold">View</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "orders" && (
          <div className="space-y-2">
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {(["All","Paid","Unpaid","Pending"] as const).map((s) => (
                <button key={s} onClick={() => setOrderStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold ${orderStatusFilter===s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {s}
                </button>
              ))}
            </div>
            {filteredOrders.map((o) => (
              <div key={o.id} className="rounded-xl bg-card border border-border/60 p-3 text-xs">
                <div className="flex justify-between">
                  <span className="font-semibold">{o.code}</span>
                  <span className="text-muted-foreground">{userMap.get(o.user_id) ?? o.user_id.slice(0, 8)}</span>
                </div>
                <div className="flex justify-between mt-1 text-[11px]">
                  <span>{o.customer_name} · {o.product}</span>
                  <span className="font-bold">RM {Number(o.amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                  <span>{o.status}</span>
                  <span>{new Date(o.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {grantOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setGrantOpen(null)}>
          <div className="w-full max-w-[390px] bg-card rounded-t-3xl sm:rounded-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">Grant Pro to {grantOpen.name}</h3>
            <p className="text-xs text-muted-foreground">Choose duration:</p>
            <div className="grid grid-cols-2 gap-2">
              {[1, 3, 6, 12].map((m) => (
                <button key={m} onClick={() => grantPro(grantOpen.uid, m)} className="py-3 rounded-xl bg-primary/10 text-primary font-semibold text-sm">
                  {m} month{m>1?"s":""}
                </button>
              ))}
              <button onClick={() => grantPro(grantOpen.uid, "lifetime")} className="col-span-2 py-3 rounded-xl bg-gradient-to-r from-primary to-primary/70 text-primary-foreground font-bold text-sm">
                ✨ Lifetime
              </button>
            </div>
            <button onClick={() => setGrantOpen(null)} className="w-full py-3 rounded-xl bg-muted text-muted-foreground font-semibold text-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground border-transparent" : "bg-card border-border/60"}`}>
      <p className={`text-xl font-bold ${accent ? "" : "text-foreground"}`}>{value}</p>
      <p className={`text-[10px] uppercase tracking-wide mt-0.5 ${accent ? "opacity-80" : "text-muted-foreground"}`}>{label}</p>
    </div>
  );
}