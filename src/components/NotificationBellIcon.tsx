import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Header bell — quick access to the real order-activity feed (new order,
 * order deleted, low stock, etc. — the same `notifications` table/page
 * already reachable via More → Notifications). This is deliberately
 * separate from CampaignBanner/CampaignBellIcon, which only reflect the
 * 11.11 campaign; this bell is general and always relevant. Shows a
 * red unread-count badge.
 *
 * Refetches on three triggers, not just realtime: (1) the realtime
 * subscription below, for a live update while this component stays
 * mounted; (2) every route change, since tapping "mark all read" on
 * /notifications updates that page's own local state but doesn't by
 * itself notify this separately-mounted header component — navigating
 * back to any other page re-checks the real count; (3) window focus,
 * same reasoning as SubscriptionContext. Relying on realtime alone left
 * the badge stuck at a stale count after "mark all read" if Postgres
 * changes aren't reliably reaching the client for UPDATE events.
 */
export function NotificationBellIcon() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const loadCount = async () => {
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("is_read", false);
    setUnread(count ?? 0);
  };

  useEffect(() => {
    if (!user) return;
    loadCount();
  }, [user?.id, pathname]);

  useEffect(() => {
    if (!user) return;
    const onFocus = () => loadCount();
    const onVisible = () => {
      if (!document.hidden) loadCount();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const ch = supabase
      .channel("notif-bell-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => loadCount(),
      )
      .subscribe();
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  if (!user) return null;

  return (
    <Link
      to="/notifications"
      aria-label="Notifications"
      className="relative ml-auto h-9 w-9 rounded-full flex items-center justify-center text-foreground active:scale-95"
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}