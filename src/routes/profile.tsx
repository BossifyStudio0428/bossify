import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, LogOut, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type Lang } from "@/contexts/I18nContext";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

const LANG_INFO: Record<Lang, { flag: string; label: string }> = {
  en: { flag: "🇬🇧", label: "English" },
  ms: { flag: "🇲🇾", label: "Bahasa Melayu" },
  zh: { flag: "🇨🇳", label: "简体中文" },
};

function ProfilePage() {
  const { user, signOut } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ orders: 0, revenue: 0, customers: 0 });
  const [profile, setProfile] = useState<{ business_name: string | null; plan: string | null; created_at: string } | null>(null);
  const [langOpen, setLangOpen] = useState(false);

  const menu: { icon: string; key: string; label: string; value?: string; onClick?: () => void }[] = [
    { icon: "🏪", key: "biz", label: t("business_profile") },
    { icon: "🔔", key: "notif", label: t("notifications") },
    { icon: "🌐", key: "lang", label: t("language"), value: `${LANG_INFO[lang].flag} ${LANG_INFO[lang].label}`, onClick: () => setLangOpen(true) },
    { icon: "💳", key: "sub", label: t("subscription") },
    { icon: "📲", key: "wa", label: t("whatsapp") },
    { icon: "🔒", key: "priv", label: t("privacy") },
  ];

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: o }, { count: cust }, { data: p }] = await Promise.all([
        supabase.from("orders").select("amount,status"),
        supabase.from("customers").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("business_name,plan,created_at").eq("id", user.id).maybeSingle(),
      ]);
      const orders = o ?? [];
      const revenue = orders.filter((x: any) => x.status === "Paid").reduce((s: number, x: any) => s + Number(x.amount), 0);
      setStats({ orders: orders.length, revenue, customers: cust ?? 0 });
      setProfile(p as any);
    })();
  }, [user]);

  const businessName = profile?.business_name ?? user?.email?.split("@")[0] ?? "My Store";
  const initials = businessName.slice(0, 2).toUpperCase();
  const plan = profile?.plan ?? "Free Plan";
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(lang === "zh" ? "zh-CN" : lang === "ms" ? "ms-MY" : "en-MY", { month: "long", year: "numeric" })
    : "—";

  const businessStats = [
    { label: t("orders"), value: String(stats.orders) },
    { label: t("revenue"), value: `RM ${stats.revenue.toFixed(0)}` },
    { label: t("customers"), value: String(stats.customers) },
  ];

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="px-5 pt-10 pb-6 space-y-6">
      <header className="flex flex-col items-center text-center">
        <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-3xl font-bold shadow-[var(--shadow-soft)]">
          {initials}
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{businessName}</h1>
        <span className="mt-2 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary">
          {plan} ✦
        </span>
        <p className="mt-2 text-xs text-muted-foreground">Member since {memberSince}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{user?.email}</p>
      </header>

      <section className="grid grid-cols-3 gap-2">
        {businessStats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-3 text-center">
            <p className="text-base font-bold text-foreground">{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60 overflow-hidden">
        {menu.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={m.onClick}
            className="w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50 active:bg-muted"
          >
            <span className="text-lg w-6 text-center">{m.icon}</span>
            <span className="flex-1 text-sm font-medium text-foreground">{m.label}</span>
            {m.value && <span className="text-xs text-muted-foreground">{m.value}</span>}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </section>

      <button
        type="button"
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-red-500 active:scale-[0.99] transition-transform"
      >
        <LogOut className="h-4 w-4" />
        {t("logout")}
      </button>

      <Link to="/" className="block text-center text-xs text-muted-foreground underline">
        {t("back_to_dashboard")}
      </Link>

      {langOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in"
          onClick={() => setLangOpen(false)}
        >
          <div
            className="w-full max-w-[390px] bg-card rounded-t-3xl p-5 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-muted" />
            <p className="text-sm font-semibold text-foreground py-2">{t("language")}</p>
            {(Object.keys(LANG_INFO) as Lang[]).map((code) => {
              const sel = lang === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => { setLang(code); setLangOpen(false); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all ${sel ? "bg-primary/10 border-primary" : "bg-card border-border/60"}`}
                >
                  <span className="text-xl">{LANG_INFO[code].flag}</span>
                  <span className="flex-1 text-left text-sm font-medium text-foreground">{LANG_INFO[code].label}</span>
                  {sel && <Check className="h-4 w-4 text-primary" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
