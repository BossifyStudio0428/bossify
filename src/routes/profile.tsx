import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, LogOut, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { safeLocalStorage, safeSessionStorage } from "@/lib/safeStorage";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type Lang } from "@/contexts/I18nContext";
import { toast } from "sonner";
import {
  DEFAULT_ORDER_TPL,
  DEFAULT_REMINDER_TPL,
  getOrderTemplate,
  getReminderTemplate,
  isBuiltInOrderTpl,
  isBuiltInReminderTpl,
} from "@/lib/wa";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Sparkles, Sun, Moon } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import {
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { loadPaymentSummary, type PaymentSummary } from "@/lib/paymentSetup";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { BIZ_TYPES, hasInventory, pofSectionTitleKey } from "@/lib/businessType";
import { PLATFORMS } from "@/lib/platforms";
import { PlatformIcon } from "@/components/PlatformIcon";
import { isNativeBillingAvailable } from "@/lib/billing";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

const LANG_INFO: Record<Lang, { flag: string; label: string }> = {
  en: { flag: "🇬🇧", label: "English" },
  ms: { flag: "🇲🇾", label: "Bahasa Melayu" },
  zh: { flag: "🇨🇳", label: "简体中文" },
};

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
  const { theme, toggle: toggleTheme } = useTheme();
  const { type: bizType } = useBusinessType();
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState({ orders: 0, revenue: 0, customers: 0 });
  const [profile, setProfile] = useState<Omit<ProfileSummary, "is_admin"> | null>(null);
  const [connectedPlatforms, setConnectedPlatforms] = useState<Record<string, boolean>>({});
  const [langOpen, setLangOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const defaultOrderTpl = getOrderTemplate(lang, bizType);
  const defaultReminderTpl = getReminderTemplate(lang, bizType);

  const varsHelp = (() => {
    const base = "[customer_name] [code] [product] [amount]";
    const status = " [status]";
    const qty = " [quantity]";
    const tail = " [notes] [days_ago]";
    const list =
      bizType === "property"
        ? `${base}${tail}`
        : bizType === "retail" || bizType === "fnb" || !bizType
          ? `${base}${qty}${status}${tail}`
          : `${base}${status}${tail}`;
    const prefix = lang === "ms" ? "Pemboleh ubah: " : lang === "zh" ? "变量：" : "Variables: ";
    return `${prefix}${list}`;
  })();
  const [orderTpl, setOrderTpl] = useState<string>(DEFAULT_ORDER_TPL);
  const [reminderTpl, setReminderTpl] = useState<string>(DEFAULT_REMINDER_TPL);
  const [orderCustom, setOrderCustom] = useState(false);
  const [reminderCustom, setReminderCustom] = useState(false);

  // Keep textarea in sync with biz-type / lang default when user hasn't customised.
  useEffect(() => {
    if (!orderCustom) setOrderTpl(defaultOrderTpl);
    if (!reminderCustom) setReminderTpl(defaultReminderTpl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizType, lang]);
  const [paySummary, setPaySummary] = useState<PaymentSummary | null>(null);

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
    icon: string;
    key: string;
    label: string;
    value?: string;
    onClick?: () => void;
  }[] = [
    {
      icon: "🏪",
      key: "biz",
      label: t("business_profile"),
      onClick: () => navigate({ to: "/business-profile" }),
    },
  ];

  type MenuItem = { icon: string; key: string; label: string; value?: string; onClick?: () => void };
  type MenuSection = { key: string; title: string; emoji: string; items: MenuItem[] };

  const servicesItem: MenuItem | null = !hasInventory(bizType)
    ? {
        icon: bizType === "property" ? "📦" : "🧰",
        key: "services",
        label: t(bizType === "property" ? "packages_title" : "services_title"),
        onClick: () => navigate({ to: "/services" }),
      }
    : null;

  const sections: MenuSection[] = [
    {
      key: "business",
      title: t("section_business"),
      emoji: "📊",
      items: [
        ...(servicesItem ? [servicesItem] : []),
        ...(bizType === "fnb"
          ? [
              {
                icon: "🍽️",
                key: "tables",
                label: t("manage_tables"),
                onClick: () => navigate({ to: "/tables" }),
              } as MenuItem,
              {
                icon: "🧑‍🍳",
                key: "dinein",
                label: t("dine_in"),
                onClick: () => navigate({ to: "/dine-in" }),
              } as MenuItem,
            ]
          : []),
        {
          icon: BIZ_TYPES.find((b) => b.key === bizType)?.emoji ?? "🏷️",
          key: "biztype",
          label: t("business_type_menu"),
          value: bizType ? t(BIZ_TYPES.find((b) => b.key === bizType)!.nameKey) : "—",
          onClick: () => navigate({ to: "/business-type", search: { from: "profile" } }),
        },
        {
          icon: "🔗",
          key: "orderform",
          label: t(pofSectionTitleKey(bizType)),
          onClick: () => navigate({ to: "/order-form" }),
        },
        ...((bizType === "retail" || bizType === "fnb")
          ? [
              {
                icon: "🛵",
                key: "delivery",
                label: "Delivery Settings",
                onClick: () => navigate({ to: "/delivery-settings" }),
              } as MenuItem,
            ]
          : []),
        {
          icon: "📊",
          key: "analytics",
          label: t(analyticsLabelKey),
          onClick: () => navigate({ to: "/analytics" }),
        },
        {
          icon: "📊",
          key: "rep",
          label: t(reportsLabelKey),
          onClick: () => navigate({ to: "/reports" }),
        },
      ],
    },
    {
      key: "notifications",
      title: t("section_notifications"),
      emoji: "🔔",
      items: [
        {
          icon: "🔔",
          key: "notif2",
          label: t("notifications"),
          onClick: () => navigate({ to: "/notifications" }),
        },
        {
          icon: "⚙️",
          key: "notifsettings",
          label: t("notification_settings"),
          onClick: () => navigate({ to: "/notification-settings" }),
        },
      ],
    },
    {
      key: "account",
      title: t("section_account"),
      emoji: "👥",
      items: [
        {
          icon: "🌐",
          key: "lang",
          label: t("language"),
          value: `${LANG_INFO[lang].flag} ${LANG_INFO[lang].label}`,
          onClick: () => setLangOpen(true),
        },
        {
          icon: theme === "dark" ? "🌙" : "☀️",
          key: "theme",
          label: t("appearance"),
          value: theme === "dark" ? t("dark") : t("light"),
          onClick: toggleTheme,
        },
        {
          icon: "📱",
          key: "devices",
          label: t("my_devices"),
          onClick: () => navigate({ to: "/devices" }),
        },
        {
          icon: "💳",
          key: "sub",
          label: t("subscription"),
          value: isLifetime
            ? t("plan_badge_lifetime")
            : isTeam && teamTier
              ? t(`plan_badge_${teamTier}` as any)
              : isPro
                ? t("pro_plan")
                : isStarter
                  ? t("starter_plan")
                  : t("free_plan"),
          onClick: () => navigate({ to: "/plans" }),
        },
        ...(!isNativeBillingAvailable() && (isStarter || isPro)
          ? [
              {
                icon: "🔗",
                key: "stripeportal",
                label: t("manage_subscription"),
                value: t("manage_subscription_subtitle"),
                onClick: () =>
                  window.open(
                    "https://billing.stripe.com/p/login/8x2bJ12Ya2sX9JKaIAeIw00",
                    "_blank",
                  ),
              } as MenuItem,
            ]
          : []),
      ],
    },
    ...(isTeam
      ? [
          {
            key: "team",
            title: t("section_team"),
            emoji: "👨‍👩‍👧",
            items: [
              {
                icon: "👥",
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
      emoji: "🔗",
      items: [
        {
          icon: "📲",
          key: "wa",
          label: t("wa_template"),
          value: hasFullAccess ? undefined : "🔒",
          onClick: () => (hasFullAccess ? setTplOpen(true) : showUpgrade(t("wa_template"))),
        },
      ],
    },
    {
      key: "advanced",
      title: t("section_advanced"),
      emoji: "⚙️",
      items: [
        { icon: "🔒", key: "priv", label: t("privacy"), onClick: () => navigate({ to: "/privacy" }) },
        {
          icon: "🗑️",
          key: "deldata",
          label: t("data_deletion"),
          onClick: () => navigate({ to: "/data-deletion" }),
        },
        ...(isAdmin
          ? [
              {
                icon: "⚙️",
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
    const load = async () => {
      const [{ data: o }, { count: cust }, { data: p }, { data: pref }] = await Promise.all([
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
        supabase
          .from("user_preferences")
          .select("wa_order_template,wa_reminder_template")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const orders = (o ?? []) as OrderSummary[];
      const revenue = orders
        .filter((x) => x.status === "Paid")
        .reduce((s, x) => s + Number(x.amount), 0);
      setStats({ orders: orders.length, revenue, customers: cust ?? 0 });
      const loadedProfile = p as ProfileSummary | null;
      setProfile(loadedProfile);
      setIsAdmin(!!loadedProfile?.is_admin);
      setConnectedPlatforms({});
      // Treat any saved value that still matches a built-in default (in any
      // biz/lang) as non-custom, so changing business_type or language flips
      // to the right default automatically.
      const savedOrder = pref?.wa_order_template ?? null;
      const savedReminder = pref?.wa_reminder_template ?? null;
      if (savedOrder && !isBuiltInOrderTpl(savedOrder)) {
        setOrderTpl(savedOrder);
        setOrderCustom(true);
      } else {
        setOrderTpl(defaultOrderTpl);
        setOrderCustom(false);
      }
      if (savedReminder && !isBuiltInReminderTpl(savedReminder)) {
        setReminderTpl(savedReminder);
        setReminderCustom(true);
      } else {
        setReminderTpl(defaultReminderTpl);
        setReminderCustom(false);
      }
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

  const saveTemplates = async () => {
    if (!user) return;
    const { error } = await supabase.from("user_preferences").upsert(
      {
        user_id: user.id,
        wa_order_template: orderTpl,
        wa_reminder_template: reminderTpl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) toast.error(error.message);
    else {
      toast.success(t("template_saved"));
      setTplOpen(false);
    }
  };

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
    <div className="px-5 pt-10 pb-6 space-y-6">
      <header className="flex flex-col items-center text-center">
        <div className="h-24 w-24 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-3xl font-bold shadow-[var(--shadow-soft)] overflow-hidden">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{businessName}</h1>
        <span
          className={`mt-2 text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${isLifetime ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-white" : isTeam ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white" : isPro ? "bg-gradient-to-r from-primary to-primary/70 text-primary-foreground" : isStarter ? "bg-gradient-to-r from-sky-500 to-teal-500 text-white" : "bg-muted text-muted-foreground"}`}
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
            ? "bg-gradient-to-br from-emerald-50 to-emerald-50/40 border-emerald-200"
            : "bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200"
        }`}
      >
        <div
          className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${
            paySummary?.hasMethod
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
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
            className={`text-sm font-bold ${paySummary?.hasMethod ? "text-emerald-800" : "text-amber-900"}`}
          >
            {paySummary?.hasMethod ? `✓ ${t("payment_active")}` : `⚠️ ${t("payment_not_setup")}`}
          </p>
          {paySummary?.hasMethod ? (
            <p className="text-xs text-emerald-700/80 mt-0.5 truncate">
              {paySummary.type ?? "—"} {paySummary.number ? `· ${paySummary.number}` : ""}
            </p>
          ) : (
            <p className="text-[11px] text-amber-700 font-semibold mt-0.5">{t("set_up_now")} →</p>
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
            <span className="text-lg w-6 text-center">{m.icon}</span>
            <span className="flex-1 text-sm font-medium text-foreground">{m.label}</span>
            {m.value && <span className="text-xs text-muted-foreground">{m.value}</span>}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </section>

      {sections.map((sec) => (
        <section key={sec.key} className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <span className="text-base">{sec.emoji}</span>
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
                <span className="text-lg w-6 text-center">{m.icon}</span>
                <span className="flex-1 text-sm font-medium text-foreground">{m.label}</span>
                {m.value && <span className="text-xs text-muted-foreground">{m.value}</span>}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
            {sec.key === "integrations" && (
              <div className="divide-y divide-border/60">
                {PLATFORMS.map((p) => {
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
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isConn ? `${t("connected")} ✅` : t("not_connected")}
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

      <Link to="/terms" className="block text-center text-xs text-muted-foreground underline">
        {t("terms_conditions")}
      </Link>

      <Link
        to="/privacy-policy"
        className="block text-center text-xs text-muted-foreground underline"
      >
        {t("privacy_policy")}
      </Link>

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

      {tplOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in"
          onClick={() => setTplOpen(false)}
        >
          <div
            className="w-full max-w-[390px] bg-card rounded-t-3xl p-5 space-y-3 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-muted" />
            <p className="text-sm font-semibold py-1">{t("wa_template")}</p>
            <div>
              <label className="text-[11px] uppercase font-semibold text-muted-foreground">
                {t("order_template")}
              </label>
              <textarea
                value={orderTpl}
                onChange={(e) => {
                  setOrderTpl(e.target.value);
                  setOrderCustom(true);
                }}
                rows={6}
                className="mt-1 w-full rounded-xl bg-muted/50 border border-border/60 px-3 py-2 text-xs font-mono"
              />
              <button
                onClick={() => {
                  setOrderTpl(defaultOrderTpl);
                  setOrderCustom(false);
                }}
                className="text-[11px] text-primary mt-1"
              >
                {t("reset_default")}
              </button>
            </div>
            <div>
              <label className="text-[11px] uppercase font-semibold text-muted-foreground">
                {t("reminder_template")}
              </label>
              <textarea
                value={reminderTpl}
                onChange={(e) => {
                  setReminderTpl(e.target.value);
                  setReminderCustom(true);
                }}
                rows={6}
                className="mt-1 w-full rounded-xl bg-muted/50 border border-border/60 px-3 py-2 text-xs font-mono"
              />
              <button
                onClick={() => {
                  setReminderTpl(defaultReminderTpl);
                  setReminderCustom(false);
                }}
                className="text-[11px] text-primary mt-1"
              >
                {t("reset_default")}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">{varsHelp}</p>
            <button
              onClick={saveTemplates}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold"
            >
              {t("save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
