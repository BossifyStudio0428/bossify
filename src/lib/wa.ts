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

export function renderTemplate(tpl: string, vars: TplVars): string {
  let out = tpl;
  const noteLine = vars.notes ? `📝 Notes: ${vars.notes}\n` : "";
  out = out.replace(/\[notes if not empty:[^\]]*\]/g, noteLine);
  out = out.replace(/\[notes\]/g, noteLine);
  for (const [k, v] of Object.entries(vars)) {
    if (k === "notes") continue;
    out = out.replace(new RegExp(`\\[${k}\\]`, "g"), String(v ?? ""));
  }
  // collapse triple newlines
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export function buildWhatsAppLink(phone: string, message: string) {
  const cleaned = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

export function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}
