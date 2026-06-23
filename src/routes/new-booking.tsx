import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import {
  DEFAULT_BOOKING_CONFIG,
  bookingLabelKey,
  generateSlots,
  normalizeBookingConfig,
  type BookingConfig,
} from "@/lib/booking";

export const Route = createFileRoute("/new-booking")({ component: NewBookingPage });

type Service = { id: string; name: string; duration_minutes: number | null };

const schema = z.object({
  customer_name: z.string().trim().min(1).max(120),
  customer_phone: z.string().trim().min(5).max(30),
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  booking_time: z.string().regex(/^\d{2}:\d{2}$/),
  pax: z.number().int().min(1).max(99),
  service_id: z.string().uuid().nullable(),
  service_name: z.string().nullable(),
  notes: z.string().max(500).nullable(),
});

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function NewBookingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { type } = useBusinessType();
  const titleKey = bookingLabelKey(type);

  const [config, setConfig] = useState<BookingConfig>(DEFAULT_BOOKING_CONFIG);
  const [services, setServices] = useState<Service[]>([]);
  const [busySlots, setBusySlots] = useState<Record<string, number>>({});

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [serviceId, setServiceId] = useState<string>("");
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState<string>("");
  const [pax, setPax] = useState(1);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      const [{ data: profile }, { data: svc }] = await Promise.all([
        supabase.from("profiles").select("booking_config" as any).eq("id", user.id).maybeSingle(),
        supabase.from("services").select("id,name,duration_minutes").eq("user_id", user.id).eq("is_active", true).order("name"),
      ]);
      if (cancelled) return;
      setConfig(normalizeBookingConfig((profile as any)?.booking_config));
      setServices((svc as Service[] | null) ?? []);
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || !date) return;
      const { data } = await supabase
        .from("bookings" as any)
        .select("booking_time,status")
        .eq("user_id", user.id)
        .eq("booking_date", date)
        .neq("status", "cancelled");
      if (cancelled) return;
      const counts: Record<string, number> = {};
      ((data as any[]) ?? []).forEach((r) => {
        const k = String(r.booking_time).slice(0, 5);
        counts[k] = (counts[k] ?? 0) + 1;
      });
      setBusySlots(counts);
    })();
    return () => { cancelled = true; };
  }, [user, date]);

  const allSlots = useMemo(() => generateSlots(config), [config]);
  const dateObj = useMemo(() => new Date(date + "T00:00:00"), [date]);
  const isDayAllowed = config.days.includes(dateObj.getDay());

  const submit = async () => {
    if (!user) return;
    const selectedSvc = services.find((s) => s.id === serviceId) ?? null;
    const parsed = schema.safeParse({
      customer_name: customerName,
      customer_phone: customerPhone,
      booking_date: date,
      booking_time: time,
      pax,
      service_id: serviceId || null,
      service_name: selectedSvc?.name ?? null,
      notes: notes || null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("bookings" as any).insert({
      user_id: user.id,
      customer_name: parsed.data.customer_name,
      customer_phone: parsed.data.customer_phone,
      service_id: parsed.data.service_id,
      service_name: parsed.data.service_name,
      booking_date: parsed.data.booking_date,
      booking_time: parsed.data.booking_time,
      duration_minutes: selectedSvc?.duration_minutes ?? config.slot_minutes,
      pax: parsed.data.pax,
      notes: parsed.data.notes,
      status: "confirmed",
      source: "manual",
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("booking_saved"));
    navigate({ to: "/bookings" });
  };

  return (
    <div className="px-5 pt-10 pb-10 space-y-4 max-w-[480px] mx-auto">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/bookings" })} className="h-9 w-9 rounded-full bg-card border border-border/60 flex items-center justify-center active:scale-95" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-lg font-bold text-foreground">📅 {t("new_booking")} · {t(titleKey)}</h1>
      </header>

      <section className="rounded-2xl bg-card border border-border/60 p-4 space-y-3">
        <label className="block">
          <span className="text-[11px] text-muted-foreground">{t("customer_name")}</span>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={120}
            className="mt-1 w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2.5 text-sm" />
        </label>
        <label className="block">
          <span className="text-[11px] text-muted-foreground">{t("phone_number")}</span>
          <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} inputMode="tel" maxLength={30}
            className="mt-1 w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2.5 text-sm" />
        </label>
      </section>

      {services.length > 0 && (
        <section className="rounded-2xl bg-card border border-border/60 p-4 space-y-2">
          <span className="text-sm font-semibold">{t("select_service")}</span>
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}
            className="w-full rounded-xl bg-muted/40 border border-border/60 px-3 py-2.5 text-sm">
            <option value="">—</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </section>
      )}

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
          {!isDayAllowed ? (
            <p className="text-xs text-muted-foreground">{t("no_slots")}</p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {allSlots.map((s) => {
                const used = busySlots[s] ?? 0;
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
              {allSlots.length === 0 && <p className="text-xs text-muted-foreground col-span-4">{t("no_slots")}</p>}
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
        {saving ? t("saving") : t("save")}
      </button>
    </div>
  );
}