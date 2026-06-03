// Localized push/notification message templates by business type & language.
// Keys: new_order, unpaid_reminder, low_stock, follow_up_reminder,
//       morning_summary, closing_report, milestone.

import type { Lang } from "@/contexts/I18nContext";
import type { BizType } from "@/lib/businessType";

export type NotifKind =
  | "new_order"
  | "unpaid_reminder"
  | "low_stock"
  | "follow_up_reminder"
  | "morning_summary"
  | "closing_report"
  | "milestone";

type Vars = Record<string, string | number>;

function fill(tpl: string, vars: Vars = {}) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

type Msg = { title: string; body: string };
type LangPack = Record<Lang, Msg>;
type BizPack = Partial<Record<BizType | "default", LangPack>>;

// NEW ORDER / CASE / APPOINTMENT / LEAD / PROJECT
const NEW_ORDER: BizPack = {
  default: {
    en: { title: "New order received! 🛍️", body: "{customer} — RM {amount}" },
    ms: { title: "Pesanan baru diterima! 🛍️", body: "{customer} — RM {amount}" },
    zh: { title: "收到新订单！🛍️", body: "{customer} — RM {amount}" },
  },
  education: {
    en: { title: "New case received! 🎓", body: "{customer} — RM {amount}" },
    ms: { title: "Kes baru diterima! 🎓", body: "{customer} — RM {amount}" },
    zh: { title: "收到新案例！🎓", body: "{customer} — RM {amount}" },
  },
  beauty: {
    en: { title: "New appointment! 💄", body: "{customer} — RM {amount}" },
    ms: { title: "Temujanji baru! 💄", body: "{customer} — RM {amount}" },
    zh: { title: "新预约！💄", body: "{customer} — RM {amount}" },
  },
  property: {
    en: { title: "New customer! 🏠", body: "{customer} — RM {amount}" },
    ms: { title: "Pelanggan baru! 🏠", body: "{customer} — RM {amount}" },
    zh: { title: "新客户！🏠", body: "{customer} — RM {amount}" },
  },
  freelance: {
    en: { title: "New project received! 💼", body: "{customer} — RM {amount}" },
    ms: { title: "Projek baru diterima! 💼", body: "{customer} — RM {amount}" },
    zh: { title: "收到新项目！💼", body: "{customer} — RM {amount}" },
  },
};

// UNPAID REMINDER  vars: {customer} {amount}
const UNPAID: BizPack = {
  default: {
    en: { title: "Payment Reminder ⚠️", body: "⚠️ {customer} has unpaid order of RM {amount}" },
    ms: { title: "Peringatan Pembayaran ⚠️", body: "⚠️ {customer} belum bayar pesanan RM {amount}" },
    zh: { title: "付款提醒 ⚠️", body: "⚠️ {customer} 有未付订单 RM {amount}" },
  },
  education: {
    en: { title: "Payment Reminder ⚠️", body: "⚠️ {customer} has unpaid consultation fee RM {amount}" },
    ms: { title: "Peringatan Pembayaran ⚠️", body: "⚠️ {customer} belum bayar yuran RM {amount}" },
    zh: { title: "付款提醒 ⚠️", body: "⚠️ {customer} 有未付咨询费 RM {amount}" },
  },
  beauty: {
    en: { title: "Payment Reminder ⚠️", body: "⚠️ {customer} has unpaid appointment RM {amount}" },
    ms: { title: "Peringatan Pembayaran ⚠️", body: "⚠️ {customer} belum bayar temujanji RM {amount}" },
    zh: { title: "付款提醒 ⚠️", body: "⚠️ {customer} 有未付预约 RM {amount}" },
  },
  property: {
    en: { title: "Payment Reminder ⚠️", body: "⚠️ {customer} has outstanding payment RM {amount}" },
    ms: { title: "Peringatan Pembayaran ⚠️", body: "⚠️ {customer} belum bayar RM {amount}" },
    zh: { title: "付款提醒 ⚠️", body: "⚠️ {customer} 有未付款项 RM {amount}" },
  },
  freelance: {
    en: { title: "Payment Reminder ⚠️", body: "⚠️ {customer} has unpaid project RM {amount}" },
    ms: { title: "Peringatan Pembayaran ⚠️", body: "⚠️ {customer} belum bayar projek RM {amount}" },
    zh: { title: "付款提醒 ⚠️", body: "⚠️ {customer} 有未付项目款 RM {amount}" },
  },
};

// LOW STOCK (retail/fnb)  vars: {product} {quantity}
const LOW_STOCK_PACK: LangPack = {
  en: { title: "Low Stock 📦", body: "📦 Low stock: {product} only {quantity} units left" },
  ms: { title: "Stok Rendah 📦", body: "📦 Stok rendah: {product} tinggal {quantity} unit" },
  zh: { title: "库存不足 📦", body: "📦 库存不足：{product} 只剩 {quantity} 件" },
};

// FOLLOW-UP  vars: {customer} {note}
const FOLLOW_UP_PACK: LangPack = {
  en: { title: "📅 Follow-up Reminder", body: "📅 Follow-up reminder: {customer} — {note}" },
  ms: { title: "📅 Peringatan Susulan", body: "📅 Peringatan susulan: {customer} — {note}" },
  zh: { title: "📅 跟进提醒", body: "📅 跟进提醒：{customer} — {note}" },
};

// MORNING SUMMARY  vars: {count} {revenue}
const MORNING: BizPack = {
  default: {
    en: { title: "Good morning, Boss! ☀️", body: "☀️ Yesterday: {count} orders, RM {revenue}" },
    ms: { title: "Selamat pagi, Boss! ☀️", body: "☀️ Semalam: {count} pesanan, RM {revenue}" },
    zh: { title: "早安，老板！☀️", body: "☀️ 昨日：{count} 个订单，RM {revenue}" },
  },
  education: {
    en: { title: "Good morning, Boss! ☀️", body: "☀️ Yesterday: {count} cases, RM {revenue}" },
    ms: { title: "Selamat pagi, Boss! ☀️", body: "☀️ Semalam: {count} kes, RM {revenue}" },
    zh: { title: "早安，老板！☀️", body: "☀️ 昨日：{count} 个案例，RM {revenue}" },
  },
  beauty: {
    en: { title: "Good morning, Boss! ☀️", body: "☀️ Yesterday: {count} appointments, RM {revenue}" },
    ms: { title: "Selamat pagi, Boss! ☀️", body: "☀️ Semalam: {count} temujanji, RM {revenue}" },
    zh: { title: "早安，老板！☀️", body: "☀️ 昨日：{count} 个预约，RM {revenue}" },
  },
  freelance: {
    en: { title: "Good morning, Boss! ☀️", body: "☀️ Yesterday: {count} projects, RM {revenue}" },
    ms: { title: "Selamat pagi, Boss! ☀️", body: "☀️ Semalam: {count} projek, RM {revenue}" },
    zh: { title: "早安，老板！☀️", body: "☀️ 昨日：{count} 个项目，RM {revenue}" },
  },
};

// CLOSING / EVENING  vars: {count} {revenue}
const CLOSING: BizPack = {
  default: {
    en: { title: "Closing Report 🌙", body: "🌙 Today: {count} orders, RM {revenue}" },
    ms: { title: "Laporan Penutup 🌙", body: "🌙 Hari ini: {count} pesanan, RM {revenue}" },
    zh: { title: "今日总结 🌙", body: "🌙 今日：{count} 个订单，RM {revenue}" },
  },
  education: {
    en: { title: "Closing Report 🌙", body: "🌙 Today: {count} new cases, RM {revenue}" },
    ms: { title: "Laporan Penutup 🌙", body: "🌙 Hari ini: {count} kes baru, RM {revenue}" },
    zh: { title: "今日总结 🌙", body: "🌙 今日：{count} 个新案例，RM {revenue}" },
  },
  beauty: {
    en: { title: "Closing Report 🌙", body: "🌙 Today: {count} appointments, RM {revenue}" },
    ms: { title: "Laporan Penutup 🌙", body: "🌙 Hari ini: {count} temujanji, RM {revenue}" },
    zh: { title: "今日总结 🌙", body: "🌙 今日：{count} 个预约，RM {revenue}" },
  },
  freelance: {
    en: { title: "Closing Report 🌙", body: "🌙 Today: {count} active projects, RM {revenue}" },
    ms: { title: "Laporan Penutup 🌙", body: "🌙 Hari ini: {count} projek aktif, RM {revenue}" },
    zh: { title: "今日总结 🌙", body: "🌙 今日：{count} 个活跃项目，RM {revenue}" },
  },
};

// MILESTONE  vars: {milestone}
const MILESTONE_PACK: LangPack = {
  en: { title: "🏆 Congratulations!", body: "🏆 Congratulations! {milestone}" },
  ms: { title: "🏆 Tahniah!", body: "🏆 Tahniah! {milestone}" },
  zh: { title: "🏆 恭喜！", body: "🏆 恭喜！{milestone}" },
};

function pickBiz(pack: BizPack, biz: BizType | null | undefined, lang: Lang): Msg {
  const eff = (biz ?? "retail") as BizType;
  const bucket =
    pack[eff] ??
    (eff === "fnb" ? pack.retail : undefined) ??
    pack.default!;
  return bucket[lang] ?? bucket.en;
}

export function getNotifMessage(
  kind: NotifKind,
  biz: BizType | null | undefined,
  lang: Lang,
  vars: Vars = {},
): Msg {
  let msg: Msg;
  switch (kind) {
    case "new_order":         msg = pickBiz(NEW_ORDER, biz, lang); break;
    case "unpaid_reminder":   msg = pickBiz(UNPAID, biz, lang); break;
    case "morning_summary":   msg = pickBiz(MORNING, biz, lang); break;
    case "closing_report":    msg = pickBiz(CLOSING, biz, lang); break;
    case "low_stock":         msg = LOW_STOCK_PACK[lang] ?? LOW_STOCK_PACK.en; break;
    case "follow_up_reminder":msg = FOLLOW_UP_PACK[lang] ?? FOLLOW_UP_PACK.en; break;
    case "milestone":         msg = MILESTONE_PACK[lang] ?? MILESTONE_PACK.en; break;
  }
  return { title: fill(msg.title, vars), body: fill(msg.body, vars) };
}
