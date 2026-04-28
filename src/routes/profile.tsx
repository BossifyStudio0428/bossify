import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, LogOut } from "lucide-react";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

const businessStats = [
  { label: "Orders", value: "156" },
  { label: "Revenue", value: "RM 4,820" },
  { label: "Customers", value: "38" },
];

const menu: { icon: string; label: string; value?: string }[] = [
  { icon: "🏪", label: "Business Profile" },
  { icon: "🔔", label: "Notifications" },
  { icon: "🌐", label: "Language", value: "中文 / BM / EN" },
  { icon: "💳", label: "Subscription Plan" },
  { icon: "📲", label: "WhatsApp Integration" },
  { icon: "🔒", label: "Privacy & Security" },
];

const isFreePlan = false;

function ProfilePage() {
  return (
    <div className="px-5 pt-10 pb-6 space-y-6">
      {/* Header */}
      <header className="flex flex-col items-center text-center">
        <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-3xl font-bold shadow-[var(--shadow-soft)]">
          KS
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
          Kak Siti's Bakery
        </h1>
        <span className="mt-2 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          Pro Plan ✦
        </span>
        <p className="mt-2 text-xs text-muted-foreground">Member since April 2026</p>
      </header>

      {/* Business stats */}
      <section className="grid grid-cols-3 gap-2">
        {businessStats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-3 text-center"
          >
            <p className="text-base font-bold text-foreground">{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">
              {s.label}
            </p>
          </div>
        ))}
      </section>

      {/* Menu */}
      <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60 overflow-hidden">
        {menu.map((m) => (
          <button
            key={m.label}
            type="button"
            className="w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50 active:bg-muted"
          >
            <span className="text-lg w-6 text-center">{m.icon}</span>
            <span className="flex-1 text-sm font-medium text-foreground">{m.label}</span>
            {m.value && (
              <span className="text-xs text-muted-foreground">{m.value}</span>
            )}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </section>

      {/* Upgrade banner — hidden because user is on Pro */}
      {isFreePlan && (
        <section className="rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-5 shadow-[var(--shadow-soft)]">
          <p className="text-base font-bold">Upgrade to Pro</p>
          <p className="text-xs opacity-90 mt-1">
            Unlock unlimited orders & WhatsApp reminders
          </p>
          <button className="mt-4 px-4 py-2 rounded-xl bg-white text-primary text-sm font-semibold active:scale-95 transition-transform">
            Upgrade Now
          </button>
        </section>
      )}

      {/* Logout */}
      <button
        type="button"
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-red-500 active:scale-[0.99] transition-transform"
      >
        <LogOut className="h-4 w-4" />
        Log Out
      </button>

      <Link
        to="/"
        className="block text-center text-xs text-muted-foreground underline"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
