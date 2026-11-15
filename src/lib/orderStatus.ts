/**
 * Display name and colour for every order status. Manual orders only use
 * Unpaid / Paid / Pending, but TikTok orders move on to Shipped, Delivered,
 * Cancelled or Refunded — those used to fall through to "Pending".
 */
const LABELS: Record<string, { en: string; zh: string; ms: string }> = {
  Unpaid: { en: "Unpaid", zh: "未付款", ms: "Belum bayar" },
  Paid: { en: "Paid", zh: "已付款", ms: "Sudah bayar" },
  Pending: { en: "Pending", zh: "待处理", ms: "Menunggu" },
  Shipped: { en: "Shipped", zh: "已发货", ms: "Dihantar" },
  Delivered: { en: "Delivered", zh: "已送达", ms: "Diterima" },
  Cancelled: { en: "Cancelled", zh: "已取消", ms: "Dibatalkan" },
  Refunded: { en: "Refunded", zh: "已退款", ms: "Dipulangkan" },
};

const CLASSES: Record<string, string> = {
  Unpaid: "bg-red-500/15 text-red-600",
  Paid: "bg-emerald-500/15 text-emerald-700",
  Pending: "bg-amber-500/15 text-amber-700",
  Shipped: "bg-sky-500/15 text-sky-700",
  Delivered: "bg-emerald-500/15 text-emerald-700",
  Cancelled: "bg-muted text-muted-foreground",
  Refunded: "bg-violet-500/15 text-violet-700",
};

const DOTS: Record<string, string> = {
  Unpaid: "bg-red-500",
  Paid: "bg-emerald-500 animate-pulse",
  Pending: "bg-amber-500",
  Shipped: "bg-sky-500",
  Delivered: "bg-emerald-600",
  Cancelled: "bg-muted-foreground",
  Refunded: "bg-violet-500",
};

export function orderStatusLabel(status: string | null | undefined, lang: string): string {
  const l = LABELS[String(status ?? "")];
  if (!l) return String(status ?? "—");
  return lang === "zh" ? l.zh : lang === "ms" ? l.ms : l.en;
}

export function orderStatusClass(status: string | null | undefined): string {
  return CLASSES[String(status ?? "")] ?? "bg-muted text-muted-foreground";
}

export function orderStatusDot(status: string | null | undefined): string {
  return DOTS[String(status ?? "")] ?? "bg-muted-foreground";
}
