import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Trash2 } from "lucide-react";
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

  const removeOne = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setItems((prev) => prev.filter((x) => x.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  };

  const clearAll = async () => {
    if (!confirm(t("delete") + "?")) return;
    setItems([]);
    await supabase.from("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  };

  return (
    <div className="px-5 pt-10 pb-6 space-y-4">
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
            <button onClick={clearAll} className="text-xs text-red-500 font-semibold">{t("delete")}</button>
          )}
        </div>
      </header>

      {items.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-16">{t("no_notifications")}</p>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const isDeleted = /deleted|删除|dipadam/i.test(n.title) || n.type === "order_deleted";
            return (
              <div
                key={n.id}
                className={`relative w-full p-4 pr-12 rounded-2xl border transition ${
                  isDeleted
                    ? "bg-red-50 border-red-200"
                    : n.is_read
                    ? "bg-card border-border/60"
                    : "bg-primary/5 border-primary/20"
                }`}
              >
                <button onClick={() => tap(n)} className="w-full text-left">
                  <p className={`text-sm font-semibold ${isDeleted ? "text-red-600" : "text-foreground"}`}>
                    {n.title}
                  </p>
                  <p className={`text-xs mt-0.5 ${isDeleted ? "text-red-500/80" : "text-muted-foreground"}`}>
                    {n.message}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">{formatTime(n.created_at)}</p>
                </button>
                <button
                  onClick={(e) => removeOne(e, n.id)}
                  aria-label="Delete"
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
  );
}
