import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { getPublicOrigin, isNativeWebView } from "@/lib/publicUrl";
import {
  loadAdminOverview,
  revokeAdminSubscriptionPlan,
  setAdminSubscriptionPlan,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({ component: AdminPage });

type AdminUser = {
  id: string;
  business_name: string | null;
  is_admin: boolean | null;
  created_at: string;
  plan: string | null;
  status: string | null;
  expires_at: string | null;
  order_count: number | null;
  total_orders: number;
  total_revenue: number;
};

type AdminOrder = {
  id: string;
  code: string;
  user_id: string;
  customer_name: string;
  product: string;
  amount: number;
  status: "Paid" | "Unpaid" | "Pending" | string;
  created_at: string;
};

function AdminPage() {
  const { user, session } = useAuth();
  const { refresh: refreshSub } = useSubscription();
  const navigate = useNavigate();
  const { t } = useI18n();
  const loadAdminOverviewFn = useServerFn(loadAdminOverview);
  const setAdminSubscriptionPlanFn = useServerFn(setAdminSubscriptionPlan);
  const revokeAdminSubscriptionPlanFn = useServerFn(revokeAdminSubscriptionPlan);
  const [tab, setTab] = useState<"stats" | "users" | "orders">("stats");
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [allOrders, setAllOrders] = useState<AdminOrder[]>([]);
  const [grantOpen, setGrantOpen] = useState<{ uid: string; name: string } | null>(null);
  const [grantPlan, setGrantPlan] = useState<"pro" | "team_starter" | "team_pro" | "team_business">(
    "pro",
  );
  const [orderStatusFilter, setOrderStatusFilter] = useState<"All" | "Paid" | "Unpaid" | "Pending">(
    "All",
  );

  const callAdminApi = async (body: Record<string, unknown>) => {
    const token = session?.access_token;
    if (!token) throw new Error("Unauthorized");
    const response = await fetch(`${getPublicOrigin()}/api/public/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string } & Record<
      string,
      unknown
    >;
    if (!response.ok) throw new Error(data.error ?? "Request failed");
    return data;
  };

  const loadNativeAdminOverview = async () => {
    if (!user?.id) throw new Error("Unauthorized");
    try {
      const { data: me, error: meError } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      if (meError || !me?.is_admin) throw new Error("Forbidden");

    const [
      { data: profiles, error: profilesError },
      { data: subscriptions, error: subscriptionsError },
      { data: orders, error: ordersError },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,business_name,is_admin,created_at")
        .order("created_at", { ascending: false }),
      supabase.from("subscriptions").select("user_id,plan,status,expires_at,order_count"),
      supabase
        .from("orders")
        .select("id,code,user_id,customer_name,product,amount,status,created_at")
        .order("created_at", { ascending: false }),
    ]);

      if (profilesError || subscriptionsError || ordersError) {
        throw { profilesError, subscriptionsError, ordersError };
      }

      const subscriptionsByUser = new Map(
        (subscriptions ?? []).map((sub) => [sub.user_id, sub] as const),
      );
      const userRows = (profiles ?? []).map((profile) => {
        const sub = subscriptionsByUser.get(profile.id);
        const userOrders = (orders ?? []).filter((order) => order.user_id === profile.id);
        return {
          id: profile.id,
          business_name: profile.business_name,
          is_admin: profile.is_admin,
          created_at: profile.created_at,
          plan: sub?.plan ?? "free",
          status: sub?.status ?? null,
          expires_at: sub?.expires_at ?? null,
          order_count: sub?.order_count ?? null,
          total_orders: userOrders.length,
          total_revenue: userOrders.reduce(
            (sum, order) => sum + (order.status === "Paid" ? Number(order.amount ?? 0) : 0),
            0,
          ),
        };
      });

      return { isAdmin: true, users: userRows, orders: (orders ?? []).slice(0, 20) };
    } catch (error) {
      console.error("[admin] direct admin reads failed, falling back to public API", error);
      return callAdminApi({ action: "overview" });
    }
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        await loadAll();
        setIsAdmin(true);
      } catch {
        setIsAdmin(false);
        navigate({ to: "/" });
      } finally {
        setChecking(false);
      }
    })();
  }, [user?.id]);

  const loadAll = async () => {
    const data = isNativeWebView() ? await loadNativeAdminOverview() : await loadAdminOverviewFn();
    setUsers((data.users ?? []) as unknown as AdminUser[]);
    setAllOrders((data.orders ?? []) as unknown as AdminOrder[]);
  };

  if (checking) return <p className="p-6 text-sm text-muted-foreground">{t("admin_checking")}</p>;
  if (!isAdmin) return null;

  const totalUsers = users.length;
  const totalOrders = users.reduce((s, u) => s + (u.total_orders ?? 0), 0);
  const totalRevenue = users.reduce((s, u) => s + Number(u.total_revenue ?? 0), 0);
  const proUsers = users.filter((u) => u.plan === "pro").length;
  const freeUsers = users.filter((u) => u.plan !== "pro").length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const newToday = users.filter((u) => new Date(u.created_at) >= today).length;

  const filteredOrders =
    orderStatusFilter === "All"
      ? allOrders
      : allOrders.filter((o) => o.status === orderStatusFilter);
  const userMap = new Map(users.map((u) => [u.id, u.business_name || u.id.slice(0, 8)]));

  const grantPro = async (
    uid: string,
    months: number | "lifetime",
    plan: "pro" | "team_starter" | "team_pro" | "team_business" = "pro",
  ) => {
    try {
      if (isNativeWebView()) {
        await callAdminApi({ action: "set_plan", userId: uid, months, plan });
      } else {
        await setAdminSubscriptionPlanFn({ data: { userId: uid, months, plan } });
      }
      toast.success(
        `${t("admin_pro_granted")}${months === "lifetime" ? ` (${t("admin_lifetime")})` : ` ${months} ${t("months_short")}`}`,
      );
      if (uid === user?.id) refreshSub();
      loadAll();
      setGrantOpen(null);
    } catch {
      toast.error(t("update_failed"));
    }
  };

  const revokePro = async (uid: string) => {
    if (!confirm(t("admin_revoke_confirm"))) return;
    try {
      if (isNativeWebView()) {
        await callAdminApi({ action: "revoke_plan", userId: uid });
      } else {
        await revokeAdminSubscriptionPlanFn({ data: { userId: uid } });
      }
      toast.success(t("admin_reverted_free"));
      if (uid === user?.id) refreshSub();
      loadAll();
    } catch {
      toast.error(t("update_failed"));
    }
  };

  const grantSelfPro = () => user && grantPro(user.id, 1);
  const revokeSelf = () => user && revokePro(user.id);

  return (
    <div className="pb-8">
      <header className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground px-5 pt-10 pb-6 rounded-b-3xl">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => navigate({ to: "/profile" })}
            className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <Sparkles className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold">{t("admin_panel")} ⚙️</h1>
        <p className="text-xs opacity-80 mt-1">{t("admin_console_sub")}</p>
      </header>

      <div className="px-5 pt-5 space-y-5">
        <div className="flex gap-2">
          {(["stats", "users", "orders"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 py-2 rounded-full text-xs font-semibold capitalize ${tab === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {k}
            </button>
          ))}
        </div>

        {tab === "stats" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label={t("admin_total_users")} value={totalUsers} />
              <Stat label={t("admin_total_orders")} value={totalOrders} />
              <Stat label={t("admin_total_revenue")} value={`RM ${totalRevenue.toFixed(0)}`} />
              <Stat label={t("admin_pro_users")} value={proUsers} accent />
              <Stat label={t("admin_free_users")} value={freeUsers} />
              <Stat label={t("admin_new_today")} value={newToday} />
            </div>

            <section className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/30 p-4 space-y-3">
              <h3 className="text-sm font-bold">🧪 {t("admin_test_mode")}</h3>
              <p className="text-xs text-muted-foreground">{t("admin_test_desc")}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={grantSelfPro}
                  className="py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-xs"
                >
                  {t("admin_grant_self")}
                </button>
                <button
                  onClick={revokeSelf}
                  className="py-3 rounded-2xl bg-muted text-muted-foreground font-semibold text-xs"
                >
                  {t("admin_revert_self")}
                </button>
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
                    <p className="text-sm font-semibold truncate">
                      {u.business_name || u.id.slice(0, 12)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {t("admin_joined")} {new Date(u.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.plan === "pro" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    {(u.plan ?? "free").toUpperCase()}
                  </span>
                </div>
                <div className="flex gap-3 text-[11px] text-muted-foreground">
                  <span>📦 {u.total_orders}</span>
                  <span>💰 RM {Number(u.total_revenue).toFixed(0)}</span>
                  {u.is_admin && (
                    <span className="text-primary font-semibold">👑 {t("admin_admin_badge")}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {u.plan && u.plan !== "free" ? (
                    <button
                      onClick={() => revokePro(u.id)}
                      className="py-2 rounded-xl bg-muted text-muted-foreground text-[11px] font-semibold"
                    >
                      {t("admin_revoke_pro")}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setGrantPlan("pro");
                        setGrantOpen({ uid: u.id, name: u.business_name || u.id.slice(0, 8) });
                      }}
                      className="py-2 rounded-xl bg-primary text-primary-foreground text-[11px] font-semibold"
                    >
                      {t("admin_grant_pro")}
                    </button>
                  )}
                  <button
                    onClick={() => toast.info(`${t("admin_user_id_copy")} ${u.id}`)}
                    className="py-2 rounded-xl bg-muted text-muted-foreground text-[11px] font-semibold"
                  >
                    {t("admin_view")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "orders" && (
          <div className="space-y-2">
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {(["All", "Paid", "Unpaid", "Pending"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setOrderStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold ${orderStatusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {t(`admin_filter_${s.toLowerCase()}` as TKey)}
                </button>
              ))}
            </div>
            {filteredOrders.map((o) => (
              <div key={o.id} className="rounded-xl bg-card border border-border/60 p-3 text-xs">
                <div className="flex justify-between">
                  <span className="font-semibold">{o.code}</span>
                  <span className="text-muted-foreground">
                    {userMap.get(o.user_id) ?? o.user_id.slice(0, 8)}
                  </span>
                </div>
                <div className="flex justify-between mt-1 text-[11px]">
                  <span>
                    {o.customer_name} · {o.product}
                  </span>
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
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
          onClick={() => setGrantOpen(null)}
        >
          <div
            className="w-full max-w-[390px] bg-card rounded-t-3xl sm:rounded-3xl p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold">
              {t("admin_grant_to")} {grantOpen.name}
            </h3>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {t("admin_choose_plan")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { key: "pro", label: "Pro" },
                    { key: "team_starter", label: "Team Starter" },
                    { key: "team_pro", label: "Team Pro" },
                    { key: "team_business", label: "Team Business" },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setGrantPlan(p.key)}
                    className={`py-2 rounded-xl text-xs font-semibold border ${grantPlan === p.key ? "bg-primary text-primary-foreground border-transparent" : "bg-card text-foreground border-border/60"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground pt-1">{t("admin_choose_duration")}</p>
            <div className="grid grid-cols-2 gap-2">
              {[1, 3, 6, 12].map((m) => (
                <button
                  key={m}
                  onClick={() => grantPro(grantOpen.uid, m, grantPlan)}
                  className="py-3 rounded-xl bg-primary/10 text-primary font-semibold text-sm"
                >
                  {m} {m > 1 ? t("months_many") : t("month_one")}
                </button>
              ))}
              <button
                onClick={() => grantPro(grantOpen.uid, "lifetime", grantPlan)}
                className="col-span-2 py-3 rounded-xl bg-gradient-to-r from-primary to-primary/70 text-primary-foreground font-bold text-sm"
              >
                ✨ {t("admin_lifetime")}
              </button>
            </div>
            <button
              onClick={() => setGrantOpen(null)}
              className="w-full py-3 rounded-xl bg-muted text-muted-foreground font-semibold text-sm"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${accent ? "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground border-transparent" : "bg-card border-border/60"}`}
    >
      <p className={`text-xl font-bold ${accent ? "" : "text-foreground"}`}>{value}</p>
      <p
        className={`text-[10px] uppercase tracking-wide mt-0.5 ${accent ? "opacity-80" : "text-muted-foreground"}`}
      >
        {label}
      </p>
    </div>
  );
}
