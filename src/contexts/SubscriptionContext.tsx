import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useI18n } from "@/contexts/I18nContext";
import {
  verifyActiveSubscription,
  verifyLifetimeOwnership,
  verifyActiveStarter,
  isNativeBillingAvailable,
  LIFETIME_PRODUCT_ID,
  STARTER_PRODUCT_IDS,
  type BillingPlan,
} from "@/lib/billing";

export type Plan = "free" | "starter" | "pro" | "lifetime";

export type SubscriptionRow = {
  id: string;
  user_id: string;
  plan: Plan;
  status: string;
  started_at: string | null;
  expires_at: string | null;
  order_count: number;
  inventory_created_total: number;
  count_period_start: string | null;
  last_reset_at: string | null;
  provider?: string | null;
  provider_product_id?: string | null;
  current_period_end?: string | null;
  lifetime_purchase_date?: string | null;
  lifetime_google_token?: string | null;
  lifetime_email?: string | null;
  lifetime_activated_at?: string | null;
};

export const FREE_LIMITS = {
  ordersPerMonth: 20,
  inventory: 10,
  customers: 50,
} as const;

export const STARTER_LIMITS = {
  ordersPerMonth: 40,
  inventory: 25,
  customers: 200,
} as const;

/** Per-plan caps used by gates across the app. Infinity = no limit. */
export function getPlanLimits(plan: Plan) {
  if (plan === "pro" || plan === "lifetime") {
    return { ordersPerMonth: Infinity, inventory: Infinity, customers: Infinity };
  }
  if (plan === "starter") return STARTER_LIMITS;
  return FREE_LIMITS;
}

type Ctx = {
  sub: SubscriptionRow | null;
  plan: Plan;
  isPro: boolean;
  isStarter: boolean;
  isLifetime: boolean;
  /** True for both Pro subscribers and Lifetime owners. Use this for feature gates. */
  hasFullAccess: boolean;
  loading: boolean;
  ordersUsed: number;
  ordersLimit: number;
  ordersRemaining: number;
  productsUsed: number;
  productsLimit: number;
  productsRemaining: number;
  activeBillingPlan: BillingPlan | null;
  refresh: () => Promise<SubscriptionRow | null>;
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
  const { t } = useI18n();
  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState("");
  const notifiedLockRef = useRef(false);
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  const refresh = useCallback(async () => {
    if (!user) {
      setSub(null);
      setLoading(false);
      return null;
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
        return null;
      }
      if (data) {
        // Lifetime account lock: if the current logged-in email no longer
        // matches the email the Lifetime was activated under, downgrade
        // to Free locally. Lifetime is bound to ONE account forever.
        if (
          data.plan === "lifetime" &&
          data.lifetime_email &&
          user.email &&
          data.lifetime_email.toLowerCase() !== user.email.toLowerCase()
        ) {
          data.plan = "free";
          data.status = "active";
          if (!notifiedLockRef.current) {
            notifiedLockRef.current = true;
            toast.error(tRef.current("lifetime_account_lock_msg"));
          }
        }
        // Client-side monthly reset safety net
        const period = data.count_period_start ? new Date(data.count_period_start) : null;
        const now = new Date();
        const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        if (
          (data.plan === "pro" || data.plan === "starter") &&
          data.current_period_end &&
          new Date(data.current_period_end).getTime() <= now.getTime()
        ) {
          const { error: expireError } = await supabase
            .from("subscriptions")
            .update({
              plan: "free",
              status: "active",
              provider_product_id: null,
              current_period_end: null,
            })
            .eq("user_id", user.id);
          if (expireError) console.error("subscription expiry sync failed", expireError);
          else {
            data.plan = "free";
            data.status = "active";
            data.provider_product_id = null;
            data.current_period_end = null;
          }
        }
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
        const nextSub = data as SubscriptionRow;
        // Mirror payment platform onto profiles for the Terms refund policy.
        if (
          (nextSub.plan === "pro" || nextSub.plan === "starter" || nextSub.plan === "lifetime") &&
          (nextSub.provider === "google_play" || nextSub.provider === "stripe")
        ) {
          supabase
            .from("profiles")
            .update({ payment_platform: nextSub.provider } as any)
            .eq("id", user.id)
            .then(({ error }) => {
              if (error) console.warn("payment_platform sync failed", error);
            });
        }
        setSub(nextSub);
        return nextSub;
      } else {
        // Auto-create on first access (covers users created before trigger)
        const { data: created, error: createError } = await supabase
          .from("subscriptions")
          .insert({ user_id: user.id, plan: "free", status: "active" })
          .select("*")
          .maybeSingle();
        if (createError) console.error("subscription create failed", createError);
        const nextSub = (created as SubscriptionRow) ?? null;
        setSub(nextSub);
        return nextSub;
      }
    } catch (error) {
      console.error("subscription refresh failed", error);
      setSub(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      refresh();
    };
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id, refresh]);

  // Re-query Google Play for the user's actual entitlement and reconcile
  // it with Supabase. The native store is the source of truth — if the
  // user cancelled in Play Store, refunded, or restored on a new device,
  // this is what catches it.
  const syncFromStore = useCallback(async () => {
    if (!user) return;
    if (!isNativeBillingAvailable()) return;
    try {
      // Lifetime is the strongest entitlement — check it first and never
      // downgrade away from it.
      const lifetimeReceipt = await verifyLifetimeOwnership();
      if (lifetimeReceipt) {
        // Account-lock check: if the stored row was activated under a
        // different email, do NOT restore lifetime on this account.
        if (
          sub?.lifetime_email &&
          user.email &&
          sub.lifetime_email.toLowerCase() !== user.email.toLowerCase()
        ) {
          await refresh();
          return;
        }
        await supabase.from("subscriptions").upsert(
          {
            user_id: user.id,
            plan: "lifetime",
            status: "active",
            provider: "google_play",
            provider_product_id: LIFETIME_PRODUCT_ID,
            provider_transaction_id: lifetimeReceipt.transactionId,
            provider_purchase_token: lifetimeReceipt.purchaseToken ?? null,
            lifetime_purchase_date: sub?.lifetime_purchase_date ?? new Date().toISOString(),
            lifetime_google_token: lifetimeReceipt.purchaseToken ?? null,
            lifetime_email: sub?.lifetime_email ?? user.email ?? null,
            lifetime_activated_at: sub?.lifetime_activated_at ?? new Date().toISOString(),
            current_period_end: null,
          },
          { onConflict: "user_id" },
        );
        await refresh();
        return;
      }
      // Never auto-downgrade an existing lifetime row just because the
      // store cache hasn't refreshed yet.
      if (sub?.plan === "lifetime") {
        await refresh();
        return;
      }
      const receipt = await verifyActiveSubscription();
      if (receipt) {
        await supabase.from("subscriptions").upsert(
          {
            user_id: user.id,
            plan: "pro",
            status: "active",
            provider: "google_play",
            provider_product_id: `${receipt.productId}:${receipt.basePlanId ?? "monthly"}`,
            provider_transaction_id: receipt.transactionId,
            provider_purchase_token: receipt.purchaseToken ?? null,
            current_period_end: receipt.currentPeriodEnd ?? null,
          },
          { onConflict: "user_id" },
        );
        await refresh();
        return;
      }
      // Check Starter subscription next.
      const starterReceipt = await verifyActiveStarter();
      if (starterReceipt) {
        await supabase.from("subscriptions").upsert(
          {
            user_id: user.id,
            plan: "starter",
            status: "active",
            provider: "google_play",
            provider_product_id: `${starterReceipt.productId}:${starterReceipt.basePlanId ?? "monthly"}`,
            provider_transaction_id: starterReceipt.transactionId,
            provider_purchase_token: starterReceipt.purchaseToken ?? null,
            current_period_end: starterReceipt.currentPeriodEnd ?? null,
          },
          { onConflict: "user_id" },
        );
      } else if (sub?.plan === "pro" && sub?.provider === "google_play") {
        await supabase
          .from("subscriptions")
          .update({
            plan: "free",
            status: "active",
            provider_product_id: null,
            current_period_end: null,
          })
          .eq("user_id", user.id);
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
  }, [user, refresh, sub?.plan, sub?.provider]);

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
        unsub = () => {
          handle.remove?.();
        };
      } catch {
        // Not running inside Capacitor — ignore.
      }
    })();
    return () => {
      unsub?.();
    };
  }, [user?.id, syncFromStore]);

  // Realtime: keep order_count in sync after inserts
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`sub-rt-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${user.id}`,
        },
        (p) => setSub(p.new as SubscriptionRow),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  const plan: Plan = (sub?.plan as Plan) ?? "free";
  const activeBillingPlan: BillingPlan | null = sub?.provider_product_id?.includes("annual")
    ? "annual"
    : sub?.provider_product_id?.includes("monthly") || sub?.provider_product_id?.includes("yearly")
      ? "monthly"
      : null;
  const isPeriodActive =
    !sub?.current_period_end || new Date(sub.current_period_end).getTime() > Date.now();
  const isPro = plan === "pro" && (sub?.status ?? "active") === "active" && isPeriodActive;
  // Lifetime never expires — no period check.
  const isLifetime = plan === "lifetime" && (sub?.status ?? "active") === "active";
  const isStarter = plan === "starter" && (sub?.status ?? "active") === "active" && isPeriodActive;
  const hasFullAccess = isPro || isLifetime;
  const limits = getPlanLimits(
    isStarter ? "starter" : isPro ? "pro" : isLifetime ? "lifetime" : "free",
  );
  const ordersUsed = sub?.order_count ?? 0;
  const ordersLimit = limits.ordersPerMonth;
  const ordersRemaining = Math.max(0, ordersLimit - ordersUsed);
  const productsUsed = sub?.inventory_created_total ?? 0;
  const productsLimit = limits.inventory;
  const productsRemaining = Math.max(0, productsLimit - productsUsed);

  const showUpgrade = (reason?: string) => {
    setUpgradeReason(reason ?? "");
    setUpgradeOpen(true);
  };
  const hideUpgrade = () => setUpgradeOpen(false);

  return (
    <SubCtx.Provider
      value={{
        sub,
        plan,
        isPro,
        isStarter,
        isLifetime,
        hasFullAccess,
        loading,
        ordersUsed,
        ordersLimit,
        ordersRemaining,
        productsUsed,
        productsLimit,
        productsRemaining,
        activeBillingPlan,
        refresh,
        syncFromStore,
        showUpgrade,
        hideUpgrade,
        upgradeOpen,
        upgradeReason,
      }}
    >
      {children}
    </SubCtx.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubCtx);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}
