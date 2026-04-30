import { Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Home, ClipboardList, Plus, Package, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { I18nProvider, useI18n } from "@/contexts/I18nContext";
import { Toaster } from "@/components/ui/sonner";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { UpgradeModal } from "@/components/UpgradeModal";

const tabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/customers", label: "Customers", icon: Users },
] as const;

export function AppShell() {
  return (
    <I18nProvider>
      <AuthProvider>
        <SubscriptionProvider>
          <ShellInner />
          <UpgradeModal />
          <Toaster position="top-center" richColors closeButton />
        </SubscriptionProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

function ShellInner() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { t } = useI18n();

  const isAuthRoute = location.pathname === "/auth";
  const isOnboardingRoute = location.pathname === "/onboarding";
  const isSplashRoute = location.pathname === "/splash";
  const isLanguageRoute = location.pathname === "/language";
  const isPublicFlow = isSplashRoute || isLanguageRoute;

  // Splash gate — first visit goes to /splash
  const [splashShown, setSplashShown] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return sessionStorage.getItem("bossify_splash_shown") === "1";
  });
  useEffect(() => {
    if (isSplashRoute) {
      sessionStorage.setItem("bossify_splash_shown", "1");
      setSplashShown(true);
    }
  }, [isSplashRoute]);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

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
    if (loading) return;
    if (!splashShown) {
      navigate({ to: "/splash" });
      return;
    }
    if (isPublicFlow) return;
    if (!session && !isAuthRoute) {
      navigate({ to: "/auth" });
      return;
    }
    if (session && isAuthRoute) {
      navigate({ to: "/" });
      return;
    }
    if (session && onboardingChecked) {
      if (needsOnboarding && !isOnboardingRoute) navigate({ to: "/onboarding" });
      if (!needsOnboarding && isOnboardingRoute) navigate({ to: "/" });
    }
  }, [session, loading, isAuthRoute, isOnboardingRoute, isPublicFlow, splashShown, onboardingChecked, needsOnboarding, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-sm text-muted-foreground">
        <span className="opacity-0">·</span>
      </div>
    );
  }

  if (isPublicFlow || isAuthRoute || isOnboardingRoute || !session) {
    return <Outlet />;
  }

  const isActive = (to: string) =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  return (
    <div className="min-h-screen w-full bg-background flex justify-center">
      <div className="relative w-full max-w-[390px] min-h-screen bg-background flex flex-col">
        {/* Top header with Bossify icon */}
        <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border/40">
          <div className="flex items-center gap-2 px-5 h-12">
            <img src="/assets/bossify-logo.png" alt="Bossify" className="h-7 w-7 object-contain" />
            <span className="text-[13px] font-bold text-foreground tracking-tight">Bossify</span>
          </div>
        </header>
        <main key={location.pathname} className="flex-1 pb-28 animate-fade-in">
          <Outlet />
        </main>

        {/* Bottom nav */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] z-40">
          <div className="relative mx-3 mb-3 rounded-3xl bg-card border border-border/60 shadow-[var(--shadow-card)]">
            <ul className="grid grid-cols-5 items-center h-16 px-2">
              {tabs.slice(0, 2).map((t) => (
                <NavItem key={t.to} {...t} active={isActive(t.to)} />
              ))}
              <li className="flex justify-center">
                <Link
                  to="/new-order"
                  aria-label="New Order"
                  className={`-mt-10 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-[var(--shadow-soft)] ring-4 ring-background transition-transform active:scale-95 ${
                    isActive("/new-order") ? "scale-105" : ""
                  }`}
                >
                  <Plus className="h-7 w-7" strokeWidth={2.5} />
                </Link>
              </li>
              {tabs.slice(2).map((t) => (
                <NavItem key={t.to} {...t} active={isActive(t.to)} />
              ))}
            </ul>
          </div>
        </nav>
      </div>
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <li>
      <Link
        to={to}
        className={`flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors relative ${
          active ? "text-primary" : "text-muted-foreground"
        }`}
      >
        <Icon className={`h-5 w-5 transition-transform ${active ? "scale-110" : ""}`} />
        <span>{label}</span>
        {active && (
          <span className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-primary" />
        )}
      </Link>
    </li>
  );
}