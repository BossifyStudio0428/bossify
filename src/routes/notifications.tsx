import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/notifications")({ component: NotificationsPage });

type Notif = {
  id: string; type: string; title: string; message: string;
  is_read: boolean; created_at: string; link: string | null;
};

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
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);

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

  return (
    <div className="px-5 pt-10 pb-6 space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/" className="-ml-2 p-2 rounded-full active:bg-muted"><ChevronLeft className="h-5 w-5" /></Link>
          <h1 className="text-2xl font-bold">{t("notifications")}</h1>
        </div>
        {items.some((n) => !n.is_read) && (
          <button onClick={markAll} className="text-xs text-primary font-semibold">{t("mark_all_read")}</button>
        )}
      </header>

      {items.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-16">{t("no_notifications")}</p>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <button key={n.id} onClick={() => tap(n)}
              className={`w-full text-left p-4 rounded-2xl border border-border/60 transition ${n.is_read ? "bg-card" : "bg-primary/5 border-primary/20"}`}>
              <p className="text-sm font-semibold text-foreground">{n.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{formatTime(n.created_at)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
