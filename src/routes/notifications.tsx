import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Trash2, Bell, ShoppingBag, Package, Wallet, Settings as SettingsIcon, Lightbulb, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/notifications")({ component: NotificationsPage });

type Notif = {
  id: string; type: string; title: string; message: string;
  is_read: boolean; created_at: string; link: string | null;
};

// The `notifications` table currently only ever receives rows of these 4
// types (see src/routes/orders.tsx, new-order.tsx, api/public/webhooks/tiktok.ts).
// Low-stock and loss-making alerts exist in the app today but are pushed
// straight to the device (src/lib/sendPush.ts) — they are never written as
// in-app rows here yet, so "Inventory" and "Profit & Cost" below are real,
// future-ready categories that will simply show 0 until that changes.
type NotifCategory = "orders" | "inventory" | "profit" | "system";
function categoryOf(n: Notif): NotifCategory {
  if (n.type === "new_order" || n.type === "new_order_tiktok" || n.type === "paid") return "orders";
  if (n.type === "low_stock" || n.type === "out_of_stock") return "inventory";
  if (n.type === "loss_making" || n.type === "cost_alert") return "profit";
  return "system"; // order_deleted and anything else uncategorized
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  if (sameDay) return `Today ${d.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" })}`;
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

function NotificationsPage() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [activeCategory, setActiveCategory] = useState<"all" | NotifCategory>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
    setItems((data ?? []) as Notif[]);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("notif-rt").on("postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const tap = async (n: Notif) => {
    if (!n.is_read) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
    }
    if (n.link) navigate({ to: n.link as any });
  };

  const markAll = async () => {
    await supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
    load();
  };

  const doRemoveOne = async () => {
    if (!confirmId) return;
    const id = confirmId;
    setConfirmId(null);
    setItems((prev) => prev.filter((x) => x.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  };

  const doClearAll = async () => {
    setConfirmAll(false);
    setItems([]);
    await supabase.from("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  };

  // Desktop-only: category counts (unread), filtered + Today/Earlier grouping.
  const unreadCountOf = (cat: "all" | NotifCategory) =>
    items.filter((n) => !n.is_read && (cat === "all" || categoryOf(n) === cat)).length;
  const categoryList: { key: "all" | NotifCategory; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "all", label: lang === "zh" ? "全部通知" : lang === "ms" ? "Semua Notifikasi" : "All Notifications", icon: Bell },
    { key: "orders", label: lang === "zh" ? "订单" : lang === "ms" ? "Pesanan" : "Orders", icon: ShoppingBag },
    { key: "inventory", label: lang === "zh" ? "库存" : lang === "ms" ? "Inventori" : "Inventory", icon: Package },
    { key: "profit", label: lang === "zh" ? "利润与成本" : lang === "ms" ? "Keuntungan & Kos" : "Profit & Cost", icon: Wallet },
    { key: "system", label: lang === "zh" ? "系统" : lang === "ms" ? "Sistem" : "System", icon: SettingsIcon },
  ];
  const desktopFiltered = items.filter(
    (n) => (activeCategory === "all" || categoryOf(n) === activeCategory) && (!unreadOnly || !n.is_read),
  );
  const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
  const todayItems = desktopFiltered.filter((n) => isToday(n.created_at));
  const earlierItems = desktopFiltered.filter((n) => !isToday(n.created_at));

  const renderRow = (n: Notif) => {
    const isDeleted = /deleted|删除|dipadam/i.test(n.title) || n.type === "order_deleted";
    const isTikTok = n.type === "new_order_tiktok";
    const CatIcon = categoryList.find((c) => c.key === categoryOf(n))?.icon ?? Bell;
    return (
      <div
        key={n.id}
        className={`relative w-full p-4 pr-12 rounded-2xl border transition flex items-start gap-3 ${
          isDeleted ? "bg-red-500/10 border-red-500/30" : n.is_read ? "bg-card border-border/60" : "bg-primary/5 border-primary/20"
        }`}
      >
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${isDeleted ? "bg-red-500/15 text-red-600" : "bg-primary/10 text-primary"}`}>
          <CatIcon className="h-4 w-4" />
        </div>
        <button onClick={() => tap(n)} className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-semibold ${isDeleted ? "text-red-600" : "text-foreground"}`}>{n.title}</p>
            {isTikTok && <span className="shrink-0 px-2 py-0.5 bg-black text-white text-[10px] font-medium rounded-full">TikTok</span>}
          </div>
          <p className={`text-xs mt-0.5 ${isDeleted ? "text-red-500/80" : "text-muted-foreground"}`}>{n.message}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{formatTime(n.created_at)}</p>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setConfirmId(n.id); }}
          aria-label={t("delete")}
          className="absolute top-3 right-3 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-500 active:bg-muted"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="px-5 pt-10 pb-6 space-y-4 lg:max-w-6xl lg:mx-auto lg:px-8 lg:pt-8">
      <div className="hidden lg:grid lg:grid-cols-[240px_1fr] lg:gap-6 lg:items-start">
        <div className="space-y-4">
          <h1 className="text-2xl font-bold px-1">{t("notifications")}</h1>
          <nav className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-2 space-y-1">
            {categoryList.map((c) => {
              const count = unreadCountOf(c.key);
              const active = activeCategory === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setActiveCategory(c.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
                    active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"
                  }`}
                >
                  <c.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left truncate">{c.label}</span>
                  {count > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? "bg-white/20" : "bg-primary/10 text-primary"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 space-y-2">
            <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5" />
              {lang === "zh" ? "通知小贴士" : lang === "ms" ? "Petua Notifikasi" : "Notification Tips"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {lang === "zh"
                ? "库存和利润提醒目前只会推送到手机通知，还不会显示在这个列表里 — 这是未来会打通的功能。"
                : lang === "ms"
                ? "Amaran inventori & keuntungan kini hanya dihantar sebagai push notification telefon — belum muncul dalam senarai ini. Ini akan disambungkan kemudian."
                : "Inventory & profit alerts are currently push-only to your phone — they don't appear in this list yet. That's a planned future connection."}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {([{ key: "all" as const, label: t("notifications") }, ...categoryList.filter((c) => c.key !== "all")].map((c) => (
                <button
                  key={c.key}
                  onClick={() => setActiveCategory(c.key)}
                  className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                    activeCategory === c.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {c.label}
                </button>
              )))}
              <button
                onClick={() => setUnreadOnly((v) => !v)}
                className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                  unreadOnly ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {lang === "zh" ? "未读" : lang === "ms" ? "Belum Dibaca" : "Unread"}
              </button>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {items.some((n) => !n.is_read) && (
                <button onClick={markAll} className="text-xs text-primary font-semibold flex items-center gap-1">
                  <CheckCheck className="h-3.5 w-3.5" />{t("mark_all_read")}
                </button>
              )}
              <Link to="/notification-settings" className="text-xs text-muted-foreground font-semibold flex items-center gap-1 hover:text-foreground">
                <SettingsIcon className="h-3.5 w-3.5" />{lang === "zh" ? "通知设置" : lang === "ms" ? "Tetapan Notifikasi" : "Notification Settings"}
              </Link>
            </div>
          </div>

          {desktopFiltered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-16">{t("no_notifications")}</p>
          ) : (
            <div className="space-y-5">
              {todayItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
                    {lang === "zh" ? "今天" : lang === "ms" ? "Hari Ini" : "Today"}
                  </p>
                  <div className="space-y-2">{todayItems.map(renderRow)}</div>
                </div>
              )}
              {earlierItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground px-1">
                    {lang === "zh" ? "更早" : lang === "ms" ? "Lebih Awal" : "Earlier"}
                  </p>
                  <div className="space-y-2">{earlierItems.map(renderRow)}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="lg:hidden space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/" className="-ml-2 p-2 rounded-full active:bg-muted"><ChevronLeft className="h-5 w-5" /></Link>
          <h1 className="text-2xl font-bold">{t("notifications")}</h1>
        </div>
        <div className="flex items-center gap-3">
          {items.some((n) => !n.is_read) && (
            <button onClick={markAll} className="text-xs text-primary font-semibold">{t("mark_all_read")}</button>
          )}
          {items.length > 0 && (
            <button onClick={() => setConfirmAll(true)} className="text-xs text-red-500 font-semibold">{t("delete")}</button>
          )}
        </div>
      </header>

      {items.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-16">{t("no_notifications")}</p>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const isDeleted = /deleted|删除|dipadam/i.test(n.title) || n.type === "order_deleted";
            const isTikTok = n.type === "new_order_tiktok";
            return (
              <div
                key={n.id}
                className={`relative w-full p-4 pr-12 rounded-2xl border transition ${
                  isDeleted
                    ? "bg-red-500/10 border-red-500/30"
                    : n.is_read
                    ? "bg-card border-border/60"
                    : "bg-primary/5 border-primary/20"
                }`}
              >
                <button onClick={() => tap(n)} className="w-full text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-semibold ${isDeleted ? "text-red-600" : "text-foreground"}`}>
                      {n.title}
                    </p>
                    {isTikTok && (
                      <span className="shrink-0 px-2 py-0.5 bg-black text-white text-[10px] font-medium rounded-full">
                        TikTok
                      </span>
                    )}
                  </div>
                  <p className={`text-xs mt-0.5 ${isDeleted ? "text-red-500/80" : "text-muted-foreground"}`}>
                    {n.message}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">{formatTime(n.created_at)}</p>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmId(n.id); }}
                  aria-label={t("delete")}
                  className="absolute top-3 right-3 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-500 active:bg-muted"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      </div>

      <AlertDialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete")}?</AlertDialogTitle>
            <AlertDialogDescription>{t("notifications")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel") || "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={doRemoveOne} className="bg-red-500 hover:bg-red-600">
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete")} {t("notifications")}?</AlertDialogTitle>
            <AlertDialogDescription>—</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel") || "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={doClearAll} className="bg-red-500 hover:bg-red-600">
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}