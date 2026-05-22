import { Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Home, ClipboardList, Plus, Package, Users, Briefcase } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { I18nProvider, useI18n } from "@/contexts/I18nContext";
import { Toaster } from "@/components/ui/sonner";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { UpgradeModal } from "@/components/UpgradeModal";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { safeLocalStorage, safeSessionStorage } from "@/lib/safeStorage";
import { BossifySplash } from "@/components/BossifySplash";
import { getBossifySplashRemainingMs, markBossifySplashStart } from "@/lib/splashTiming";
import bossifyLogo from "@/assets/bossify-logo.png";
import { isNotifGranted } from "@/lib/notifications";
import { loadPrefs } from "@/lib/notifPrefs";
import { rescheduleAll, runUnpaidNotifyNow } from "@/lib/notifSchedule";
import { initBilling } from "@/lib/billing";
import { registerPushForUser } from "@/lib/pushRegister";
import { BusinessTypeProvider, useBusinessType } from "@/contexts/BusinessTypeContext";
import { bizKey, hasInventory } from "@/lib/businessType";

// Session-level flag — true once we've shown the cold-start splash this app
// launch. We use sessionStorage so the splash flow survives client-side
// navigations (e.g. onboarding → dashboard) without re-triggering, but a
// real cold start (process killed, app reopened, reinstall) starts fresh.
const SPLASH_SESSION_KEY = "bossify_splash_done";
const LANG_PICKED_PERSISTENT_KEY = "bossify_lang";
const ONBOARDING_DONE_KEY = "bossify_onboarding_done_session";
markBossifySplashStart();

// Kick off Google Play Billing connection at app launch so prices and the
// purchase flow are ready before the user opens the Plans page. No-op on
// web / preview.
if (typeof window !== "undefined") {
  initBilling().catch(() => {});
}

// One-time cleanup: previous builds wrote a global "onboarding done" flag to
// sessionStorage, which made brand-new signups skip onboarding because they
// inherited the previous user's flag. Wipe it on boot so the per-user
// localStorage flag becomes the single source of truth.
if (typeof window !== "undefined") {
  try {
    safeSessionStorage.removeItem(ONBOARDING_DONE_KEY);
  } catch {
    // ignore
  }
}

function hasShownSplashThisSession(): boolean {
  if (typeof window === "undefined") return false;
  return safeSessionStorage.getItem(SPLASH_SESSION_KEY) === "1";
}
function markSplashShown() {
  if (typeof window === "undefined") return;
  safeSessionStorage.setItem(SPLASH_SESSION_KEY, "1");
}
function hasPickedLanguageEver(): boolean {
  if (typeof window === "undefined") return false;
  // Persistent across cold starts; only cleared by reinstall / storage wipe.
  // The presence of `bossify_lang` means the user tapped Continue on the
  // language page (or later changed language from Profile). It is NEVER
  // written automatically on app boot.
  return !!safeLocalStorage.getItem(LANG_PICKED_PERSISTENT_KEY);
}
function hasCompletedOnboarding(userId: string): boolean {
  if (typeof window === "undefined") return false;
  // IMPORTANT: only trust a per-user flag. A global session flag would make
  // a brand-new signup inherit the previous account's "done" state and skip
  // straight to the homepage.
  return safeLocalStorage.getItem(`${ONBOARDING_DONE_KEY}:${userId}`) === "1";
}

// Hide the native Capacitor splash screen after the same duration as the
// in-app splash. Wrapped in a dynamic import + try/catch so this is safe in
// the web preview where Capacitor isn't available.
if (typeof window !== "undefined") {
  const NATIVE_SPLASH_MS = 3500;
  window.setTimeout(async () => {
    try {
      const { SplashScreen } = await import("@capacitor/splash-screen");
      await SplashScreen.hide({ fadeOutDuration: 500 });
    } catch {
      // Not running inside Capacitor — ignore.
    }
  }, NATIVE_SPLASH_MS);
}

import type { TKey } from "@/contexts/I18nContext";
type TabDef = { to: string; labelKey: TKey; icon: typeof Home; id: string };

// Routes that are part of the first-time setup / onboarding flow. The
// bottom navigation bar is hidden while the user is on any of these pages
// so they focus on completing setup before exploring the rest of the app.
const ONBOARDING_SETUP_ROUTES: readonly string[] = [
  "/onboarding",
  "/business-type",
  "/business-profile",
  "/payment-details",
  "/payment-setup",
  "/payment-success",
];

export function AppShell() {
  // BootSplash removed entirely — splash route handles the intro.
  return (
    <I18nProvider>
      <ThemeProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <BusinessTypeProvider>
              <ShellInner />
              <UpgradeModal />
              <Toaster position="bottom-center" richColors closeButton />
            </BusinessTypeProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

function ShellInner() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { t } = useI18n();

  useEffect(() => {
    document.body.classList.add("bossify-mounted");
    return () => document.body.classList.remove("bossify-mounted");
  }, []);

  const locationPathname = location.pathname;
  const isLoginRoute = locationPathname === "/auth";
  const isAuthFlowRoute =
    locationPathname === "/auth" ||
    locationPathname === "/reset-password" ||
    locationPathname.startsWith("/forgot-password") ||
    locationPathname.startsWith("/order/");
  const isOnboardingRoute = locationPathname === "/onboarding";
  const isBusinessTypeRoute = locationPathname === "/business-type";
  const isSetupFlowRoute = ONBOARDING_SETUP_ROUTES.some(
    (r) => locationPathname === r || locationPathname.startsWith(r + "/"),
  );
  const isSplashRoute = locationPathname === "/splash";
  const isLanguageRoute = locationPathname === "/language";
  // Only /language is a true "public bypass" for the language guard.
  // /splash must still respect the language gate so a user who exits the
  // app on the language screen without choosing is redirected back to it.
  const isOrderFormRoute = locationPathname.startsWith("/order/");
  const isPrivacyPolicyRoute = locationPathname === "/privacy-policy";
  const isTermsRoute = locationPathname === "/terms";
  const isPublicFlow = isSplashRoute || isLanguageRoute || isOrderFormRoute || isPrivacyPolicyRoute || isTermsRoute;
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const { type: bizType, loading: bizLoading } = useBusinessType();
  const [notifReady, setNotifReady] = useState(false);

  // Start with the Bossify splash on the first frame of every cold start.
  const [showInlineSplash, setShowInlineSplash] = useState(true);

  useEffect(() => {
    if (!isSplashRoute) return;
    const remainingMs = getBossifySplashRemainingMs();
    const t = window.setTimeout(() => {
      navigate({ to: "/language", replace: true });
    }, remainingMs);
    return () => window.clearTimeout(t);
  }, [isSplashRoute, navigate]);

  useEffect(() => {
    if (!session?.user) {
      setOnboardingChecked(false);
      setNeedsOnboarding(false);
      return;
    }
    if (hasCompletedOnboarding(session.user.id)) {
      setNeedsOnboarding(false);
      setOnboardingChecked(true);
      return;
    }
    let cancelled = false;
    const failOpenTimer = window.setTimeout(() => {
      if (cancelled) return;
      console.error("onboarding check timed out");
      setNeedsOnboarding(false);
      setOnboardingChecked(true);
    }, 5000);
    (async () => {
      const { data, error } = await supabase
        .from("onboarding_responses")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      window.clearTimeout(failOpenTimer);
      if (error) {
        console.error("onboarding check failed", error);
        setNeedsOnboarding(false);
        setOnboardingChecked(true);
        return;
      }
      setNeedsOnboarding(!data);
      setOnboardingChecked(true);
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(failOpenTimer);
    };
  }, [session?.user?.id]);

  useEffect(() => {
    // Language gate runs FIRST and applies to every route except /language
    // itself. Even on /splash we redirect immediately if the user has not
    // tapped Continue on the language page yet.
    if (!isLanguageRoute && !isOrderFormRoute && !isPrivacyPolicyRoute && !isTermsRoute && !hasPickedLanguageEver()) {
      setShowInlineSplash(false);
      navigate({ to: "/language", replace: true });
      return;
    }
    if (isPublicFlow) {
      setShowInlineSplash(false);
      return;
    }
    // Cold-start launch → ALWAYS show splash → language flow first.
    if (typeof window !== "undefined" && !hasShownSplashThisSession()) {
      markSplashShown();
      const remainingMs = getBossifySplashRemainingMs();
      const timer = window.setTimeout(() => {
        setShowInlineSplash(false);
        // Returning user (already picked language) → fall through on next
        // effect run to normal auth/home routing. No forced /language jump.
      }, remainingMs);
      return () => window.clearTimeout(timer);
    }
    setShowInlineSplash(false);
    if (loading) return;
    if (!session && !isAuthFlowRoute) {
      navigate({ to: "/auth" });
      return;
    }
    const isRegistering =
      typeof window !== "undefined" && safeSessionStorage.getItem("bossify_registering") === "1";
    if (session && isLoginRoute && !isRegistering) {
      navigate({ to: "/" });
      return;
    }
    if (session && onboardingChecked && !isAuthFlowRoute && !isRegistering) {
      const completedOnboarding = hasCompletedOnboarding(session.user.id);
      if (completedOnboarding) {
        if (needsOnboarding) setNeedsOnboarding(false);
        if (isOnboardingRoute) navigate({ to: "/", replace: true });
        // Force business-type selection once onboarding is done if profile
        // hasn't picked one yet. Don't redirect away from the page itself.
        if (!bizLoading && !bizType && !isBusinessTypeRoute && !isSetupFlowRoute) {
          navigate({ to: "/business-type", search: { from: "onboarding" }, replace: true });
        }
        return;
      }
      if (needsOnboarding && !isOnboardingRoute) navigate({ to: "/onboarding", replace: true });
      if (!needsOnboarding && isOnboardingRoute) navigate({ to: "/", replace: true });
    }
  }, [
    session,
    loading,
    isAuthFlowRoute,
    isLoginRoute,
    isOnboardingRoute,
    isBusinessTypeRoute,
    isSetupFlowRoute,
    isPublicFlow,
    isLanguageRoute,
    onboardingChecked,
    needsOnboarding,
    bizType,
    bizLoading,
    navigate,
  ]);

  // Once user is signed in past onboarding, arm the notification permission
  // prompt and run overdue check if granted.
  useEffect(() => {
    if (!session?.user || !onboardingChecked || needsOnboarding) return;
    setNotifReady(true);
    if (isNotifGranted()) {
      const uid = session.user.id;
      loadPrefs(uid)
        .then(() => rescheduleAll(uid))
        .then(() => runUnpaidNotifyNow(uid))
        .catch(() => {});
    }
    // Register Android FCM token (no-op on web / preview)
    registerPushForUser(session.user.id).catch(() => {});
  }, [session?.user?.id, onboardingChecked, needsOnboarding]);

  // While first-time splash is queued (or navigation hasn't completed yet), render the
  // Bossify logo immediately so the user never sees the generic loading spinner.
  if (showInlineSplash && !isPublicFlow) {
    return <BossifySplash />;
  }

  if (isPublicFlow || isAuthFlowRoute || isOnboardingRoute || isBusinessTypeRoute || !session) {
    return (
      <div
        style={{
          position: "relative",
          overflowX: "hidden",
          width: "100%",
          minHeight: "100vh",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background flex justify-center">
      <div className="relative w-full max-w-[390px] min-h-screen bg-background flex flex-col">
        {/* Top header with Bossify icon */}
        <header
          className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border/40"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="flex items-center gap-2 px-5 h-12">
            <img src={bossifyLogo} alt="Bossify" className="h-10 w-10 object-contain" />
            <span className="text-[13px] font-bold text-foreground tracking-tight">Bossify</span>
          </div>
        </header>
        <main className="flex-1 pb-28 relative overflow-x-hidden">
          <Outlet />
        </main>

        {!isSetupFlowRoute && <BottomNav />}
      </div>
    </div>
  );
}

const BottomNav = memo(function BottomNav() {
  const { t } = useI18n();
  const { type } = useBusinessType();
  const tabs: TabDef[] = [
    { to: "/", labelKey: "nav_home", icon: Home, id: "tour-tab-home" },
    { to: "/orders", labelKey: bizKey(type, "orders"), icon: ClipboardList, id: "tour-tab-orders" },
    ...(hasInventory(type)
      ? [{ to: "/inventory", labelKey: bizKey(type, "inventory"), icon: Package, id: "tour-tab-inventory" } as TabDef]
      : [{ to: "/services", labelKey: "nav_services", icon: Briefcase, id: "tour-tab-services" } as TabDef]),
    { to: "/customers", labelKey: bizKey(type, "customers"), icon: Users, id: "tour-tab-customers" },
  ];
  const leftCount = 2;
  return (
    <nav
      className="fixed left-1/2 -translate-x-1/2 w-full max-w-[390px] z-40"
      style={{ bottom: "max(env(safe-area-inset-bottom), 0px)" }}
    >
      <div className="relative mx-3 mb-3 rounded-3xl bg-card border border-border/60 shadow-[var(--shadow-card)]">
        <ul className="grid grid-cols-5 items-center h-16 px-1">
          {tabs.slice(0, leftCount).map((tab) => (
            <NavItem key={tab.to} to={tab.to} icon={tab.icon} label={t(tab.labelKey)} id={tab.id} />
          ))}
          <li className="flex justify-center">
            <Link
              id="tour-new-order"
              to="/new-order"
              aria-label={t(bizKey(type, "new_order"))}
              className="-mt-10 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-[var(--shadow-soft)] ring-4 ring-background active:scale-95"
            >
              <Plus className="h-7 w-7" strokeWidth={2.5} />
            </Link>
          </li>
          {tabs.slice(leftCount).map((tab) => (
            <NavItem key={tab.to} to={tab.to} icon={tab.icon} label={t(tab.labelKey)} id={tab.id} />
          ))}
        </ul>
      </div>
    </nav>
  );
});

function NavItem({
  to,
  label,
  icon: Icon,
  id,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  id?: string;
}) {
  return (
    <li id={id}>
      <Link
        to={to}
        className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] leading-tight font-medium text-muted-foreground relative truncate"
        activeProps={{ className: "text-primary" }}
      >
        <Icon className="h-[18px] w-[18px]" />
        <span className="truncate max-w-[58px] text-center">{label}</span>
      </Link>
    </li>
  );
}
