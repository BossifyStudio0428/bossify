import type { TKey } from "@/contexts/I18nContext";
import type { BizType } from "./businessType";

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";

export type BookingConfig = {
  days: number[]; // 0=Sun ... 6=Sat
  start: string;  // "HH:MM"
  end: string;    // "HH:MM"
  slot_minutes: 30 | 60 | 120;
  max_per_slot: number;
};

export const DEFAULT_BOOKING_CONFIG: BookingConfig = {
  days: [1, 2, 3, 4, 5],
  start: "09:00",
  end: "18:00",
  slot_minutes: 60,
  max_per_slot: 1,
};

export function normalizeBookingConfig(raw: unknown): BookingConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const days = Array.isArray(r.days)
    ? (r.days as unknown[])
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : DEFAULT_BOOKING_CONFIG.days;
  const slot = Number(r.slot_minutes);
  const slot_minutes = (slot === 30 || slot === 60 || slot === 120 ? slot : DEFAULT_BOOKING_CONFIG.slot_minutes) as 30 | 60 | 120;
  const max = Math.max(1, Math.min(50, Number(r.max_per_slot) || DEFAULT_BOOKING_CONFIG.max_per_slot));
  return {
    days,
    start: typeof r.start === "string" && /^\d{2}:\d{2}$/.test(r.start) ? r.start : DEFAULT_BOOKING_CONFIG.start,
    end: typeof r.end === "string" && /^\d{2}:\d{2}$/.test(r.end) ? r.end : DEFAULT_BOOKING_CONFIG.end,
    slot_minutes,
    max_per_slot: max,
  };
}

export function generateSlots(config: BookingConfig): string[] {
  const [sh, sm] = config.start.split(":").map(Number);
  const [eh, em] = config.end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const out: string[] = [];
  for (let m = startMin; m + config.slot_minutes <= endMin; m += config.slot_minutes) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return out;
}

export function bookingLabelKey(type: BizType | null | undefined): TKey {
  switch (type) {
    case "fnb":       return "bl_table_reservation";
    case "beauty":    return "bl_service_appointment";
    case "education": return "bl_consultation_booking";
    case "freelance": return "bl_meeting_booking";
    case "property":  return "bl_meeting_booking";
    case "retail":    return "bl_pickup_booking";
    default:          return "bl_booking_generic";
  }
}

export const DAY_SHORT_KEYS: TKey[] = [
  "sunday_short",
  "monday_short",
  "tuesday_short",
  "wednesday_short",
  "thursday_short",
  "friday_short",
  "saturday_short",
];

export function bookingStatusKey(s: string): TKey {
  switch (s) {
    case "confirmed": return "booking_confirmed";
    case "completed": return "booking_completed";
    case "cancelled": return "booking_cancelled";
    default:          return "booking_pending";
  }
}

export function bookingStatusColor(s: string): string {
  switch (s) {
    case "confirmed": return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    case "completed": return "bg-blue-500/15 text-blue-600 border-blue-500/30";
    case "cancelled": return "bg-red-500/15 text-red-600 border-red-500/30";
    default:          return "bg-amber-500/15 text-amber-600 border-amber-500/30";
  }
}