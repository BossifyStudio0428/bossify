import type { Lang } from "@/contexts/I18nContext";
import { safeLocalStorage } from "@/lib/safeStorage";

// English templates remain the canonical "DEFAULT" exported for the
// Profile template editor (so existing behaviour is preserved).
export const DEFAULT_ORDER_TPL =
  `Hi [customer_name]! 👋\n\n` +
  `Thank you for your order with Bossify! 🛍️\n\n` +
  `📋 Order: [code]\n` +
  `🛒 Product: [product] x[quantity]\n` +
  `💰 Total: RM [amount]\n` +
  `💳 Status: [status]\n` +
  `[notes]\n` +
  `Thank you for supporting our business! 🙏`;

export const DEFAULT_REMINDER_TPL =
  `Hi [customer_name]! 👋\n\n` +
  `Friendly reminder — your order has been waiting for payment for [days_ago] day(s). 😊\n\n` +
  `📋 Order: [code]\n` +
  `🛒 Product: [product] x[quantity]\n` +
  `💰 Amount due: RM [amount]\n\n` +
  `Please make payment at your earliest convenience. Thank you! 🙏`;

const ORDER_TPL_BY_LANG: Record<Lang, string> = {
  en: DEFAULT_ORDER_TPL,
  ms:
    `Hai [customer_name]! 👋\n\n` +
    `Terima kasih atas pesanan anda! 🛍️\n\n` +
    `📋 Pesanan: [code]\n` +
    `🛒 Produk: [product] x[quantity]\n` +
    `💰 Jumlah: RM [amount]\n` +
    `💳 Status: [status]\n` +
    `[notes]\n` +
    `Terima kasih kerana menyokong perniagaan kami! 🙏`,
  zh:
    `你好 [customer_name]！👋\n\n` +
    `感谢您的订单！🛍️\n\n` +
    `📋 订单：[code]\n` +
    `🛒 产品：[product] x[quantity]\n` +
    `💰 总额：RM [amount]\n` +
    `💳 状态：[status]\n` +
    `[notes]\n` +
    `感谢您支持我们的生意！🙏`,
};

const REMINDER_TPL_BY_LANG: Record<Lang, string> = {
  en: DEFAULT_REMINDER_TPL,
  ms:
    `Hai [customer_name]! 👋\n\n` +
    `Peringatan mesra — pesanan anda telah menunggu pembayaran selama [days_ago] hari. 😊\n\n` +
    `📋 Pesanan: [code]\n` +
    `🛒 Produk: [product] x[quantity]\n` +
    `💰 Jumlah perlu dibayar: RM [amount]\n\n` +
    `Sila buat pembayaran secepat mungkin. Terima kasih! 🙏`,
  zh:
    `你好 [customer_name]！👋\n\n` +
    `温馨提醒 — 您的订单已等待付款 [days_ago] 天。😊\n\n` +
    `📋 订单：[code]\n` +
    `🛒 产品：[product] x[quantity]\n` +
    `💰 待付金额：RM [amount]\n\n` +
    `请尽快完成付款。谢谢！🙏`,
};

const NOTES_LABEL: Record<Lang, string> = { en: "Notes", ms: "Nota", zh: "备注" };

export function getActiveLang(): Lang {
  if (typeof window === "undefined") return "en";
  const v = safeLocalStorage.getItem("bossify_lang") as Lang | null;
  return v === "en" || v === "ms" || v === "zh" ? v : "en";
}

export function getOrderTemplate(lang: Lang, customTpl?: string | null): string {
  // Use custom template only when user has actually customised it
  // (otherwise we'd lock everyone into English).
  if (customTpl && customTpl.trim() && customTpl !== DEFAULT_ORDER_TPL) return customTpl;
  return ORDER_TPL_BY_LANG[lang] ?? DEFAULT_ORDER_TPL;
}

export function getReminderTemplate(lang: Lang, customTpl?: string | null): string {
  if (customTpl && customTpl.trim() && customTpl !== DEFAULT_REMINDER_TPL) return customTpl;
  return REMINDER_TPL_BY_LANG[lang] ?? DEFAULT_REMINDER_TPL;
}

export type TplVars = {
  customer_name?: string;
  code?: string;
  product?: string;
  quantity?: string | number;
  amount?: string | number;
  status?: string;
  notes?: string;
  days_ago?: string | number;
};

export function renderTemplate(tpl: string, vars: TplVars, lang: Lang = getActiveLang()): string {
  let out = tpl;
  const noteLine = vars.notes ? `📝 ${NOTES_LABEL[lang]}: ${vars.notes}\n` : "";
  out = out.replace(/\[notes if not empty:[^\]]*\]/g, noteLine);
  out = out.replace(/\[notes\]/g, noteLine);
  for (const [k, v] of Object.entries(vars)) {
    if (k === "notes") continue;
    out = out.replace(new RegExp(`\\[${k}\\]`, "g"), String(v ?? ""));
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export function buildWhatsAppLink(phone: string, message: string) {
  const cleaned = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

export function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  // Always at least 1 day so reminder messages don't read "0 day(s)".
  return Math.max(1, Math.ceil(ms / 86400000));
}
