import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { verifyActiveSubscription, isNativeBillingAvailable } from "@/lib/billing";

export type Plan = "free" | "pro";

export type SubscriptionRow = {
  id: string;
  user_id: string;
  plan: Plan;
  status: string;
  started_at: string | null;
  expires_at: string | null;
  order_count: number;
  count_period_start: string | null;
  last_reset_at: string | null;
};

export const FREE_LIMITS = {
  ordersPerMonth: 20,
  inventory: 10,
  customers: 50,
} as const;

type Ctx = {
  sub: SubscriptionRow | null;
  plan: Plan;
  isPro: boolean;
  loading: boolean;
  ordersUsed: number;
  ordersLimit: number;
  ordersRemaining: number;
  refresh: () => Promise<void>;
  /**
   * Re-query Google Play for the current user's owned Pro subscription and
   * upsert the result into Supabase. Safe to call any time — on app launch,
   * on app resume, after a purchase attempt (success OR cancel), etc.
   */
  syncFromStore: () => Promise<void>;
  showUpgrade: (reason?: string) => void;
  hideUpgrade: () => void;
  upgradeOpen: boolean;
  upgradeReason: string;
};

const SubCtx = createContext<Ctx | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState("");

  const refresh = useCallback(async () => {
    if (!user) {
      setSub(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        console.error("subscription load failed", error);
        setSub(null);
        return;
      }
      if (data) {
        // Client-side monthly reset safety net
        const period = data.count_period_start ? new Date(data.count_period_start) : null;
        const now = new Date();
        const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        if (!period || period < curMonthStart) {
          const { error: resetError } = await supabase
            .from("subscriptions")
            .update({
              order_count: 0,
              count_period_start: curMonthStart.toISOString(),
              last_reset_at: now.toISOString(),
            })
            .eq("user_id", user.id);
          if (resetError) console.error("subscription counter reset failed", resetError);
          else {
            data.order_count = 0;
            data.count_period_start = curMonthStart.toISOString();
            data.last_reset_at = now.toISOString();
          }
        }

        // Verify the cached order_count against reality (count of orders in
        // the current calendar month). If they drift apart (manual deletes,
        // missed trigger, etc.), self-heal so the dashboard counter is
        // always accurate.
        try {
          const { count: actualCount, error: countError } = await supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .gte("created_at", curMonthStart.toISOString());
          if (!countError && typeof actualCount === "number" && actualCount !== data.order_count) {
            const { error: syncError } = await supabase
              .from("subscriptions")
              .update({ order_count: actualCount })
              .eq("user_id", user.id);
            if (!syncError) data.order_count = actualCount;
          }
        } catch (e) {
          console.error("order count verification failed", e);
        }

        setSub(data as SubscriptionRow);
      } else {
        // Auto-create on first access (covers users created before trigger)
        const { data: created, error: createError } = await supabase
          .from("subscriptions")
          .insert({ user_id: user.id, plan: "free", status: "active" })
          .select("*")
          .maybeSingle();
        if (createError) console.error("subscription create failed", createError);
        setSub((created as SubscriptionRow) ?? null);
      }
    } catch (error) {
      console.error("subscription refresh failed", error);
      setSub(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Re-query Google Play for the user's actual entitlement and reconcile
  // it with Supabase. The native store is the source of truth — if the
  // user cancelled in Play Store, refunded, or restored on a new device,
  // this is what catches it.
  const syncFromStore = useCallback(async () => {
    if (!user) return;
    if (!isNativeBillingAvailable()) return;
    try {
      const receipt = await verifyActiveSubscription();
      if (receipt) {
        await supabase.from("subscriptions").upsert({
          user_id: user.id,
          plan: "pro",
          status: "active",
          provider: "google_play",
          provider_product_id: receipt.productId,
          provider_transaction_id: receipt.transactionId,
          provider_purchase_token: receipt.purchaseToken ?? null,
        }, { onConflict: "user_id" });
      }
      // Note: we intentionally do NOT auto-demote pro→free here. Right after
      // a successful purchase the store cache often hasn't refreshed to
      // owned=true yet, and demoting would wipe the freshly-upserted pro
      // record. Cancellations should flow through Play's RTDN webhook or
      // via expires_at instead.
      await refresh();
    } catch (e) {
      console.error("syncFromStore failed", e);
    }
  }, [user, refresh]);

  // On first launch (after user is known): verify with Google Play so an
  // existing subscriber automatically lands as Pro.
  useEffect(() => {
    if (!user) return;
    syncFromStore();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // On app resume (foregrounding the Android app): re-verify so cancellations
  // / new purchases made outside the app are reflected immediately.
  useEffect(() => {
    if (!user) return;
    let unsub: (() => void) | null = null;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) syncFromStore();
        });
        unsub = () => { handle.remove?.(); };
      } catch {
        // Not running inside Capacitor — ignore.
      }
    })();
    return () => { unsub?.(); };
  }, [user?.id, syncFromStore]);

  // Realtime: keep order_count in sync after inserts
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`sub-rt-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
        (p) => setSub(p.new as SubscriptionRow))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const plan: Plan = (sub?.plan as Plan) ?? "free";
  const isPro = plan === "pro" && (sub?.status ?? "active") === "active";
  const ordersUsed = sub?.order_count ?? 0;
  const ordersLimit = FREE_LIMITS.ordersPerMonth;
  const ordersRemaining = Math.max(0, ordersLimit - ordersUsed);

  const showUpgrade = (reason?: string) => {
    setUpgradeReason(reason ?? "");
    setUpgradeOpen(true);
  };
  const hideUpgrade = () => setUpgradeOpen(false);

  return (
    <SubCtx.Provider value={{
      sub, plan, isPro, loading, ordersUsed, ordersLimit, ordersRemaining,
      refresh, syncFromStore, showUpgrade, hideUpgrade, upgradeOpen, upgradeReason,
    }}>
      {children}
    </SubCtx.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubCtx);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}