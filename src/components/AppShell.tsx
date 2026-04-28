import { Outlet, Link, useLocation } from "@tanstack/react-router";
import { Home, ClipboardList, Plus, Package, Users } from "lucide-react";

const tabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/customers", label: "Customers", icon: Users },
] as const;

export function AppShell() {
  const location = useLocation();
  const isActive = (to: string) =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  return (
    <div className="min-h-screen w-full bg-background flex justify-center">
      <div className="relative w-full max-w-[390px] min-h-screen bg-background flex flex-col">
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