import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n, type TKey } from "@/contexts/I18nContext";
import { getPublicOrigin } from "@/lib/publicUrl";
import {
  DAY_SHORT_KEYS,
  DEFAULT_BOOKING_CONFIG,
  normalizeBookingConfig,
  type BookingConfig,
} from "@/lib/booking";

export const Route = createFileRoute("/booking-settings")({ component: BookingSettingsPage });

function BookingSettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState<BookingConfig>(DEFAULT_BOOKING_CONFIG);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("booking_enabled,booking_config,booking_code" as any)
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const p = (data as any) ?? {};
      setEnabled(!!p.booking_enabled);
      setConfig(normalizeBookingConfig(p.booking_config));
      let existing = (p.booking_code as string | null) ?? null;
      if (!existing) {
        const fresh = Math.random().toString(16).slice(2, 10);
        const { error: upErr } = await supabase
          .from("profiles")
          .update({ booking_code: fresh } as any)
          .eq("id", user.id);
        if (!upErr) existing = fresh;
      }
      setCode(existing);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const toggleDay = (d: number) => {
    setConfig((c) => ({
      ...c,
      days: c.days.includes(d) ? c.days.filter((x) => x !== d) : [...c.days, d].sort(),
    }));
  };

  const save = async () => {
    if (!user) return;
    if (enabled && config.days.length === 0) {
      toast.error(t("working_days") + ": —");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        booking_enabled: enabled,
        booking_config: config,
      } as any)
      .eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success(t("saved")); navigate({ to: "/profile" }); }
  };

  return (
    <div className="px-5 pt-10 pb-10 space-y-5 max-w-[480px] mx-auto">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/profile" })} className="h-9 w-9 rounded-full bg-card border border-border/60 flex items-center justify-center active:scale-95" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground">📅 {t("booking_settings")}</h1>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">{t("loading")}</p>
      ) : (
        <>
          <section className="rounded-2xl bg-card border border-border/60 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{t("booking_enabled")}</p>
              <button
                type="button"
                onClick={() => setEnabled((v) => !v)}
                role="switch"
                aria-checked={enabled}
                className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : ""}`} />
              </button>
            </div>
          </section>

          {enabled && code && (
            <section className="rounded-2xl bg-card border border-border/60 p-4 space-y-2">
              <p className="text-sm font-semibold">{t("booking_share_link")}</p>
              <p className="text-[11px] text-muted-foreground">{t("booking_share_sub")}</p>
              <div className="rounded-xl bg-muted/40 border border-border/60 px-3 py-2 text-xs break-all">
                {`${getPublicOrigin()}/book/${code}`}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const url = `${getPublicOrigin()}/book/${code}`;
                    navigator.clipboard?.writeText(url);
                    toast.success(t("link_copied"));
                  }}
                  className="h-10 rounded-xl bg-muted text-foreground text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" /> {t("copy_link")}
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${getPublicOrigin()}/book/${code}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="h-10 rounded-xl bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Share2 className="h-3.5 w-3.5" /> {t("share_whatsapp")}
                </a>
              </div>
            </section>
          )}

          <section className="rounded-2xl bg-card border border-border/60 p-4 space-y-3">
            <p className="text-sm font-semibold">{t("working_days")}</p>
            <div className="grid grid-cols-7 gap-1.5">
              {DAY_SHORT_KEYS.map((k, idx) => {
                const active = config.days.includes(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={`h-10 rounded-xl text-xs font-semibold transition ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    {t(k as TKey)}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl bg-card border border-border/60 p-4 space-y-3">
            <p className="text-sm font-semibold">{t("working_hours")}</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] text-muted-foreground">{t("from_time")}</span>
                <input
                  type="time"
                  value={config.start}
                  onChange={(e) => setConfig((c) => ({ ...c, start: e.target.value }))}
                  className="mt-1 w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-muted-foreground">{t("to_time")}</span>
                <input
                  type="time"
                  value={config.end}
                  onChange={(e) => setConfig((c) => ({ ...c, end: e.target.value }))}
                  className="mt-1 w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2.5 text-sm"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl bg-card border border-border/60 p-4 space-y-3">
            <p className="text-sm font-semibold">{t("slot_duration")}</p>
            <div className="grid grid-cols-3 gap-2">
              {([30, 60, 120] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, slot_minutes: m }))}
                  className={`h-10 rounded-xl text-xs font-semibold transition ${config.slot_minutes === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {t(("min_" + m) as TKey)}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-card border border-border/60 p-4 space-y-2">
            <label className="block">
              <span className="text-sm font-semibold">{t("max_per_slot")}</span>
              <input
                type="number"
                min={1}
                max={50}
                value={config.max_per_slot}
                onChange={(e) => setConfig((c) => ({ ...c, max_per_slot: Math.max(1, Math.min(50, Number(e.target.value) || 1)) }))}
                className="mt-2 w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2.5 text-sm"
              />
            </label>
          </section>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-lg disabled:opacity-60 active:scale-[0.99]"
          >
            {saving ? t("saving") : t("save")}
          </button>
        </>
      )}
    </div>
  );
}