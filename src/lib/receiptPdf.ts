import jsPDF from "jspdf";
import type { Lang } from "@/contexts/I18nContext";
import { applyCjkFont, CJK_FONT_FAMILY, hasCjk } from "@/lib/pdfCjk";

const PURPLE: [number, number, number] = [108, 63, 214];
const DARK: [number, number, number] = [30, 30, 30];
const MUTED: [number, number, number] = [110, 110, 110];
const LINE: [number, number, number] = [220, 220, 220];

type L = {
  title: string;
  paid: string;
  receiptNo: string;
  date: string;
  billTo: string;
  phone: string;
  description: string;
  qty: string;
  amount: string;
  total: string;
  paidWith: string;
  thanks: string;
  poweredBy: string;
};

const LABELS: Record<Lang, L> = {
  en: {
    title: "OFFICIAL RECEIPT",
    paid: "PAID",
    receiptNo: "Receipt No.",
    date: "Date",
    billTo: "Bill To",
    phone: "Phone",
    description: "Description",
    qty: "Qty",
    amount: "Amount",
    total: "Total Paid",
    paidWith: "Payment Method",
    thanks: "Thank you for your business!",
    poweredBy: "Powered by Bossify",
  },
  ms: {
    title: "RESIT RASMI",
    paid: "DIBAYAR",
    receiptNo: "No. Resit",
    date: "Tarikh",
    billTo: "Kepada",
    phone: "Telefon",
    description: "Keterangan",
    qty: "Kuantiti",
    amount: "Jumlah",
    total: "Jumlah Dibayar",
    paidWith: "Kaedah Bayaran",
    thanks: "Terima kasih atas sokongan anda!",
    poweredBy: "Dikuasakan oleh Bossify",
  },
  zh: {
    title: "正式收据",
    paid: "已付款",
    receiptNo: "收据编号",
    date: "日期",
    billTo: "客户",
    phone: "电话",
    description: "项目",
    qty: "数量",
    amount: "金额",
    total: "实付金额",
    paidWith: "付款方式",
    thanks: "感谢您的惠顾！",
    poweredBy: "由 Bossify 提供",
  },
};

export type ReceiptInput = {
  businessName: string;
  businessPhone?: string | null;
  customerName: string;
  customerPhone?: string | null;
  code: string;
  product: string;
  quantity: number;
  amount: number;
  createdAt: string;
  paymentLabel?: string | null;
  lang: Lang;
};

function formatDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  const locale = lang === "zh" ? "zh-CN" : lang === "ms" ? "ms-MY" : "en-MY";
  return d.toLocaleString(locale, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Build a polished single-page A5 receipt PDF and return it as a Blob. */
export async function buildReceiptPdf(input: ReceiptInput): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "portrait" });
  const labels = LABELS[input.lang];

  // Decide font: use CJK font for any content that needs it; otherwise helvetica.
  const needsCjk =
    input.lang === "zh" ||
    hasCjk(input.businessName) ||
    hasCjk(input.customerName) ||
    hasCjk(input.product) ||
    hasCjk(input.paymentLabel ?? "");

  if (needsCjk) await applyCjkFont(doc);
  const baseFont = needsCjk ? CJK_FONT_FAMILY : "helvetica";
  const setFont = (style: "normal" | "bold" = "normal") => {
    doc.setFont(baseFont, needsCjk ? "normal" : style);
  };

  const W = doc.internal.pageSize.getWidth();
  const M = 14;

  // ===== Header band =====
  doc.setFillColor(...PURPLE);
  doc.rect(0, 0, W, 26, "F");

  doc.setTextColor(255, 255, 255);
  setFont("bold");
  doc.setFontSize(18);
  doc.text(input.businessName || "Business", M, 13);

  setFont();
  doc.setFontSize(10);
  doc.text(labels.title, M, 20);

  // PAID badge (right)
  setFont("bold");
  doc.setFontSize(12);
  const paidW = doc.getTextWidth(labels.paid) + 8;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(W - M - paidW, 8, paidW, 10, 2, 2, "F");
  doc.setTextColor(...PURPLE);
  doc.text(labels.paid, W - M - paidW / 2, 15, { align: "center" });

  // ===== Meta block =====
  let y = 36;
  doc.setTextColor(...MUTED);
  setFont();
  doc.setFontSize(9);
  doc.text(`${labels.receiptNo}:`, M, y);
  doc.text(`${labels.date}:`, W / 2, y);

  doc.setTextColor(...DARK);
  setFont("bold");
  doc.setFontSize(10);
  doc.text(input.code, M, y + 5);
  doc.text(formatDate(input.createdAt, input.lang), W / 2, y + 5);

  // ===== Bill to =====
  y += 14;
  doc.setTextColor(...MUTED);
  setFont();
  doc.setFontSize(9);
  doc.text(`${labels.billTo}:`, M, y);

  doc.setTextColor(...DARK);
  setFont("bold");
  doc.setFontSize(11);
  doc.text(input.customerName || "-", M, y + 5);

  if (input.customerPhone) {
    setFont();
    doc.setTextColor(...MUTED);
    doc.setFontSize(9);
    doc.text(`${labels.phone}: ${input.customerPhone}`, M, y + 10);
  }

  // ===== Items table =====
  y += 20;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);

  y += 6;
  doc.setTextColor(...MUTED);
  setFont("bold");
  doc.setFontSize(9);
  doc.text(labels.description, M, y);
  doc.text(labels.qty, W - M - 35, y, { align: "right" });
  doc.text(labels.amount, W - M, y, { align: "right" });

  y += 3;
  doc.line(M, y, W - M, y);

  y += 7;
  doc.setTextColor(...DARK);
  setFont();
  doc.setFontSize(11);
  const productLines = doc.splitTextToSize(input.product || "-", W - M * 2 - 50);
  doc.text(productLines, M, y);
  doc.text(String(input.quantity), W - M - 35, y, { align: "right" });
  doc.text(`RM ${input.amount.toFixed(2)}`, W - M, y, { align: "right" });

  y += Math.max(8, productLines.length * 5) + 4;
  doc.line(M, y, W - M, y);

  // ===== Total =====
  y += 10;
  doc.setTextColor(...MUTED);
  setFont();
  doc.setFontSize(10);
  doc.text(labels.total, W - M - 50, y, { align: "right" });

  doc.setTextColor(...PURPLE);
  setFont("bold");
  doc.setFontSize(16);
  doc.text(`RM ${input.amount.toFixed(2)}`, W - M, y, { align: "right" });

  // ===== Payment method =====
  if (input.paymentLabel) {
    y += 10;
    doc.setTextColor(...MUTED);
    setFont();
    doc.setFontSize(9);
    doc.text(`${labels.paidWith}: `, M, y);
    doc.setTextColor(...DARK);
    setFont("bold");
    doc.text(input.paymentLabel, M + doc.getTextWidth(`${labels.paidWith}: `), y);
  }

  // ===== Footer =====
  const H = doc.internal.pageSize.getHeight();
  doc.setTextColor(...DARK);
  setFont("bold");
  doc.setFontSize(11);
  doc.text(labels.thanks, W / 2, H - 18, { align: "center" });

  doc.setTextColor(...MUTED);
  setFont();
  doc.setFontSize(8);
  doc.text(labels.poweredBy, W / 2, H - 10, { align: "center" });

  return doc.output("blob");
}