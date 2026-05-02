import { Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Home, ClipboardList, Plus, Package, Users } from "lucide-react";
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

const tabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/customers", label: "Customers", icon: Users },
] as const;

export function AppShell() {
  // BootSplash removed entirely — splash route handles the intro.
  return (
    <I18nProvider>
      <ThemeProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <ShellInner />
            <UpgradeModal />
            <Toaster position="top-center" richColors closeButton />
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

  const locationPathname = location.pathname;
  const isLoginRoute = locationPathname === "/auth";
  const isAuthFlowRoute =
    locationPathname === "/auth" ||
    locationPathname === "/reset-password" ||
    locationPathname.startsWith("/forgot-password");
  const isOnboardingRoute = locationPathname === "/onboarding";
  const isSplashRoute = locationPathname === "/splash";
  const isLanguageRoute = locationPathname === "/language";
  const isPublicFlow = isSplashRoute || isLanguageRoute;
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // Start with the Bossify splash on the first frame. This keeps SSR/client output
  // identical and prevents the router/auth loading spinner from flashing first.
  const [showInlineSplash, setShowInlineSplash] = useState(true);

  useEffect(() => {
    if (!isSplashRoute) return;
    const t = window.setTimeout(() => {
      navigate({ to: "/language", replace: true });
    }, 3000);
    return () => window.clearTimeout(t);
  }, [isSplashRoute, navigate]);

  useEffect(() => {
    if (!session?.user) {
      setOnboardingChecked(false);
      setNeedsOnboarding(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("onboarding_responses")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      setNeedsOnboarding(!data);
      setOnboardingChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (isPublicFlow) {
      setShowInlineSplash(false);
      return;
    }
    // First-time launch → ALWAYS show splash → language flow first, even before auth resolves.
    if (typeof window !== "undefined") {
      const seenSplash = safeSessionStorage.getItem("bossify_seen_splash") === "1";
      if (!seenSplash) {
        safeSessionStorage.setItem("bossify_seen_splash", "1");
        navigate({ to: "/splash", replace: true });
        return;
      }
    }
    setShowInlineSplash(false);
    if (loading) return;
    if (!session && !isAuthFlowRoute) {
      navigate({ to: "/auth" });
      return;
    }
    const isRegistering =
      typeof window !== "undefined" &&
      safeSessionStorage.getItem("bossify_registering") === "1";
    if (session && isLoginRoute && !isRegistering) {
      navigate({ to: "/" });
      return;
    }
    if (session && onboardingChecked && !isAuthFlowRoute && !isRegistering) {
      if (needsOnboarding && !isOnboardingRoute) navigate({ to: "/onboarding" });
      if (!needsOnboarding && isOnboardingRoute) navigate({ to: "/" });
    }
  }, [session, loading, isAuthFlowRoute, isLoginRoute, isOnboardingRoute, isPublicFlow, onboardingChecked, needsOnboarding, navigate]);

  // While first-time splash is queued (or navigation hasn't completed yet), render the
  // Bossify logo immediately so the user never sees the generic loading spinner.
  if (showInlineSplash && !isPublicFlow) {
    return <BossifySplash />;
  }

  if (isPublicFlow || isAuthFlowRoute || isOnboardingRoute || !session) {
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
            <img src="/assets/bossify-logo.png" alt="Bossify" className="h-10 w-10 object-contain" />
            <span className="text-[13px] font-bold text-foreground tracking-tight">Bossify</span>
          </div>
        </header>
        <main className="flex-1 pb-28 relative overflow-x-hidden">
          <Outlet />
        </main>

        <BottomNav />
      </div>
    </div>
  );
}

const BottomNav = memo(function BottomNav() {
  return (
    <nav
      className="fixed left-1/2 -translate-x-1/2 w-full max-w-[390px] z-40"
      style={{ bottom: "max(env(safe-area-inset-bottom), 0px)" }}
    >
      <div className="relative mx-3 mb-3 rounded-3xl bg-card border border-border/60 shadow-[var(--shadow-card)]">
        <ul className="grid grid-cols-5 items-center h-16 px-2">
          {tabs.slice(0, 2).map((t) => (
            <NavItem key={t.to} {...t} />
          ))}
          <li className="flex justify-center">
            <Link
              to="/new-order"
              aria-label="New Order"
              className="-mt-10 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-[var(--shadow-soft)] ring-4 ring-background active:scale-95"
            >
              <Plus className="h-7 w-7" strokeWidth={2.5} />
            </Link>
          </li>
          {tabs.slice(2).map((t) => (
            <NavItem key={t.to} {...t} />
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
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium text-muted-foreground relative"
        activeProps={{ className: "text-primary" }}
      >
        <Icon className="h-5 w-5" />
        <span>{label}</span>
      </Link>
    </li>
  );
}
