import type { Lang } from "@/contexts/I18nContext";
import type { BizType } from "@/lib/businessType";
import { safeLocalStorage } from "@/lib/safeStorage";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Templates per business type × language.
// Variable placeholders use [snake_case]. Unused placeholders are stripped.
// ---------------------------------------------------------------------------

type TplMap = Record<BizType, Record<Lang, string>>;

const ORDER_TPL: TplMap = {
  retail: {
    en:
      `Hi [customer_name]! 👋\n\n` +
      `Thank you for your order with [business_name]!\n\n` +
      `🛍️ Order: [code]\n` +
      `📦 Product: [product] x[quantity]\n` +
      `💰 Total: RM [amount]\n` +
      `💳 Status: [status]\n` +
      `[notes]` +
      `[payment_details]` +
      `Thank you for supporting our business! 🙏`,
    ms:
      `Hi [customer_name]! 👋\n\n` +
      `Terima kasih atas pesanan anda dengan [business_name]!\n\n` +
      `🛍️ Pesanan: [code]\n` +
      `📦 Produk: [product] x[quantity]\n` +
      `💰 Jumlah: RM [amount]\n` +
      `💳 Status: [status]\n` +
      `[notes]` +
      `[payment_details]` +
      `Terima kasih kerana menyokong perniagaan kami! 🙏`,
    zh:
      `你好 [customer_name]！👋\n\n` +
      `感谢您在 [business_name] 下单！\n\n` +
      `🛍️ 订单：[code]\n` +
      `📦 商品：[product] x[quantity]\n` +
      `💰 总额：RM [amount]\n` +
      `💳 状态：[status]\n` +
      `[notes]` +
      `[payment_details]` +
      `感谢您的支持！🙏`,
  },
  fnb: {
    en:
      `Hi [customer_name]! 👋\n\n` +
      `Thank you for your order with [business_name]!\n\n` +
      `🛍️ Order: [code]\n` +
      `🍱 Item: [product] x[quantity]\n` +
      `💰 Total: RM [amount]\n` +
      `💳 Status: [status]\n` +
      `[notes]` +
      `[payment_details]` +
      `Thank you for supporting our business! 🙏`,
    ms:
      `Hi [customer_name]! 👋\n\n` +
      `Terima kasih atas pesanan anda dengan [business_name]!\n\n` +
      `🛍️ Pesanan: [code]\n` +
      `🍱 Menu: [product] x[quantity]\n` +
      `💰 Jumlah: RM [amount]\n` +
      `💳 Status: [status]\n` +
      `[notes]` +
      `[payment_details]` +
      `Terima kasih kerana menyokong perniagaan kami! 🙏`,
    zh:
      `你好 [customer_name]！👋\n\n` +
      `感谢您在 [business_name] 下单！\n\n` +
      `🛍️ 订单：[code]\n` +
      `🍱 餐点：[product] x[quantity]\n` +
      `💰 总额：RM [amount]\n` +
      `💳 状态：[status]\n` +
      `[notes]` +
      `[payment_details]` +
      `感谢您的支持！🙏`,
  },
  education: {
    en:
      `Hi [customer_name]! 👋\n\n` +
      `Thank you for trusting [business_name]!\n\n` +
      `📋 Case: [code]\n` +
      `🎓 Service: [product]\n` +
      `💰 Fee: RM [amount]\n` +
      `💳 Status: [status]\n` +
      `[notes]` +
      `[payment_details]` +
      `We will assist you to the best of our ability! 🙏`,
    ms:
      `Hi [customer_name]! 👋\n\n` +
      `Terima kasih atas kepercayaan anda kepada [business_name]!\n\n` +
      `📋 Kes: [code]\n` +
      `🎓 Perkhidmatan: [product]\n` +
      `💰 Yuran: RM [amount]\n` +
      `💳 Status: [status]\n` +
      `[notes]` +
      `[payment_details]` +
      `Kami akan membantu anda sebaik mungkin! 🙏`,
    zh:
      `你好 [customer_name]！👋\n\n` +
      `感谢您信任 [business_name]！\n\n` +
      `📋 案例：[code]\n` +
      `🎓 服务：[product]\n` +
      `💰 费用：RM [amount]\n` +
      `💳 状态：[status]\n` +
      `[notes]` +
      `[payment_details]` +
      `我们将竭诚为您服务！🙏`,
  },
  beauty: {
    en:
      `Hi [customer_name]! 👋\n\n` +
      `Your appointment is confirmed! 💄\n\n` +
      `💄 Appointment: [code]\n` +
      `✨ Service: [product]\n` +
      `[date_time_line]` +
      `💰 Price: RM [amount]\n` +
      `💳 Status: [status]\n` +
      `[notes]` +
      `[payment_details]` +
      `See you soon! 🙏`,
    ms:
      `Hi [customer_name]! 👋\n\n` +
      `Temujanji anda telah disahkan! 💄\n\n` +
      `💄 Temujanji: [code]\n` +
      `✨ Perkhidmatan: [product]\n` +
      `[date_time_line]` +
      `💰 Harga: RM [amount]\n` +
      `💳 Status: [status]\n` +
      `[notes]` +
      `[payment_details]` +
      `Jumpa anda nanti! 🙏`,
    zh:
      `你好 [customer_name]！👋\n\n` +
      `您的预约已确认！💄\n\n` +
      `💄 预约：[code]\n` +
      `✨ 服务：[product]\n` +
      `[date_time_line]` +
      `💰 价格：RM [amount]\n` +
      `💳 状态：[status]\n` +
      `[notes]` +
      `[payment_details]` +
      `期待您的光临！🙏`,
  },
  property: {
    en:
      `Hi [customer_name]! 👋\n\n` +
      `Thank you for your interest in [business_name]!\n\n` +
      `🏠 Reference: [code]\n` +
      `🏠 Listing: [product]\n` +
      `💰 Budget: RM [amount]\n` +
      `[follow_up_line]` +
      `[notes]` +
      `We will contact you soon! 🙏`,
    ms:
      `Hi [customer_name]! 👋\n\n` +
      `Terima kasih atas minat anda dengan [business_name]!\n\n` +
      `🏠 Rujukan: [code]\n` +
      `🏠 Hartanah: [product]\n` +
      `💰 Anggaran: RM [amount]\n` +
      `[follow_up_line]` +
      `[notes]` +
      `Kami akan menghubungi anda tidak lama lagi! 🙏`,
    zh:
      `你好 [customer_name]！👋\n\n` +
      `感谢您对 [business_name] 的关注！\n\n` +
      `🏠 参考编号：[code]\n` +
      `🏠 房源：[product]\n` +
      `💰 预算：RM [amount]\n` +
      `[follow_up_line]` +
      `[notes]` +
      `我们将尽快与您联系！🙏`,
  },
  freelance: {
    en:
      `Hi [customer_name]! 👋\n\n` +
      `Your project has been received! 💼\n\n` +
      `💼 Project: [code]\n` +
      `🔧 Service: [product]\n` +
      `💰 Amount: RM [amount]\n` +
      `💳 Status: [status]\n` +
      `[deadline_line]` +
      `[notes]` +
      `[payment_details]` +
      `Thank you for trusting us! 🙏`,
    ms:
      `Hi [customer_name]! 👋\n\n` +
      `Projek anda telah diterima! 💼\n\n` +
      `💼 Projek: [code]\n` +
      `🔧 Perkhidmatan: [product]\n` +
      `💰 Jumlah: RM [amount]\n` +
      `💳 Status: [status]\n` +
      `[deadline_line]` +
      `[notes]` +
      `[payment_details]` +
      `Terima kasih atas kepercayaan anda! 🙏`,
    zh:
      `你好 [customer_name]！👋\n\n` +
      `您的项目已收到！💼\n\n` +
      `💼 项目：[code]\n` +
      `🔧 服务：[product]\n` +
      `💰 金额：RM [amount]\n` +
      `💳 状态：[status]\n` +
      `[deadline_line]` +
      `[notes]` +
      `[payment_details]` +
      `感谢您的信任！🙏`,
  },
};

const REMINDER_TPL: TplMap = {
  retail: {
    en:
      `Hi [customer_name]! 👋\n\n` +
      `This is a payment reminder for your order.\n\n` +
      `🛍️ Order: [code]\n` +
      `📦 Product: [product]\n` +
      `💰 Amount Due: RM [amount]\n\n` +
      `[payment_details]` +
      `Please make payment at your earliest convenience. Thank you! 🙏`,
    ms:
      `Hi [customer_name]! 👋\n\n` +
      `Ini adalah peringatan pembayaran untuk pesanan anda.\n\n` +
      `🛍️ Pesanan: [code]\n` +
      `📦 Produk: [product]\n` +
      `💰 Jumlah Perlu Dibayar: RM [amount]\n\n` +
      `[payment_details]` +
      `Sila buat pembayaran secepat mungkin. Terima kasih! 🙏`,
    zh:
      `你好 [customer_name]！👋\n\n` +
      `这是您订单的付款提醒。\n\n` +
      `🛍️ 订单：[code]\n` +
      `📦 商品：[product]\n` +
      `💰 待付金额：RM [amount]\n\n` +
      `[payment_details]` +
      `请尽快完成付款，谢谢！🙏`,
  },
  fnb: {
    en:
      `Hi [customer_name]! 👋\n\n` +
      `This is a payment reminder for your order.\n\n` +
      `🛍️ Order: [code]\n` +
      `🍱 Item: [product]\n` +
      `💰 Amount Due: RM [amount]\n\n` +
      `[payment_details]` +
      `Please make payment at your earliest convenience. Thank you! 🙏`,
    ms:
      `Hi [customer_name]! 👋\n\n` +
      `Ini adalah peringatan pembayaran untuk pesanan anda.\n\n` +
      `🛍️ Pesanan: [code]\n` +
      `🍱 Menu: [product]\n` +
      `💰 Jumlah Perlu Dibayar: RM [amount]\n\n` +
      `[payment_details]` +
      `Sila buat pembayaran secepat mungkin. Terima kasih! 🙏`,
    zh:
      `你好 [customer_name]！👋\n\n` +
      `这是您订单的付款提醒。\n\n` +
      `🛍️ 订单：[code]\n` +
      `🍱 餐点：[product]\n` +
      `💰 待付金额：RM [amount]\n\n` +
      `[payment_details]` +
      `请尽快完成付款，谢谢！🙏`,
  },
  education: {
    en:
      `Hi [customer_name]! 👋\n\n` +
      `Reminder for your outstanding consultation fee.\n\n` +
      `📋 Case: [code]\n` +
      `🎓 Service: [product]\n` +
      `💰 Outstanding Fee: RM [amount]\n\n` +
      `[payment_details]` +
      `Please make payment. Thank you! 🙏`,
    ms:
      `Hi [customer_name]! 👋\n\n` +
      `Peringatan pembayaran yuran perundingan anda.\n\n` +
      `📋 Kes: [code]\n` +
      `🎓 Perkhidmatan: [product]\n` +
      `💰 Yuran Belum Dibayar: RM [amount]\n\n` +
      `[payment_details]` +
      `Sila buat pembayaran. Terima kasih! 🙏`,
    zh:
      `你好 [customer_name]！👋\n\n` +
      `您的咨询费用付款提醒。\n\n` +
      `📋 案例：[code]\n` +
      `🎓 服务：[product]\n` +
      `💰 未付费用：RM [amount]\n\n` +
      `[payment_details]` +
      `请尽快付款，谢谢！🙏`,
  },
  beauty: {
    en:
      `Hi [customer_name]! 👋\n\n` +
      `Reminder for your outstanding payment.\n\n` +
      `💄 Appointment: [code]\n` +
      `✨ Service: [product]\n` +
      `💰 Amount Due: RM [amount]\n\n` +
      `[payment_details]` +
      `Please make payment. Thank you! 🙏`,
    ms:
      `Hi [customer_name]! 👋\n\n` +
      `Peringatan pembayaran tertunggak anda.\n\n` +
      `💄 Temujanji: [code]\n` +
      `✨ Perkhidmatan: [product]\n` +
      `💰 Jumlah Perlu Dibayar: RM [amount]\n\n` +
      `[payment_details]` +
      `Sila buat pembayaran. Terima kasih! 🙏`,
    zh:
      `你好 [customer_name]！👋\n\n` +
      `您的未付款项提醒。\n\n` +
      `💄 预约：[code]\n` +
      `✨ 服务：[product]\n` +
      `💰 待付金额：RM [amount]\n\n` +
      `[payment_details]` +
      `请尽快付款，谢谢！🙏`,
  },
  property: {
    en:
      `Hi [customer_name]! 👋\n\n` +
      `Reminder for your outstanding payment.\n\n` +
      `🏠 Reference: [code]\n` +
      `🏠 Listing: [product]\n` +
      `💰 Amount Due: RM [amount]\n\n` +
      `Please make payment. Thank you! 🙏`,
    ms:
      `Hi [customer_name]! 👋\n\n` +
      `Peringatan pembayaran tertunggak anda.\n\n` +
      `🏠 Rujukan: [code]\n` +
      `🏠 Hartanah: [product]\n` +
      `💰 Jumlah Perlu Dibayar: RM [amount]\n\n` +
      `Sila buat pembayaran. Terima kasih! 🙏`,
    zh:
      `你好 [customer_name]！👋\n\n` +
      `您的未付款项提醒。\n\n` +
      `🏠 参考编号：[code]\n` +
      `🏠 房源：[product]\n` +
      `💰 待付金额：RM [amount]\n\n` +
      `请尽快付款，谢谢！🙏`,
  },
  freelance: {
    en:
      `Hi [customer_name]! 👋\n\n` +
      `Reminder for your outstanding project payment.\n\n` +
      `💼 Project: [code]\n` +
      `🔧 Service: [product]\n` +
      `💰 Amount Due: RM [amount]\n\n` +
      `[payment_details]` +
      `Please make payment. Thank you! 🙏`,
    ms:
      `Hi [customer_name]! 👋\n\n` +
      `Peringatan pembayaran projek tertunggak anda.\n\n` +
      `💼 Projek: [code]\n` +
      `🔧 Perkhidmatan: [product]\n` +
      `💰 Jumlah Perlu Dibayar: RM [amount]\n\n` +
      `[payment_details]` +
      `Sila buat pembayaran. Terima kasih! 🙏`,
    zh:
      `你好 [customer_name]！👋\n\n` +
      `您的项目未付款项提醒。\n\n` +
      `💼 项目：[code]\n` +
      `🔧 服务：[product]\n` +
      `💰 待付金额：RM [amount]\n\n` +
      `[payment_details]` +
      `请尽快付款，谢谢！🙏`,
  },
};

// Retail-EN canonical defaults exported for the Profile template editor.
export const DEFAULT_ORDER_TPL = ORDER_TPL.retail.en;
export const DEFAULT_REMINDER_TPL = REMINDER_TPL.retail.en;

// ---------------------------------------------------------------------------
// Receipt template (Paid orders). One template per language — works for all
// business types since the wording is generic enough.
// ---------------------------------------------------------------------------
const RECEIPT_TPL: Record<Lang, string> = {
  en:
    `Hi [customer_name],\n\n` +
    `Thank you! Your payment has been received.\n\n` +
    `- Order: [code]\n` +
    `- Item: [product] x[quantity]\n` +
    `- Paid: RM [amount]\n` +
    `[receipt_line]` +
    `Thank you for your business with [business_name].`,
  ms:
    `Hi [customer_name],\n\n` +
    `Terima kasih! Pembayaran anda telah diterima.\n\n` +
    `- Pesanan: [code]\n` +
    `- Item: [product] x[quantity]\n` +
    `- Dibayar: RM [amount]\n` +
    `[receipt_line]` +
    `Terima kasih kerana berurusan dengan [business_name].`,
  zh:
    `你好 [customer_name]，\n\n` +
    `已收到您的付款，谢谢！\n\n` +
    `- 订单：[code]\n` +
    `- 商品：[product] x[quantity]\n` +
    `- 已付：RM [amount]\n` +
    `[receipt_line]` +
    `感谢您光顾 [business_name]！`,
};

const RECEIPT_LABEL: Record<Lang, string> = { en: "Receipt", ms: "Resit", zh: "收据" };

export function getReceiptTemplate(lang: Lang): string {
  return RECEIPT_TPL[lang] ?? RECEIPT_TPL.en;
}

export function receiptLineLabel(lang: Lang): string {
  return RECEIPT_LABEL[lang];
}

/** True if `tpl` matches any built-in order template across biz × lang. */
export function isBuiltInOrderTpl(tpl: string | null | undefined): boolean {
  if (!tpl) return true;
  const t = tpl.trim();
  for (const biz of Object.keys(ORDER_TPL) as BizType[]) {
    for (const l of Object.keys(ORDER_TPL[biz]) as Lang[]) {
      if (ORDER_TPL[biz][l].trim() === t) return true;
    }
  }
  return false;
}

/** True if `tpl` matches any built-in reminder template across biz × lang. */
export function isBuiltInReminderTpl(tpl: string | null | undefined): boolean {
  if (!tpl) return true;
  const t = tpl.trim();
  for (const biz of Object.keys(REMINDER_TPL) as BizType[]) {
    for (const l of Object.keys(REMINDER_TPL[biz]) as Lang[]) {
      if (REMINDER_TPL[biz][l].trim() === t) return true;
    }
  }
  return false;
}

const NOTES_LABEL: Record<Lang, string> = { en: "Notes", ms: "Nota", zh: "备注" };

const DATE_TIME_LABEL: Record<Lang, string> = {
  en: "Date & Time",
  ms: "Tarikh & Masa",
  zh: "日期和时间",
};
const FOLLOW_UP_LABEL: Record<Lang, string> = {
  en: "Follow-up",
  ms: "Susulan",
  zh: "跟进日期",
};
const DEADLINE_LABEL: Record<Lang, string> = {
  en: "Deadline",
  ms: "Tarikh Akhir",
  zh: "截止日期",
};

const PAYMENT_LABELS: Record<Lang, { header: string; name: string; bank: string; qr: string }> = {
  en: {
    header: "Payment Details",
    name: "Name",
    bank: "Bank",
    qr: "QR Code",
  },
  ms: {
    header: "Maklumat Pembayaran",
    name: "Nama",
    bank: "Bank",
    qr: "Kod QR",
  },
  zh: {
    header: "付款方式",
    name: "户名",
    bank: "银行",
    qr: "QR码",
  },
};

export type PaymentMethod = {
  type?: string | null;
  number?: string | null;
  name?: string | null;
  bank?: string | null;
  qr_url?: string | null;
};

export function formatPaymentBlock(
  methods: PaymentMethod[],
  lang: Lang = getActiveLang(),
): string {
  const valid = methods.filter((m) => m && m.type);
  if (valid.length === 0) return "";
  const sep = lang === "zh" ? "：" : ": ";
  const labels = PAYMENT_LABELS[lang];
  const lines: string[] = ["━━━━━━━━━━━━━━━", `💳 ${labels.header}${sep}`];
  for (const m of valid) {
    lines.push(m.number ? `${m.type}${sep}${m.number}` : String(m.type));
    if (m.bank) lines.push(`${labels.bank}${sep}${m.bank}`);
    if (m.name) lines.push(`${labels.name}${sep}${m.name}`);
    if (m.qr_url) lines.push(`📷 ${labels.qr}${sep}${m.qr_url}`);
  }
  lines.push("━━━━━━━━━━━━━━━");
  return lines.join("\n") + "\n\n";
}

export async function fetchFreshPaymentBlock(userId: string, lang: Lang = getActiveLang()): Promise<string> {
  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("payment_method_1_type,payment_method_1_number,payment_method_1_name,payment_method_1_bank,payment_method_1_qr_url,payment_method_2_type,payment_method_2_number,payment_method_2_name,payment_method_2_bank,payment_method_2_qr_url")
    .eq("id", userId)
    .single();
  const profile = profileRaw as any;

  if (!profile?.payment_method_1_type) return "";

  const methods: PaymentMethod[] = [{
    type: profile.payment_method_1_type,
    number: profile.payment_method_1_number,
    name: profile.payment_method_1_name,
    bank: profile.payment_method_1_bank,
    qr_url: profile.payment_method_1_qr_url ?? null,
  }];

  if (profile.payment_method_2_type) {
    methods.push({
      type: profile.payment_method_2_type,
      number: profile.payment_method_2_number,
      name: profile.payment_method_2_name,
      bank: profile.payment_method_2_bank,
      qr_url: profile.payment_method_2_qr_url ?? null,
    });
  }

  return formatPaymentBlock(methods, lang);
}

/** Fetch payment block + business name in a single profile read. */
export async function fetchWAProfile(
  userId: string,
  lang: Lang = getActiveLang(),
): Promise<{ paymentDetails: string; businessName: string }> {
  const { data: profileRaw } = await supabase
    .from("profiles")
    .select(
      "business_name,payment_method_1_type,payment_method_1_number,payment_method_1_name,payment_method_1_bank,payment_method_1_qr_url,payment_method_2_type,payment_method_2_number,payment_method_2_name,payment_method_2_bank,payment_method_2_qr_url",
    )
    .eq("id", userId)
    .single();
  const profile = profileRaw as any;

  const businessName = profile?.business_name?.trim() || "us";
  if (!profile?.payment_method_1_type) return { paymentDetails: "", businessName };

  const methods: PaymentMethod[] = [{
    type: profile.payment_method_1_type,
    number: profile.payment_method_1_number,
    name: profile.payment_method_1_name,
    bank: profile.payment_method_1_bank,
    qr_url: profile.payment_method_1_qr_url ?? null,
  }];
  if (profile.payment_method_2_type) {
    methods.push({
      type: profile.payment_method_2_type,
      number: profile.payment_method_2_number,
      name: profile.payment_method_2_name,
      bank: profile.payment_method_2_bank,
      qr_url: profile.payment_method_2_qr_url ?? null,
    });
  }
  return { paymentDetails: formatPaymentBlock(methods, lang), businessName };
}

export function getActiveLang(): Lang {
  if (typeof window === "undefined") return "en";
  const v = safeLocalStorage.getItem("bossify_lang") as Lang | null;
  return v === "en" || v === "ms" || v === "zh" ? v : "en";
}

function resolveBiz(biz: BizType | null | undefined): BizType {
  return (biz ?? "retail") as BizType;
}

export function getOrderTemplate(
  lang: Lang,
  biz: BizType | null | undefined,
  customTpl?: string | null,
): string {
  // Custom template only when actually customised away from English retail default.
  if (customTpl && customTpl.trim() && customTpl !== DEFAULT_ORDER_TPL) return customTpl;
  const b = resolveBiz(biz);
  return ORDER_TPL[b][lang] ?? ORDER_TPL.retail.en;
}

export function getReminderTemplate(
  lang: Lang,
  biz: BizType | null | undefined,
  customTpl?: string | null,
): string {
  if (customTpl && customTpl.trim() && customTpl !== DEFAULT_REMINDER_TPL) return customTpl;
  const b = resolveBiz(biz);
  return REMINDER_TPL[b][lang] ?? REMINDER_TPL.retail.en;
}

export type TplVars = {
  customer_name?: string;
  business_name?: string;
  code?: string;
  product?: string;
  quantity?: string | number;
  amount?: string | number;
  status?: string;
  notes?: string;
  days_ago?: string | number;
  payment_details?: string;
  date_time?: string;
  follow_up_date?: string;
  deadline?: string;
  receipt_url?: string;
};

export function renderTemplate(tpl: string, vars: TplVars, lang: Lang = getActiveLang()): string {
  let out = tpl;

  // notes line
  const noteLine = vars.notes ? `📝 ${NOTES_LABEL[lang]}: ${vars.notes}\n` : "";
  out = out.replace(/\[notes if not empty:[^\]]*\]/g, noteLine);
  out = out.replace(/\[notes\]/g, noteLine);

  // optional extras (composed lines so they cleanly disappear when empty)
  const dateTimeLine = vars.date_time ? `📅 ${DATE_TIME_LABEL[lang]}: ${vars.date_time}\n` : "";
  const followUpLine = vars.follow_up_date ? `📅 ${FOLLOW_UP_LABEL[lang]}: ${vars.follow_up_date}\n` : "";
  const deadlineLine = vars.deadline ? `📅 ${DEADLINE_LABEL[lang]}: ${vars.deadline}\n` : "";
  const receiptLine = vars.receipt_url ? `${RECEIPT_LABEL[lang]}: ${vars.receipt_url}\n\n` : "";
  out = out.replace(/\[date_time_line\]/g, dateTimeLine);
  out = out.replace(/\[follow_up_line\]/g, followUpLine);
  out = out.replace(/\[deadline_line\]/g, deadlineLine);
  out = out.replace(/\[receipt_line\]/g, receiptLine);

  // payment details (insert as-is; templates already include the placeholder)
  const payBlock = vars.payment_details ?? "";
  if (out.includes("[payment_details]")) {
    out = out.replace(/\[payment_details\]/g, payBlock ? `\n${payBlock}` : "");
  } else if (payBlock) {
    out = `${out.trim()}\n\n${payBlock}`;
  }

  // remaining scalar vars
  for (const [k, v] of Object.entries(vars)) {
    if (k === "notes" || k === "payment_details" || k === "date_time" || k === "follow_up_date" || k === "deadline" || k === "receipt_url") continue;
    out = out.replace(new RegExp(`\\[${k}\\]`, "g"), String(v ?? ""));
  }

  // strip any leftover unknown [placeholders] so users never see raw tokens
  out = out.replace(/\[[a-z_]+\]/gi, "");

  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export function buildWhatsAppLink(phone: string, message: string) {
  const cleaned = phone.replace(/[^0-9]/g, "");
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

export function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(1, Math.ceil(ms / 86400000));
}
