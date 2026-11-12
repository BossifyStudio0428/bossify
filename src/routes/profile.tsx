import { isPaidStatus } from "@/lib/orderMath";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronRight, LogOut, Check, Store, Package, Wrench, BarChart3,
  UtensilsCrossed, ChefHat, Tag, Link2, Bike, Calendar, Settings, Bell,
  Users, Globe, Smartphone, Lock, Trash2, type LucideIcon,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { safeLocalStorage, safeSessionStorage } from "@/lib/safeStorage";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type Lang } from "@/contexts/I18nContext";
import { toast } from "sonner";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Sparkles, Sun, Moon } from "lucide-react";
import {
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { loadPaymentSummary, type PaymentSummary } from "@/lib/paymentSetup";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { BIZ_TYPES, hasInventory, pofSectionTitleKey } from "@/lib/businessType";
import { RETAIL_ONLY_MODE, HIDE_BOOKING_MENU, HIDE_ORDER_FORM, HIDE_TEAM_PLAN, HIDE_ANALYTICS_MENU } from "@/lib/featureFlags";
import { VISIBLE_PLATFORMS } from "@/lib/platforms";
import { PlatformIcon } from "@/components/PlatformIcon";
import { getPlatformConnection } from "@/lib/platformConnect.functions";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

const LANG_INFO: Record<Lang, { flag: string; label: string }> = {
  en: { flag: "🇬🇧", label: "English" },
  ms: { flag: "🇲🇾", label: "Bahasa Melayu" },
  zh: { flag: "🇨🇳", label: "简体中文" },
};

const API_ORIGIN = "https://tanstack-start-app.bossifystudio.workers.dev";
const isNative = Capacitor.isNativePlatform();

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type ProfileSummary = {
  business_name: string | null;
  created_at: string;
  avatar_url: string | null;
  is_admin: boolean | null;
};

type OrderSummary = { amount: number | string | null; status: string | null };

function ProfilePage() {
  const { user, signOut } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const { isPro, isStarter, isLifetime, isTeam, teamTier, hasFullAccess, ordersUsed, ordersLimit, showUpgrade } =
    useSubscription();
  const { type: bizType, subType: bizSubType } = useBusinessType();
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState({ orders: 0, revenue: 0, customers: 0 });
  const [profile, setProfile] = useState<Omit<ProfileSummary, "is_admin"> | null>(null);
  const [connectedPlatforms, setConnectedPlatforms] = useState<Record<string, boolean>>({});
  const [langOpen, setLangOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("business");
  const [paySummary, setPaySummary] = useState<PaymentSummary | null>(null);

  const getConnection = useServerFn(getPlatformConnection);

  const reportsLabelKey =
    bizType === "education"
      ? "rep_case_reports"
      : bizType === "beauty"
        ? "rep_appointment_reports"
        : bizType === "property"
          ? "rep_lead_reports"
          : bizType === "freelance"
            ? "rep_project_reports"
            : "sales_reports";
  const analyticsLabelKey =
    bizType === "education"
      ? "edu_insights"
      : bizType === "beauty" || bizType === "freelance"
        ? "client_analytics"
        : bizType === "property"
          ? "followup_analytics"
          : "analytics_label";

  const menuTop: {
    icon: LucideIcon;
    key: string;
    label: string;
    value?: string;
    onClick?: () => void;
  }[] = [
    {
      icon: Store,
      key: "biz",
      label: t("business_profile"),
      onClick: () => navigate({ to: "/business-profile" }),
    },
  ];

  type MenuItem = { icon: LucideIcon; key: string; label: string; value?: string; onClick?: () => void };
  type MenuSection = { key: string; title: string; emoji: LucideIcon; items: MenuItem[] };

  const servicesItem: MenuItem | null = !hasInventory(bizType)
    ? {
        icon: bizType === "property" ? Package : Wrench,
        key: "services",
        label: t(bizType === "property" ? "packages_title" : "services_title"),
        onClick: () => navigate({ to: "/services" }),
      }
    : null;

  const sections: MenuSection[] = [
    {
      key: "business",
      title: t("section_business"),
      emoji: BarChart3,
      items: [
        ...(servicesItem ? [servicesItem] : []),
        ...(bizType === "fnb" && bizSubType === "restaurant"
          ? [
              {
                icon: UtensilsCrossed,
                key: "tables",
                label: t("manage_tables"),
                onClick: () => navigate({ to: "/tables" }),
              } as MenuItem,
              {
                icon: ChefHat,
                key: "dinein",
                label: t("dine_in"),
                onClick: () => navigate({ to: "/dine-in" }),
              } as MenuItem,
            ]
          : []),
        ...(RETAIL_ONLY_MODE
          ? []
          : [
              {
                icon: Tag,
                key: "biztype",
                label: t("business_type_menu"),
                value: bizType ? t(BIZ_TYPES.find((b) => b.key === bizType)!.nameKey) : "—",
                onClick: () => navigate({ to: "/business-type", search: { from: "profile" } }),
              } as MenuItem,
            ]),
        ...(HIDE_ORDER_FORM
          ? []
          : [
              {
                icon: Link2,
                key: "orderform",
                label: t(pofSectionTitleKey(bizType)),
                onClick: () => navigate({ to: "/order-form" }),
              } as MenuItem,
            ]),
        ...((!HIDE_ORDER_FORM && (bizType === "retail" || bizType === "fnb"))
          ? [
              {
                icon: Bike,
                key: "delivery",
                label: t("delivery_settings_menu"),
                onClick: () => navigate({ to: "/delivery-settings" }),
              } as MenuItem,
            ]
          : []),
        ...(HIDE_BOOKING_MENU
          ? []
          : [
              {
                icon: Calendar,
                key: "bookings",
                label: t("bookings"),
                onClick: () => navigate({ to: "/bookings" }),
              } as MenuItem,
              {
                icon: Settings,
                key: "bookingsettings",
                label: t("booking_settings"),
                onClick: () => navigate({ to: "/booking-settings" }),
              } as MenuItem,
            ]),
        ...(HIDE_ANALYTICS_MENU
          ? []
          : [{
              icon: BarChart3,
              key: "analytics",
              label: t(analyticsLabelKey),
              onClick: () => navigate({ to: "/analytics" }),
            } as MenuItem]),
      ],
    },
    {
      key: "notifications",
      title: t("section_notifications"),
      emoji: Bell,
      items: [
        {
          icon: Bell,
          key: "notif2",
          label: t("notifications"),
          onClick: () => navigate({ to: "/notifications" }),
        },
        {
          icon: Settings,
          key: "notifsettings",
          label: t("notification_settings"),
          onClick: () => navigate({ to: "/notification-settings" }),
        },
      ],
    },
    {
      key: "account",
      title: t("section_account"),
      emoji: Users,
      items: [
        {
          icon: Globe,
          key: "lang",
          label: t("language"),
          value: `${LANG_INFO[lang].flag} ${LANG_INFO[lang].label}`,
          onClick: () => setLangOpen(true),
        },
        {
          icon: Smartphone,
          key: "devices",
          label: t("my_devices"),
          onClick: () => navigate({ to: "/devices" }),
        },
      ],
    },
    ...(!HIDE_TEAM_PLAN && isTeam
      ? [
          {
            key: "team",
            title: t("section_team"),
            emoji: Users,
            items: [
              {
                icon: Users,
                key: "myteam",
                label: t("team_my_team"),
                onClick: () => navigate({ to: "/team" }),
              },
            ],
          } as MenuSection,
        ]
      : []),
    {
      key: "integrations",
      title: t("section_integrations"),
      emoji: Link2,
      items: [],
    },
    {
      key: "advanced",
      title: t("section_advanced"),
      emoji: Settings,
      items: [
        { icon: Lock, key: "priv", label: t("privacy"), onClick: () => navigate({ to: "/privacy" }) },
        {
          icon: Trash2,
          key: "deldata",
          label: t("data_deletion"),
          onClick: () => navigate({ to: "/data-deletion" }),
        },
        ...(isAdmin
          ? [
              {
                icon: Settings,
                key: "admin",
                label: t("admin_panel"),
                value: "PRO",
                onClick: () => navigate({ to: "/admin" }),
              } as MenuItem,
            ]
          : []),
      ],
    },
  ];

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadPlatformStatuses = async () => {
      const entries = await Promise.all(
        VISIBLE_PLATFORMS.map(async (p) => {
          try {
            if (isNative) {
              const headers = await getAuthHeader();
              const res = await fetch(
                `${API_ORIGIN}/api/platforms/connect?platform=${encodeURIComponent(p.key)}`,
                { headers },
              );
              const j = await res.json();
              return [p.key, j?.connection?.status === "active"] as const;
            } else {
              const { connection } = await getConnection({
                data: { platform: p.key as any },
              });
              return [p.key, (connection as any)?.status === "active"] as const;
            }
          } catch {
            return [p.key, false] as const;
          }
        }),
      );
      if (!cancelled) setConnectedPlatforms(Object.fromEntries(entries));
    };

    const load = async () => {
      const [{ data: o }, { count: cust }, { data: p }] = await Promise.all([
        supabase.from("orders").select("amount,status").eq("user_id", user.id),
        supabase
          .from("customers")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("profiles")
          .select("business_name,created_at,is_admin,avatar_url")
          .eq("id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const orders = (o ?? []) as OrderSummary[];
      const revenue = orders
        .filter((x) => isPaidStatus(x.status))
        .reduce((s, x) => s + Number(x.amount), 0);
      setStats({ orders: orders.length, revenue, customers: cust ?? 0 });
      const loadedProfile = p as ProfileSummary | null;
      setProfile(loadedProfile);
      setIsAdmin(!!loadedProfile?.is_admin);
      loadPlatformStatuses();
      try {
        const s = await loadPaymentSummary(user.id);
        if (!cancelled) setPaySummary(s);
      } catch {
        if (!cancelled) setPaySummary({ hasMethod: false, type: null, number: null });
      }
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const ch = supabase
      .channel("profile-stats-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      supabase.removeChannel(ch);
    };
  }, [user]);

  const businessName = profile?.business_name ?? user?.email?.split("@")[0] ?? t("my_store");
  const initials = businessName.slice(0, 2).toUpperCase();
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(
        lang === "zh" ? "zh-CN" : lang === "ms" ? "ms-MY" : "en-MY",
        { month: "long", year: "numeric" },
      )
    : "—";

  const businessStats = [
    { label: t("orders"), value: String(stats.orders) },
    { label: t("revenue"), value: `RM ${stats.revenue.toFixed(0)}` },
    { label: t("customers"), value: String(stats.customers) },
  ];

  const handleLogout = async () => {
    await signOut();
    if (typeof window !== "undefined") {
      safeLocalStorage.removeItem("bossify_lang");
      safeSessionStorage.removeItem("bossify_seen_splash");
    }
    navigate({ to: "/language", replace: true });
  };

  return (
    <div className="px-5 pt-10 pb-6 space-y-6 lg:max-w-6xl lg:mx-auto lg:px-8 lg:pt-8">
      <div className="lg:hidden space-y-6">
      <header className="flex flex-col items-center text-center">
        <div className="h-24 w-24 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-3xl font-bold shadow-[var(--shadow-soft)] overflow-hidden">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{businessName}</h1>
        <span
          className={`mt-2 text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${isLifetime ? "bg-amber-500 text-white" : isTeam ? "bg-violet-500 text-white" : isPro ? "bg-primary text-primary-foreground" : isStarter ? "bg-sky-500 text-white" : "bg-muted text-muted-foreground"}`}
        >
          {isLifetime ? (
            t("plan_badge_lifetime")
          ) : isTeam && teamTier ? (
            t(`plan_badge_${teamTier}` as any)
          ) : isPro ? (
            <>
              {t("pro_plan")} <Sparkles className="h-3 w-3" />
            </>
          ) : isStarter ? (
            t("plan_badge_starter")
          ) : (
            t("free_plan")
          )}
        </span>
        {!hasFullAccess && (
          <button
            onClick={() => navigate({ to: "/plans" })}
            className="mt-2 text-[11px] text-primary font-semibold underline"
          >
            {t("orders_used").replace("{x}", String(ordersUsed)).replace("{limit}", String(ordersLimit))} → {t("upgrade_to_pro")}
          </button>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {t("member_since_label")} {memberSince}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">{user?.email}</p>
      </header>

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

      {/* Payment Details status card — top of menu so it's hard to miss */}
      <button
        type="button"
        onClick={() => navigate({ to: "/payment-details" })}
        id="tour-payment-card"
        className={`w-full rounded-2xl border p-4 flex items-center gap-3 text-left active:scale-[0.99] transition ${
          paySummary?.hasMethod
            ? "bg-emerald-50 border-emerald-500/30"
            : "bg-amber-50 border-amber-500/30"
        }`}
      >
        <div
          className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${
            paySummary?.hasMethod
              ? "bg-emerald-500/15 text-emerald-700"
              : "bg-amber-500/15 text-amber-700"
          }`}
        >
          {paySummary?.hasMethod ? (
            <CheckCircle2 className="h-6 w-6" />
          ) : (
            <AlertTriangle className="h-6 w-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-bold ${paySummary?.hasMethod ? "text-emerald-700" : "text-amber-900"}`}
          >
            {paySummary?.hasMethod ? t("payment_active") : t("payment_not_setup")}
          </p>
          {paySummary?.hasMethod ? (
            <p className="text-xs text-emerald-700/80 mt-0.5 truncate">
              {paySummary.type ?? "—"} {paySummary.number ? `· ${paySummary.number}` : ""}
            </p>
          ) : (
            <p className="text-[11px] text-amber-700 font-semibold mt-0.5 flex items-center gap-0.5">
              {t("set_up_now")} <ChevronRightIcon className="h-3 w-3" />
            </p>
          )}
        </div>
        <ChevronRightIcon
          className={`h-4 w-4 ${paySummary?.hasMethod ? "text-emerald-700" : "text-amber-700"}`}
        />
      </button>

      <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60 overflow-hidden">
        {menuTop.map((m) => (
          <button
            key={m.key}
            id={`tour-menu-${m.key}`}
            type="button"
            onClick={m.onClick}
            className="w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50 active:bg-muted"
          >
            <span className="w-6 flex items-center justify-center text-muted-foreground"><m.icon className="h-5 w-5" /></span>
            <span className="flex-1 text-sm font-medium text-foreground">{m.label}</span>
            {m.value && <span className="text-xs text-muted-foreground">{m.value}</span>}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </section>

      {sections
        .filter((sec) => sec.items.length > 0 || sec.key === "integrations")
        .map((sec) => (
        <section key={sec.key} className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <sec.emoji className="h-4 w-4 text-muted-foreground" />
            <p className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">
              {sec.title}
            </p>
          </div>
          <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60 overflow-hidden">
            {sec.items.map((m) => (
              <button
                key={m.key}
                id={`tour-menu-${m.key}`}
                type="button"
                onClick={m.onClick}
                className="w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50 active:bg-muted"
              >
                <span className="w-6 flex items-center justify-center text-muted-foreground"><m.icon className="h-5 w-5" /></span>
                <span className="flex-1 text-sm font-medium text-foreground">{m.label}</span>
                {m.value && <span className="text-xs text-muted-foreground">{m.value}</span>}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
            {sec.key === "integrations" && (
              <div className="divide-y divide-border/60">
                {VISIBLE_PLATFORMS.map((p) => {
                  const isConn = !!connectedPlatforms[p.key];
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() =>
                        navigate({
                          to: "/connected-platforms/$platform",
                          params: { platform: p.key },
                        })
                      }
                      className="w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50 active:bg-muted"
                    >
                      <PlatformIcon platform={p.key} size={32} />
                      <span className="flex-1 text-sm font-medium text-foreground">{p.name}</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                          isConn
                            ? "bg-emerald-500/15 text-emerald-700"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isConn ? t("connected") : t("not_connected")}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      ))}

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
      </div>

      {/* Desktop: Settings shell — sidebar nav + active section panel + business summary */}
      <div className="hidden lg:block space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {lang === "zh" ? "设置" : lang === "ms" ? "Tetapan" : "Settings"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {lang === "zh" ? "管理你的业务、账户和应用设置" : lang === "ms" ? "Urus perniagaan, akaun dan tetapan app anda" : "Manage your business, account, and app preferences."}
        </p>
      </div>

      {(() => {
        const desktopSections = sections
          .filter((sec) => sec.items.length > 0 || sec.key === "integrations")
          .map((sec) =>
            sec.key === "business" ? { ...sec, items: [...menuTop, ...sec.items] } : sec,
          );
        const active = desktopSections.find((s) => s.key === activeSection) ?? desktopSections[0];
        return (
          <div className="hidden lg:grid lg:grid-cols-[220px_1fr_300px] lg:gap-6 lg:items-start">
            {/* Section nav */}
            <nav className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-2 space-y-0.5">
              {desktopSections.map((sec) => (
                <button
                  key={sec.key}
                  onClick={() => setActiveSection(sec.key)}
                  className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
                    active?.key === sec.key ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/50"
                  }`}
                >
                  <sec.emoji className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="text-sm font-semibold">{sec.title}</span>
                </button>
              ))}
            </nav>

            {/* Active section panel */}
            <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60 overflow-hidden">
              {active?.items.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={m.onClick}
                  className="w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0"><m.icon className="h-4 w-4" /></span>
                  <span className="flex-1 text-sm font-medium text-foreground">{m.label}</span>
                  {m.value && <span className="text-xs text-muted-foreground">{m.value}</span>}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
              {active?.key === "integrations" && (
                <div className="divide-y divide-border/60">
                  {VISIBLE_PLATFORMS.map((p) => {
                    const isConn = !!connectedPlatforms[p.key];
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => navigate({ to: "/connected-platforms/$platform", params: { platform: p.key } })}
                        className="w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50"
                      >
                        <PlatformIcon platform={p.key} size={32} />
                        <span className="flex-1 text-sm font-medium text-foreground">{p.name}</span>
                        <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${isConn ? "bg-emerald-500/15 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                          {isConn ? t("connected") : t("not_connected")}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              )}
              {(!active?.items.length && active?.key !== "integrations") && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  {lang === "zh" ? "暂无设置项" : lang === "ms" ? "Tiada tetapan" : "Nothing here yet"}
                </p>
              )}
            </div>

            {/* Right: Business Profile summary + quick actions */}
            <div className="space-y-4">
              <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-foreground">
                    {lang === "zh" ? "业务信息" : lang === "ms" ? "Profil Perniagaan" : "Business Profile"}
                  </p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isLifetime ? "bg-amber-500 text-white" : isTeam ? "bg-violet-500 text-white" : isPro ? "bg-primary text-primary-foreground" : isStarter ? "bg-sky-500 text-white" : "bg-muted text-muted-foreground"}`}>
                    {isLifetime ? t("plan_badge_lifetime") : isTeam && teamTier ? t(`plan_badge_${teamTier}` as any) : isPro ? t("pro_plan") : isStarter ? t("plan_badge_starter") : t("free_plan")}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-base font-bold overflow-hidden shrink-0">
                    {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{businessName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{t("member_since_label")} {memberSince}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {businessStats.map((s) => (
                    <div key={s.label} className="text-center">
                      <p className="text-sm font-bold text-foreground">{s.value}</p>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4 space-y-1">
                <p className="text-sm font-bold text-foreground mb-1">
                  {lang === "zh" ? "快速操作" : lang === "ms" ? "Tindakan Pantas" : "Quick Actions"}
                </p>
                <button onClick={() => navigate({ to: "/business-profile" })} className="w-full flex items-center justify-between py-2 text-sm text-foreground hover:text-primary transition-colors">
                  {lang === "zh" ? "查看业务详情" : lang === "ms" ? "Lihat Profil Perniagaan" : "View Business Profile"} <ChevronRight className="h-4 w-4" />
                </button>
                <button onClick={() => navigate({ to: "/payment-details" })} className="w-full flex items-center justify-between py-2 text-sm text-foreground hover:text-primary transition-colors">
                  {paySummary?.hasMethod ? (lang === "zh" ? "付款方式" : lang === "ms" ? "Kaedah Pembayaran" : "Payment Details") : (lang === "zh" ? "设置收款方式" : lang === "ms" ? "Sediakan Pembayaran" : "Set Up Payment")} <ChevronRight className="h-4 w-4" />
                </button>
                <button onClick={handleLogout} className="w-full flex items-center justify-between py-2 text-sm text-red-500 hover:text-red-600 transition-colors">
                  {t("logout")} <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>

              {!paySummary?.hasMethod && (
                <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 leading-relaxed">{t("payment_not_setup")}</p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
                  onClick={() => {
                    setLang(code);
                    setLangOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all ${sel ? "bg-primary/10 border-primary" : "bg-card border-border/60"}`}
                >
                  <span className="text-xl">{LANG_INFO[code].flag}</span>
                  <span className="flex-1 text-left text-sm font-medium text-foreground">
                    {LANG_INFO[code].label}
                  </span>
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