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

const tabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/customers", label: "Customers", icon: Users },
] as const;

export function AppShell() {
  const [appReady, setAppReady] = useState(false);

  if (!appReady) {
    return <BootSplash onFinish={() => setAppReady(true)} />;
  }

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

function BootSplash({ onFinish }: { onFinish: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem("bossify_splash_shown", "1");
      } catch {}
      onFinish();
    }, 2200);
    return () => clearTimeout(t);
  }, [onFinish]);

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: "#F4F3F8" }}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{
          width: 280,
          height: 280,
          background:
            "radial-gradient(circle, rgba(124,58,237,0.10) 0%, rgba(124,58,237,0) 70%)",
        }}
      />
      <div className="relative flex flex-col items-center">
        <img
          src="/assets/bossify-logo.png"
          alt="Bossify"
          width={160}
          height={160}
          className="object-contain"
          style={{
            animation:
              "splashLogo 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.1s both",
          }}
        />
        <p
          className="mt-3 text-[26px] font-extrabold tracking-tight"
          style={{ color: "#1E1333", animation: "splashText 0.4s ease-out 0.6s both" }}
        >
          Bossify
        </p>
      </div>
      <style>{`
        @keyframes splashLogo {
          0% { transform: scale(0.3); opacity: 0; }
          70% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes splashText {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
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
    if (isPublicFlow) return;
    if (!session && !isAuthFlowRoute) {
      navigate({ to: "/auth" });
      return;
    }
    const isRegistering =
      typeof window !== "undefined" &&
      sessionStorage.getItem("bossify_registering") === "1";
    if (session && isLoginRoute && !isRegistering) {
      navigate({ to: "/" });
      return;
    }
    if (session && onboardingChecked && !isAuthFlowRoute && !isRegistering) {
      if (needsOnboarding && !isOnboardingRoute) navigate({ to: "/onboarding" });
      if (!needsOnboarding && isOnboardingRoute) navigate({ to: "/" });
    }
  }, [session, loading, isAuthFlowRoute, isLoginRoute, isOnboardingRoute, isPublicFlow, onboardingChecked, needsOnboarding, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-sm text-muted-foreground">
        <span className="opacity-0">·</span>
      </div>
    );
  }

  if (isPublicFlow || isAuthFlowRoute || isOnboardingRoute || !session) {
    return (
      <div
        style={{
          position: "relative",
          overflowX: "hidden",
          width: "100%",
          minHeight: "100vh",
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
        <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border/40">
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
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] z-40">
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