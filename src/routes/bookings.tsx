import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus, Phone, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import {
  bookingLabelKey,
  bookingStatusColor,
  bookingStatusKey,
} from "@/lib/booking";

export const Route = createFileRoute("/bookings")({ component: BookingsPage });

type Booking = {
  id: string;
  customer_name: string;
  customer_phone: string;
  service_name: string | null;
  booking_date: string;
  booking_time: string;
  duration_minutes: number | null;
  pax: number | null;
  status: string;
  notes: string | null;
};

type Filter = "today" | "upcoming" | "past" | "cancelled";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function digits(p: string) { return p.replace(/\D/g, ""); }

function BookingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { type } = useBusinessType();
  const titleKey = bookingLabelKey(type);

  const [filter, setFilter] = useState<Filter>("today");
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("bookings" as any)
      .select("id,customer_name,customer_phone,service_name,booking_date,booking_time,duration_minutes,pax,status,notes")
      .eq("user_id", user.id)
      .order("booking_date", { ascending: false })
      .order("booking_time", { ascending: false });
    setRows((data as Booking[] | null) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const today = todayStr();
  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "cancelled") return r.status === "cancelled";
      if (r.status === "cancelled") return false;
      if (filter === "today") return r.booking_date === today;
      if (filter === "upcoming") return r.booking_date > today;
      if (filter === "past") return r.booking_date < today;
      return true;
    });
  }, [rows, filter, today]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("bookings" as any).update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "cancelled" ? t("booking_cancelled_msg") : t("booking_updated"));
    load();
  };

  const filters: { id: Filter; label: string }[] = [
    { id: "today",     label: t("booking_today") },
    { id: "upcoming",  label: t("booking_upcoming") },
    { id: "past",      label: t("booking_past") },
    { id: "cancelled", label: t("booking_cancelled") },
  ];

  return (
    <div className="px-5 pt-10 pb-28 space-y-4 max-w-[480px] mx-auto">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate({ to: "/profile" })} className="h-9 w-9 rounded-full bg-card border border-border/60 flex items-center justify-center active:scale-95" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">📅 {t("bookings")}</h1>
            <p className="text-[11px] text-muted-foreground truncate">{t(titleKey)}</p>
          </div>
        </div>
        <Link to="/new-booking" className="h-10 px-3 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1 active:scale-95">
          <Plus className="h-4 w-4" /> {t("new_booking")}
        </Link>
      </header>

      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 no-scrollbar">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 h-8 rounded-full text-xs font-semibold whitespace-nowrap transition ${filter === f.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">{t("loading")}</p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          {t("no_bookings")}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((b) => (
            <BookingCard key={b.id} b={b} onChange={updateStatus} />
          ))}
        </div>
      )}
    </div>
  );
}

function BookingCard({ b, onChange }: { b: Booking; onChange: (id: string, status: string) => void }) {
  const { t } = useI18n();
  const phoneDigits = digits(b.customer_phone);
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">{b.customer_name}</p>
          <p className="text-[11px] text-muted-foreground">
            {b.booking_date} · {b.booking_time.slice(0, 5)}
            {b.duration_minutes ? ` · ${b.duration_minutes} min` : ""}
            {b.pax && b.pax > 1 ? ` · ${b.pax} ${t("pax")}` : ""}
          </p>
        </div>
        <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${bookingStatusColor(b.status)}`}>
          {t(bookingStatusKey(b.status))}
        </span>
      </div>
      {b.service_name && (
        <p className="text-xs text-foreground/80 truncate">🎯 {b.service_name}</p>
      )}
      {b.notes && (
        <p className="text-[11px] text-muted-foreground italic line-clamp-2">"{b.notes}"</p>
      )}
      <div className="flex items-center gap-2 pt-1">
        {phoneDigits && (
          <>
            <a href={`tel:${b.customer_phone}`} className="h-8 px-2.5 rounded-full bg-muted text-xs font-semibold flex items-center gap-1">
              <Phone className="h-3 w-3" /> Call
            </a>
            <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer" className="h-8 px-2.5 rounded-full bg-emerald-500/15 text-emerald-600 text-xs font-semibold flex items-center gap-1">
              <MessageCircle className="h-3 w-3" /> WhatsApp
            </a>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          {b.status !== "confirmed" && b.status !== "completed" && b.status !== "cancelled" && (
            <button onClick={() => onChange(b.id, "confirmed")} className="h-8 px-2.5 rounded-full bg-emerald-500/15 text-emerald-600 text-xs font-semibold">
              {t("mark_confirmed")}
            </button>
          )}
          {b.status !== "completed" && b.status !== "cancelled" && (
            <button onClick={() => onChange(b.id, "completed")} className="h-8 px-2.5 rounded-full bg-blue-500/15 text-blue-600 text-xs font-semibold">
              {t("bk_mark_completed")}
            </button>
          )}
          {b.status !== "cancelled" && (
            <button onClick={() => onChange(b.id, "cancelled")} className="h-8 px-2.5 rounded-full bg-red-500/15 text-red-600 text-xs font-semibold">
              {t("cancel_booking")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}