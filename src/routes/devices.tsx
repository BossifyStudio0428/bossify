import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Smartphone, Monitor, Tablet, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import {
  getDeviceId,
  registerDeviceSession,
  removeDeviceSession,
} from "@/lib/deviceSession";

export const Route = createFileRoute("/devices")({ component: DevicesPage });

type DeviceRow = {
  id: string;
  device_id: string;
  device_name: string;
  device_type: string;
  last_active: string;
  created_at: string;
};

function iconFor(type: string) {
  if (type === "android" || type === "ios") return Smartphone;
  if (type === "tablet") return Tablet;
  return Monitor;
}

function relativeTime(iso: string, lang: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return lang === "zh" ? "刚刚" : lang === "ms" ? "Baru sahaja" : "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return lang === "zh" ? `${min} 分钟前` : lang === "ms" ? `${min} minit lalu` : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return lang === "zh" ? `${hr} 小时前` : lang === "ms" ? `${hr} jam lalu` : `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return lang === "zh" ? `${d} 天前` : lang === "ms" ? `${d} hari lalu` : `${d}d ago`;
}

function DevicesPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [limit, setLimit] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const currentDeviceId = getDeviceId();

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    // Touch current device + get limit
    const reg = await registerDeviceSession();
    if (reg.ok) setLimit(reg.limit);
    const { data, error } = await supabase
      .from("device_sessions")
      .select("id, device_id, device_name, device_type, last_active, created_at")
      .eq("user_id", user.id)
      .order("last_active", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setRows((data ?? []) as DeviceRow[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onRemove = async (row: DeviceRow) => {
    if (row.device_id === currentDeviceId) return;
    if (!confirm(t("device_remove_confirm"))) return;
    setRemovingId(row.id);
    try {
      await removeDeviceSession(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      toast.success(t("device_removed"));
    } catch (e: any) {
      toast.error(e?.message ?? "Error");
    } finally {
      setRemovingId(null);
    }
  };

  const used = rows.length;

  return (
    <div className="px-5 pt-10 pb-8 space-y-5 max-w-[480px] mx-auto">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/profile" })}
          className="h-10 w-10 rounded-full bg-card border border-border/60 flex items-center justify-center"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("my_devices")}</h1>
          <p className="text-xs text-muted-foreground">{t("devices_subtitle")}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 to-primary/5 p-4">
        <p className="text-sm font-semibold text-foreground">
          {t("devices_used").replace("{used}", String(used)).replace("{limit}", String(limit))}
        </p>
        <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%` }}
          />
        </div>
        {used >= limit && (
          <p className="mt-2 text-[11px] text-amber-700 font-medium">
            {t("device_limit_warning")}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const Icon = iconFor(row.device_type);
            const isCurrent = row.device_id === currentDeviceId;
            return (
              <li
                key={row.id}
                className="rounded-2xl bg-card border border-border/60 p-4 flex items-center gap-3"
              >
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {row.device_name}
                    </p>
                    {isCurrent && (
                      <span className="text-[10px] font-bold uppercase tracking-wide bg-primary/15 text-primary px-2 py-0.5 rounded-full">
                        {t("this_device")}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t("device_last_active")}: {relativeTime(row.last_active, lang)}
                  </p>
                </div>
                {!isCurrent && (
                  <button
                    type="button"
                    onClick={() => onRemove(row)}
                    disabled={removingId === row.id}
                    className="h-9 px-3 rounded-xl bg-red-50 text-red-600 text-xs font-semibold flex items-center gap-1 active:scale-95 disabled:opacity-50"
                  >
                    {removingId === row.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    {t("device_remove")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Link to="/profile" className="block text-center text-xs text-muted-foreground underline">
        {t("back")}
      </Link>
    </div>
  );
}