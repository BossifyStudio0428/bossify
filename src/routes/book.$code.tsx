import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import bossifyLogo from "@/assets/bossify-logo.png";
import {
  DEFAULT_BOOKING_CONFIG,
  bookingLabelKey,
  generateSlots,
  normalizeBookingConfig,
  type BookingConfig,
} from "@/lib/booking";
import type { BizType } from "@/lib/businessType";

export const Route = createFileRoute("/book/$code")({ component: PublicBookingPage });

type Profile = {
  id: string;
  business_name: string | null;
  business_type: string | null;
  booking_config: unknown;
  booking_enabled: boolean;
};

const schema = z.object({
  customer_name: z.string().trim().min(1).max(120),
  customer_phone: z.string().trim().min(5).max(30),
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  booking_time: z.string().regex(/^\d{2}:\d{2}$/),
  pax: z.number().int().min(1).max(99),
  notes: z.string().max(500).nullable(),
});

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function PublicBookingPage() {
  const { code } = Route.useParams();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [config, setConfig] = useState<BookingConfig>(DEFAULT_BOOKING_CONFIG);
  const [busy, setBusy] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState("");
  const [pax, setPax] = useState(1);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_booking_profile" as any, { _code: code });
      if (cancelled) return;
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setProfile(null);
      } else {
        const row = (Array.isArray(data) ? data[0] : data) as Profile;
        setProfile(row);
        setConfig(normalizeBookingConfig(row.booking_config));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!profile?.id || !date) return;
      const { data } = await supabase
        .from("bookings" as any)
        .select("booking_time,status")
        .eq("user_id", profile.id)
        .eq("booking_date", date)
        .neq("status", "cancelled");
      if (cancelled) return;
      const c: Record<string, number> = {};
      ((data as any[]) ?? []).forEach((r) => {
        const k = String(r.booking_time).slice(0, 5);
        c[k] = (c[k] ?? 0) + 1;
      });
      setBusy(c);
    })();
    return () => { cancelled = true; };
  }, [profile?.id, date]);

  const slots = useMemo(() => generateSlots(config), [config]);
  const dayAllowed = useMemo(() => config.days.includes(new Date(date + "T00:00:00").getDay()), [config, date]);
  const titleKey = bookingLabelKey((profile?.business_type ?? null) as BizType | null);

  const submit = async () => {
    if (!profile) return;
    const parsed = schema.safeParse({
      customer_name: name,
      customer_phone: phone,
      booking_date: date,
      booking_time: time,
      pax,
      notes: notes || null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("bookings" as any).insert({
      user_id: profile.id,
      customer_name: parsed.data.customer_name,
      customer_phone: parsed.data.customer_phone,
      booking_date: parsed.data.booking_date,
      booking_time: parsed.data.booking_time,
      duration_minutes: config.slot_minutes,
      pax: parsed.data.pax,
      notes: parsed.data.notes,
      status: "pending",
      source: "public",
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setSubmitted(true);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">{t("loading")}</div>;
  }

  if (!profile || !profile.booking_enabled) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <CalendarCheck className="h-10 w-10 text-muted-foreground" />
        <p className="text-base font-semibold">{t("booking_closed")}</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-primary" />
        <p className="text-base font-semibold">{t("booking_thank_you")}</p>
        <p className="text-xs text-muted-foreground">
          {profile.business_name} · {date} {time}
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 pt-8 pb-10 space-y-4 max-w-[480px] mx-auto">
      <header className="flex items-center gap-3">
        <img src={bossifyLogo} alt="" className="h-8 w-8 rounded-lg" />
        <div>
          <h1 className="text-lg font-bold text-foreground">{profile.business_name}</h1>
          <p className="text-[11px] text-muted-foreground">{t(titleKey)}</p>
        </div>
      </header>

      <section className="rounded-2xl bg-card border border-border/60 p-4 space-y-3">
        <label className="block">
          <span className="text-[11px] text-muted-foreground">{t("customer_name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
            className="mt-1 w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2.5 text-sm" />
        </label>
        <label className="block">
          <span className="text-[11px] text-muted-foreground">{t("phone_number")}</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={30}
            className="mt-1 w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2.5 text-sm" />
        </label>
      </section>

      <section className="rounded-2xl bg-card border border-border/60 p-4 space-y-3">
        <label className="block">
          <span className="text-sm font-semibold">{t("select_date")}</span>
          <input
            type="date"
            min={todayStr()}
            value={date}
            onChange={(e) => { setDate(e.target.value); setTime(""); }}
            className="mt-2 w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2.5 text-sm"
          />
        </label>
        <div>
          <p className="text-sm font-semibold mb-2">{t("select_time")}</p>
          {!dayAllowed ? (
            <p className="text-xs text-muted-foreground">{t("no_slots")}</p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {slots.map((s) => {
                const used = busy[s] ?? 0;
                const full = used >= config.max_per_slot;
                const active = time === s;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={full}
                    onClick={() => setTime(s)}
                    className={`h-9 rounded-lg text-xs font-semibold transition ${active ? "bg-primary text-primary-foreground" : full ? "bg-muted/50 text-muted-foreground/50 line-through" : "bg-muted text-foreground"}`}
                  >
                    {s}
                  </button>
                );
              })}
              {slots.length === 0 && <p className="text-xs text-muted-foreground col-span-4">{t("no_slots")}</p>}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-card border border-border/60 p-4 space-y-3">
        <label className="block">
          <span className="text-[11px] text-muted-foreground">{t("pax")}</span>
          <input type="number" min={1} max={99} value={pax}
            onChange={(e) => setPax(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            className="mt-1 w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2.5 text-sm" />
        </label>
        <label className="block">
          <span className="text-[11px] text-muted-foreground">{t("notes")}</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3}
            className="mt-1 w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2.5 text-sm" />
        </label>
      </section>

      <button
        type="button"
        onClick={submit}
        disabled={saving || !time}
        className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-lg disabled:opacity-60 active:scale-[0.99]"
      >
        {saving ? t("saving") : t("book_now")}
      </button>
    </div>
  );
}