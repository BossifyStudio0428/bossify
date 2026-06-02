import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { savePdf } from "@/lib/pdf";
import type { Lang } from "@/contexts/I18nContext";

const PURPLE: [number, number, number] = [108, 63, 214];
const ALT_ROW: [number, number, number] = [240, 238, 248];

const T = {
  en: {
    generated: "Generated", page: "Page",
    commissionReport: "Commission Report",
    listingsReport: "Listings Report",
    viewingsReport: "Viewings Report",
    docReport: "Document Checklist",
    total: "Total",
    summary: { totalCommissions: "Total Commissions", pending: "Pending", received: "Received", thisMonth: "This Month",
      totalListings: "Total Listings", available: "Available", sold: "Sold", rented: "Rented" },
    th: {
      property: "Property", client: "Client", type: "Type", price: "Price", rate: "Rate",
      commission: "Commission", status: "Status", date: "Date",
      title: "Title", forSaleRent: "For Sale/Rent", bedrooms: "Bedrooms",
      viewingDate: "Date", interest: "Interest", feedback: "Feedback",
      document: "Document", notes: "Notes",
    },
  },
  ms: {
    generated: "Dijana", page: "Muka surat",
    commissionReport: "Laporan Komisen",
    listingsReport: "Laporan Senarai",
    viewingsReport: "Laporan Tinjauan",
    docReport: "Senarai Dokumen",
    total: "Jumlah",
    summary: { totalCommissions: "Jumlah Komisen", pending: "Tertunggak", received: "Diterima", thisMonth: "Bulan Ini",
      totalListings: "Jumlah Senarai", available: "Tersedia", sold: "Terjual", rented: "Disewa" },
    th: {
      property: "Hartanah", client: "Pelanggan", type: "Jenis", price: "Harga", rate: "Kadar",
      commission: "Komisen", status: "Status", date: "Tarikh",
      title: "Tajuk", forSaleRent: "Jual/Sewa", bedrooms: "Bilik",
      viewingDate: "Tarikh", interest: "Minat", feedback: "Maklum Balas",
      document: "Dokumen", notes: "Nota",
    },
  },
  zh: {
    generated: "生成时间", page: "页",
    commissionReport: "佣金报告",
    listingsReport: "房源报告",
    viewingsReport: "看房报告",
    docReport: "文件清单",
    total: "总计",
    summary: { totalCommissions: "总佣金", pending: "待收", received: "已收", thisMonth: "本月",
      totalListings: "总房源", available: "可售", sold: "已售", rented: "已租" },
    th: {
      property: "房产", client: "客户", type: "类型", price: "价格", rate: "比率",
      commission: "佣金", status: "状态", date: "日期",
      title: "标题", forSaleRent: "出售/出租", bedrooms: "卧室",
      viewingDate: "日期", interest: "兴趣", feedback: "反馈",
      document: "文件", notes: "备注",
    },
  },
} as const;

function rm(n: number) {
  return `RM ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function drawHeader(doc: jsPDF, businessName: string, title: string, subtitle: string, lang: Lang) {
  const l = T[lang];
  doc.setFillColor(...PURPLE);
  doc.rect(0, 0, 210, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(businessName || "Bossify", 14, 13);
  doc.setFontSize(11);
  doc.text(title, 14, 20);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  if (subtitle) doc.text(subtitle, 14, 34);
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(`${l.generated}: ${new Date().toLocaleString("en-MY")}`, 14, subtitle ? 39 : 34);
  doc.setTextColor(0, 0, 0);
}

function drawFooters(doc: jsPDF, lang: Lang) {
  const l = T[lang];
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.text("Powered by Bossify — bossify-malaysia.lovable.app", 14, h - 8);
    doc.text(`${l.page} ${i}/${total}`, w - 14, h - 8, { align: "right" });
  }
}

function ymd() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

// ----- Commission report -----

export type CommissionPdfRow = {
  listing_title?: string | null;
  client_name: string;
  transaction_type: string;
  transaction_price: number;
  commission_rate: number;
  commission_amount: number;
  status: string;
  transaction_date: string;
};

export async function exportCommissionsPDF(opts: {
  lang: Lang; businessName: string; rows: CommissionPdfRow[];
  summary: { total: number; pending: number; received: number; month: number };
}) {
  const l = T[opts.lang];
  const doc = new jsPDF();
  drawHeader(doc, opts.businessName, l.commissionReport, "", opts.lang);

  autoTable(doc, {
    startY: 44,
    head: [[l.summary.totalCommissions, l.summary.thisMonth, l.summary.pending, l.summary.received]],
    body: [[rm(opts.summary.total), rm(opts.summary.month), rm(opts.summary.pending), rm(opts.summary.received)]],
    theme: "grid",
    headStyles: { fillColor: PURPLE, textColor: 255 },
    styles: { fontSize: 9 },
  });

  const y = (doc as any).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: y,
    head: [[l.th.property, l.th.client, l.th.type, l.th.price, l.th.rate, l.th.commission, l.th.status, l.th.date]],
    body: opts.rows.map((r) => [
      r.listing_title || "—",
      r.client_name || "—",
      r.transaction_type,
      rm(r.transaction_price),
      `${r.commission_rate}%`,
      rm(r.commission_amount),
      r.status,
      r.transaction_date,
    ]),
    foot: [["", "", "", "", l.total, rm(opts.summary.total), "", ""]],
    theme: "grid",
    headStyles: { fillColor: PURPLE, textColor: 255 },
    footStyles: { fillColor: ALT_ROW, textColor: 0, fontStyle: "bold" },
    alternateRowStyles: { fillColor: ALT_ROW },
    styles: { fontSize: 8 },
  });

  drawFooters(doc, opts.lang);
  await savePdf(doc, `Bossify_Commissions_${ymd()}.pdf`);
}

// ----- Listings report -----

export type ListingPdfRow = {
  title: string; property_type: string; listing_type: string;
  price: number; bedrooms: number | null; status: string;
};

export async function exportListingsPDF(opts: {
  lang: Lang; businessName: string; rows: ListingPdfRow[];
}) {
  const l = T[opts.lang];
  const doc = new jsPDF();
  drawHeader(doc, opts.businessName, l.listingsReport, "", opts.lang);

  const total = opts.rows.length;
  const available = opts.rows.filter((r) => r.status === "available").length;
  const sold = opts.rows.filter((r) => r.status === "sold").length;
  const rented = opts.rows.filter((r) => r.status === "rented").length;

  autoTable(doc, {
    startY: 44,
    head: [[l.summary.totalListings, l.summary.available, l.summary.sold, l.summary.rented]],
    body: [[String(total), String(available), String(sold), String(rented)]],
    theme: "grid",
    headStyles: { fillColor: PURPLE, textColor: 255 },
    styles: { fontSize: 9 },
  });

  const y = (doc as any).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: y,
    head: [[l.th.title, l.th.type, l.th.forSaleRent, l.th.price, l.th.bedrooms, l.th.status]],
    body: opts.rows.map((r) => [
      r.title, r.property_type, r.listing_type, rm(r.price), String(r.bedrooms ?? "—"), r.status,
    ]),
    theme: "grid",
    headStyles: { fillColor: PURPLE, textColor: 255 },
    alternateRowStyles: { fillColor: ALT_ROW },
    styles: { fontSize: 8 },
  });

  drawFooters(doc, opts.lang);
  await savePdf(doc, `Bossify_Listings_${ymd()}.pdf`);
}

// ----- Viewings report -----

export type ViewingPdfRow = {
  listing_title?: string | null;
  customer_name?: string | null;
  viewing_at: string;
  status: string;
  interest_level: string | null;
  feedback: string | null;
};

export async function exportViewingsPDF(opts: {
  lang: Lang; businessName: string; rows: ViewingPdfRow[];
}) {
  const l = T[opts.lang];
  const doc = new jsPDF();
  drawHeader(doc, opts.businessName, l.viewingsReport, "", opts.lang);

  autoTable(doc, {
    startY: 44,
    head: [[l.th.property, l.th.client, l.th.viewingDate, l.th.status, l.th.interest, l.th.feedback]],
    body: opts.rows.map((r) => [
      r.listing_title || "—",
      r.customer_name || "—",
      new Date(r.viewing_at).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" }),
      r.status,
      r.interest_level || "—",
      r.feedback || "—",
    ]),
    theme: "grid",
    headStyles: { fillColor: PURPLE, textColor: 255 },
    alternateRowStyles: { fillColor: ALT_ROW },
    styles: { fontSize: 8 },
  });

  drawFooters(doc, opts.lang);
  await savePdf(doc, `Bossify_Viewings_${ymd()}.pdf`);
}

// ----- Document checklist -----

export type DocChecklistItem = { name: string; status: string; notes?: string };

export async function exportDocumentChecklistPDF(opts: {
  lang: Lang; businessName: string;
  clientName: string; propertyTitle?: string | null;
  items: DocChecklistItem[];
}) {
  const l = T[opts.lang];
  const doc = new jsPDF();
  const subtitle = `${opts.clientName}${opts.propertyTitle ? ` — ${opts.propertyTitle}` : ""}`;
  drawHeader(doc, opts.businessName, l.docReport, subtitle, opts.lang);

  autoTable(doc, {
    startY: 46,
    head: [[l.th.document, l.th.status, l.th.notes]],
    body: opts.items.map((it) => [it.name, it.status, it.notes || "—"]),
    theme: "grid",
    headStyles: { fillColor: PURPLE, textColor: 255 },
    alternateRowStyles: { fillColor: ALT_ROW },
    styles: { fontSize: 9 },
  });

  drawFooters(doc, opts.lang);
  await savePdf(doc, `Bossify_Documents_${ymd()}.pdf`);
}