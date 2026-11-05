import { Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Home, ClipboardList, Plus, Package, Users, Briefcase, Building2, Wallet, TrendingUp, Bell as BellIcon, MoreHorizontal, ShoppingBag, HeartPulse, BarChart3, FileText, Flame, TriangleAlert, User, CreditCard, MessageCircle, ScrollText, BookOpen, Layers, Search as SearchIcon } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { I18nProvider, useI18n } from "@/contexts/I18nContext";
import { Toaster } from "@/components/ui/sonner";
import { SubscriptionProvider, useSubscription } from "@/contexts/SubscriptionContext";
import { UpgradeModal } from "@/components/UpgradeModal";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { safeLocalStorage, safeSessionStorage } from "@/lib/safeStorage";
import { BossifySplash } from "@/components/BossifySplash";
import { getBossifySplashRemainingMs, markBossifySplashStart } from "@/lib/splashTiming";
import bossifyLogo from "@/assets/bossify-logo.png";
import { isNotifGranted } from "@/lib/notifications";
import { loadPrefs } from "@/lib/notifPrefs";
import { rescheduleAll, runUnpaidNotifyNow, runLosingMoneyScanNow } from "@/lib/notifSchedule";
import { initBilling } from "@/lib/billing";
import { registerPushForUser } from "@/lib/pushRegister";
import { registerWebPush, isWebPushSupported } from "@/lib/webPush";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { BusinessTypeProvider, useBusinessType } from "@/contexts/BusinessTypeContext";
import { bizKey, hasInventory } from "@/lib/businessType";
import { RETAIL_ONLY_MODE, isArchivedRoute, HIDE_AI_CHAT_WIDGET } from "@/lib/featureFlags";
import { RetailPivotNotice } from "@/components/RetailPivotNotice";
import { AiChatWidget } from "@/components/AiChatWidget";
import { NotificationBellIcon } from "@/components/NotificationBellIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
              <Toaster
                position="bottom-center"
                richColors
                closeButton
                offset="calc(env(safe-area-inset-bottom, 0px) + 96px)"
                mobileOffset="calc(env(safe-area-inset-bottom, 0px) + 96px)"
              />
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

  // "Log in with TikTok Shop": the in-app browser (opened via
  // @capacitor/browser) redirects here as bossify://tiktok-login?...
  // once TikTok authorization completes — Android/iOS route this
  // straight into the app (closing the in-app browser automatically)
  // instead of leaving the seller stuck in a separate browser tab that
  // can't share the app's own login session.
  useEffect(() => {
    const sub = CapacitorApp.addListener("appUrlOpen", async (data: { url: string }) => {
      try {
        const url = new URL(data.url);
        if (url.protocol !== "bossify:" || url.hostname !== "tiktok-login") return;
        const email = url.searchParams.get("email");
        const code = url.searchParams.get("code");
        if (!email || !code) return;
        const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
        if (!error) {
          navigate({ to: "/" });
        }
      } catch {
        // Malformed deep link — ignore, the seller can still log in manually.
      }
    });
    return () => {
      sub.then((h) => h.remove());
    };
  }, [navigate]);

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
  const isDineRoute = locationPathname.startsWith("/dine/");
  const isTrackRoute = locationPathname.startsWith("/track/");
  const isPrivacyPolicyRoute = locationPathname === "/privacy-policy";
  const isTermsRoute = locationPathname === "/terms";
  const isWelcomeRoute = locationPathname === "/welcome";
  const isPublicFlow = isSplashRoute || isLanguageRoute || isOrderFormRoute || isDineRoute || isTrackRoute || isPrivacyPolicyRoute || isTermsRoute || isWelcomeRoute;
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
    // Web (non-native) entry point: a logged-out visitor hitting any
    // non-exempt route gets sent to the public /welcome landing page
    // first, ahead of the language gate and the splash screen. The
    // installed Android app (native platform) is unaffected and keeps
    // the original splash -> language -> auth flow, since those users
    // already chose to open the app.
    if (
      !Capacitor.isNativePlatform() &&
      !session &&
      !isWelcomeRoute &&
      !isAuthFlowRoute &&
      !isOrderFormRoute &&
      !isDineRoute &&
      !isTrackRoute &&
      !isPrivacyPolicyRoute &&
      !isTermsRoute
    ) {
      setShowInlineSplash(false);
      navigate({ to: "/welcome", replace: true });
      return;
    }
    // Language gate runs FIRST and applies to every route except /language
    // itself. Even on /splash we redirect immediately if the user has not
    // tapped Continue on the language page yet.
    if (!isLanguageRoute && !isOrderFormRoute && !isDineRoute && !isPrivacyPolicyRoute && !isTermsRoute && !isWelcomeRoute && !hasPickedLanguageEver()) {
      setShowInlineSplash(false);
      navigate({ to: "/language", replace: true });
      return;
    }
    // A signed-in user who lands on the public /welcome page (e.g. by
    // bookmark or clicking the logo) is sent straight into the app
    // instead of seeing the marketing page again.
    if (isWelcomeRoute && session) {
      setShowInlineSplash(false);
      navigate({ to: "/", replace: true });
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
    const isDeviceLimitBlocked =
      typeof window !== "undefined" && sessionStorage.getItem("bossify_device_limit_block") === "1";
    // Device limit reached at login → keep the user pinned to the auth
    // screen (which shows the DeviceLimitBlock) or /devices, where they
    // can free up a slot. Block all other in-app routes.
    if (session && isDeviceLimitBlocked) {
      if (locationPathname !== "/auth" && locationPathname !== "/devices") {
        navigate({ to: "/devices" });
      }
      return;
    }
    if (session && isLoginRoute && !isRegistering) {
      navigate({ to: "/" });
      return;
    }
    if (session && onboardingChecked && !isAuthFlowRoute && !isRegistering) {
      const completedOnboarding = hasCompletedOnboarding(session.user.id);
      if (completedOnboarding) {
        if (needsOnboarding) setNeedsOnboarding(false);
        if (isOnboardingRoute) navigate({ to: "/", replace: true });
        // Retail-only pivot: never force the business-type picker.
        // Legacy behaviour (multi-type accounts) is restored when
        // RETAIL_ONLY_MODE is flipped off.
        if (!RETAIL_ONLY_MODE && !bizLoading && !bizType && !isBusinessTypeRoute && !isSetupFlowRoute) {
          navigate({ to: "/business-type", search: { from: "onboarding" }, replace: true });
        }
        // Bounce away from archived (non-Retail) routes if a user
        // navigates or bookmarks directly to one.
        if (RETAIL_ONLY_MODE && isArchivedRoute(locationPathname)) {
          navigate({ to: "/", replace: true });
          return;
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
        .then(() => runLosingMoneyScanNow(uid))
        .catch(() => {});
    }
    // Register Android FCM token (no-op on web / preview)
    registerPushForUser(session.user.id, { force: true }).catch(() => {});
    // Register Web Push (FCM Web) token whenever the user is signed in
    // and the browser has previously granted Notification permission.
    // This is idempotent — FCM returns the same token, and the
    // device_tokens upsert dedupes by (user_id, token). Without this,
    // a user who granted permission on a previous session never gets a
    // token re-registered after the table is cleared or a fresh browser
    // session, so no web push arrives when a new order is created.
    if (
      typeof window !== "undefined" &&
      isWebPushSupported() &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      registerWebPush(session.user.id).catch(() => {});
    }
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
    <div className="min-h-screen w-full bg-background lg:flex">
      {!isSetupFlowRoute && <DesktopSidebar />}

      <div className="flex w-full flex-1 justify-center lg:block lg:min-w-0">
        <div className="relative flex min-h-screen w-full max-w-[390px] flex-col bg-background md:max-w-3xl lg:max-w-none lg:min-h-screen">
          <RetailPivotNotice />
          {/* Mobile/tablet header */}
          <header
            className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border/40 lg:hidden"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="flex items-center gap-2 px-5 h-12">
              <img src={bossifyLogo} alt="Bossify" className="h-10 w-10 object-contain" />
              <span className="text-[13px] font-bold text-foreground tracking-tight">Bossify</span>
              <NotificationBellIcon />
            </div>
          </header>

          {!isSetupFlowRoute && <DesktopTopbar />}

          <main className="flex-1 pb-28 lg:pb-0 relative overflow-x-hidden">
            <div className="lg:mx-auto lg:w-full lg:max-w-[1280px] lg:px-8 lg:py-6">
              <Outlet />
            </div>
          </main>

          {!isSetupFlowRoute && <BottomNav />}
        </div>
      </div>

      {!isSetupFlowRoute && !HIDE_AI_CHAT_WIDGET && <AiChatWidget />}
    </div>
  );
}

const BottomNav = memo(function BottomNav() {
  const { t } = useI18n();
  const { type } = useBusinessType();
  const location = useLocation();

  // Retail-only pivot: 4 equal tabs, no center FAB. Old multi-vertical
  // nav is preserved below and restored when RETAIL_ONLY_MODE is off.
  if (RETAIL_ONLY_MODE) {
    const retailTabs: TabDef[] = [
      { to: "/",         labelKey: "ro_title",        icon: Home,            id: "tour-tab-home" },
      { to: "/orders",   labelKey: "ro_open_orders",  icon: ShoppingBag,     id: "tour-tab-orders" },
      { to: "/inventory",labelKey: "ro_open_products",icon: Package,         id: "tour-tab-products" },
      { to: "/cost-breakdown", labelKey: "ro_open_cost", icon: TrendingUp,  id: "tour-tab-cost" },
      { to: "/more",     labelKey: "ro_open_more",    icon: MoreHorizontal,  id: "tour-tab-more" },
    ];
    return (
      <nav
        className="fixed left-1/2 -translate-x-1/2 w-full max-w-[390px] md:max-w-3xl lg:max-w-5xl xl:max-w-6xl z-40 lg:hidden"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <div className="relative mx-3 mb-3 rounded-3xl bg-card border border-border/60 shadow-[var(--shadow-card)]">
          <ul className="grid grid-cols-5 items-center h-16 px-1">
            {retailTabs.map((tab) => (
              <NavItem key={tab.to} to={tab.to} icon={tab.icon} label={t(tab.labelKey)} id={tab.id} />
            ))}
          </ul>
        </div>
      </nav>
    );
  }

  const tabs: TabDef[] =
    type === "property"
      ? [
          { to: "/", labelKey: "nav_home", icon: Home, id: "tour-tab-home" },
          { to: "/listings", labelKey: "nav_listings", icon: Building2, id: "tour-tab-listings" },
          { to: "/commissions", labelKey: "nav_commission", icon: Wallet, id: "tour-tab-commission" },
          { to: "/customers", labelKey: bizKey(type, "customers"), icon: Users, id: "tour-tab-customers" },
        ]
      : [
          { to: "/", labelKey: "nav_home", icon: Home, id: "tour-tab-home" },
          { to: "/orders", labelKey: bizKey(type, "orders"), icon: ClipboardList, id: "tour-tab-orders" },
          ...(hasInventory(type)
            ? [{ to: "/inventory", labelKey: bizKey(type, "inventory"), icon: Package, id: "tour-tab-inventory" } as TabDef]
            : [{ to: "/services", labelKey: "nav_services", icon: Briefcase, id: "tour-tab-services" } as TabDef]),
          { to: "/customers", labelKey: bizKey(type, "customers"), icon: Users, id: "tour-tab-customers" },
        ];
  const leftCount = 2;
  const rightTabs = tabs.slice(leftCount);
  const totalCols = leftCount + 1 + rightTabs.length;
  return (
    <nav
      className="fixed left-1/2 -translate-x-1/2 w-full max-w-[390px] md:max-w-3xl lg:max-w-5xl xl:max-w-6xl z-40 lg:hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
    >
      <div className="relative mx-3 mb-3 rounded-3xl bg-card border border-border/60 shadow-[var(--shadow-card)]">
        <ul
          className="grid items-center h-16 px-1"
          style={{ gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))` }}
        >
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
          {rightTabs.map((tab) => (
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

type NavLink = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; id?: string };

// Desktop (lg+) left sidebar. Mirrors the real information architecture of
// the mobile "More" hub (src/routes/more.tsx) — same routes, same i18n
// keys/labels — just laid out as a persistent sidebar instead of a grid of
// tappable tiles. Retail-only mode: no business-type branching needed here
// since the whole desktop shell only ships while RETAIL_ONLY_MODE is on.
const DesktopSidebar = memo(function DesktopSidebar() {
  const { t, lang } = useI18n();
  const { isPro } = useSubscription();

  const primaryLinks: NavLink[] = [
    { to: "/", label: t("ro_title"), icon: Home, id: "desktop-nav-home" },
    { to: "/orders", label: t("ro_open_orders"), icon: ShoppingBag, id: "desktop-nav-orders" },
    { to: "/inventory", label: t("ro_open_products"), icon: Package, id: "desktop-nav-inventory" },
    { to: "/cost-breakdown", label: t("ro_open_cost"), icon: TrendingUp, id: "desktop-nav-cost" },
  ];

  // Same inline per-language labels as more.tsx (kept consistent rather
  // than adding new I18nContext keys for one entry each).
  const expensesLabel = lang === "zh" ? "营业费用" : lang === "ms" ? "Perbelanjaan" : "Expenses";
  const guideSectionTitle = lang === "zh" ? "帮助" : lang === "ms" ? "Bantuan" : "Help";
  const guideLabel = lang === "zh" ? "使用教学" : lang === "ms" ? "Panduan" : "Guide";

  const sections: { title: string; items: NavLink[] }[] = [
    {
      title: t("more_section_profit"),
      items: [
        { to: "/cost-health", label: t("more_cost_health"), icon: HeartPulse },
        { to: "/product-profit", label: t("more_product_profit"), icon: TrendingUp },
        { to: "/expenses", label: expensesLabel, icon: FileText },
      ],
    },
    {
      title: t("more_section_stock"),
      items: [
        { to: "/stock", label: t("stock_title"), icon: Layers },
        { to: "/campaigns", label: t("more_campaign"), icon: Flame },
        { to: "/alerts", label: t("more_alerts"), icon: TriangleAlert },
      ],
    },
    {
      title: t("more_section_customers"),
      items: [
        { to: "/customers", label: t("more_customers"), icon: Users },
        { to: "/reports", label: t("more_reports"), icon: BarChart3 },
      ],
    },
    {
      title: t("more_section_account"),
      items: [
        { to: "/notifications", label: t("more_notifications"), icon: BellIcon },
        { to: "/profile", label: t("more_profile"), icon: User },
        { to: "/plans", label: t("more_subscription"), icon: CreditCard },
        { to: "/whatsapp-templates", label: t("more_wa_templates"), icon: MessageCircle },
        { to: "/legal", label: t("more_legal"), icon: ScrollText },
      ],
    },
    {
      title: guideSectionTitle,
      items: [{ to: "/guide", label: guideLabel, icon: BookOpen }],
    },
  ];

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-card lg:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <img src={bossifyLogo} alt="Bossify" className="h-8 w-8 object-contain" />
        <span className="text-[15px] font-bold tracking-tight text-foreground">Bossify</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-0.5">
          {primaryLinks.map((item) => (
            <SidebarLink key={item.to} {...item} />
          ))}
        </ul>

        {sections.map((section) => (
          <div key={section.title} className="mt-5">
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <SidebarLink key={item.to} {...item} />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {!isPro && (
        <div className="m-3 rounded-xl border border-border/60 bg-gradient-to-br from-primary/10 to-primary/5 p-4">
          <p className="text-[13px] font-semibold text-foreground">{t("more_subscription")}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {lang === "zh"
              ? "解锁全部报告、TikTok 同步等功能"
              : lang === "ms"
                ? "Buka semua laporan, penyegerakan TikTok dan banyak lagi"
                : "Unlock all reports, TikTok sync and more."}
          </p>
          <Link
            to="/plans"
            className="mt-3 flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {lang === "zh" ? "立即升级" : lang === "ms" ? "Naik Taraf Sekarang" : "Upgrade Now"}
          </Link>
        </div>
      )}
    </aside>
  );
});

function SidebarLink({ to, label, icon: Icon, id }: NavLink) {
  return (
    <li id={id}>
      <Link
        to={to}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium text-muted-foreground truncate transition-colors hover:bg-accent hover:text-foreground"
        activeProps={{ className: "bg-primary/10 text-primary font-semibold" }}
        activeOptions={{ exact: to === "/" }}
      >
        <Icon className="h-[17px] w-[17px] shrink-0" />
        <span className="truncate">{label}</span>
      </Link>
    </li>
  );
}

// Desktop (lg+) top bar: real search (routes to the existing /search page —
// no fake/decorative input), a New Order shortcut, the same notification
// bell used on mobile, and a profile menu backed by the real auth session.
const DesktopTopbar = memo(function DesktopTopbar() {
  const { t, lang } = useI18n();
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-30 hidden items-center gap-3 border-b border-border/60 bg-background/90 px-6 py-3 backdrop-blur lg:flex">
      <Link
        to="/search"
        className="flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:border-primary/40"
      >
        <SearchIcon className="h-4 w-4 shrink-0" />
        <span className="truncate">
          {lang === "zh"
            ? "搜索订单、商品、客户…"
            : lang === "ms"
              ? "Cari pesanan, produk, pelanggan…"
              : "Search orders, products, customers…"}
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-2">
        <Link
          to="/new-order"
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          {lang === "zh" ? "新订单" : lang === "ms" ? "Pesanan Baharu" : "New Order"}
        </Link>

        <NotificationBellIcon />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground"
              aria-label={t("more_profile")}
            >
              {initials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem asChild>
              <Link to="/profile">{t("more_profile")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/plans">{t("more_subscription")}</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                signOut().then(() => navigate({ to: "/auth" }));
              }}
            >
              {lang === "zh" ? "登出" : lang === "ms" ? "Log Keluar" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
});
