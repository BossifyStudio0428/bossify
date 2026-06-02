import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { FileOpener } from "@capacitor-community/file-opener";
import type { Lang } from "@/contexts/I18nContext";
import type { BizType } from "@/lib/businessType";

// Brand purple (#6C3FD6) and alt-row tint (#F0EEF8)
const PURPLE: [number, number, number] = [108, 63, 214];
const ALT_ROW: [number, number, number] = [240, 238, 248];

// ---------------------------------------------------------------------------
// Localized labels
// ---------------------------------------------------------------------------

type ReportLabels = {
  reportTitle: string;
  dateRange: string;
  generated: string;
  page: string;
  summary: string;
  value: string;
  // metric labels
  totalRevenue: string;
  totalCost: string;
  grossProfit: string;
  profitMargin: string;
  totalOrders: string;
  paidOrders: string;
  unpaidAmount: string;
  totalCases: string;
  paidCases: string;
  completedCases: string;
  inProgress: string;
  totalAppointments: string;
  paidAppointments: string;
  paid: string;
  totalLeads: string;
  completed: string;
  rejected: string;
  conversionRate: string;
  totalProjects: string;
  activeProjects: string;
  completedProjects: string;
  // table headers
  th: {
    date: string;
    orderId: string;
    caseId: string;
    appointmentId: string;
    leadId: string;
    projectId: string;
    customer: string;
    client: string;
    product: string;
    service: string;
    package: string;
    qty: string;
    price: string;
    fee: string;
    amount: string;
    budget: string;
    duration: string;
    status: string;
    paymentStatus: string;
    applicationStatus: string;
    followUpDate: string;
    deadline: string;
  };
  // generic
  topProducts: string;
  bestCustomers: string;
  orders: string;
};

const REPORT_TITLE: Record<BizType, Record<Lang, string>> = {
  retail:    { en: "SALES REPORT",       ms: "LAPORAN JUALAN",   zh: "销售报告" },
  fnb:       { en: "SALES REPORT",       ms: "LAPORAN JUALAN",   zh: "销售报告" },
  education: { en: "CASE REPORT",        ms: "LAPORAN KES",      zh: "案例报告" },
  beauty:    { en: "APPOINTMENT REPORT", ms: "LAPORAN TEMUJANJI",zh: "预约报告" },
  property:  { en: "LEAD REPORT",        ms: "LAPORAN PROSPEK",  zh: "潜在客户报告" },
  freelance: { en: "PROJECT REPORT",     ms: "LAPORAN PROJEK",   zh: "项目报告" },
};

const L: Record<Lang, Omit<ReportLabels, "reportTitle">> = {
  en: {
    dateRange: "Date Range", generated: "Generated", page: "Page",
    summary: "Summary", value: "Value",
    totalRevenue: "Total Revenue", totalCost: "Total Cost",
    grossProfit: "Gross Profit", profitMargin: "Profit Margin",
    totalOrders: "Total Orders", paidOrders: "Paid Orders",
    unpaidAmount: "Unpaid Amount",
    totalCases: "Total Cases", paidCases: "Paid Cases",
    completedCases: "Completed Cases", inProgress: "In Progress",
    totalAppointments: "Total Appointments", paidAppointments: "Paid Appointments",
    paid: "Paid",
    totalLeads: "Total Leads", completed: "Completed", rejected: "Rejected",
    conversionRate: "Conversion Rate",
    totalProjects: "Total Projects", activeProjects: "Active Projects",
    completedProjects: "Completed Projects",
    th: {
      date: "Date", orderId: "Order ID", caseId: "Case ID",
      appointmentId: "Appointment ID", leadId: "Lead ID", projectId: "Project ID",
      customer: "Customer", client: "Client",
      product: "Product", service: "Service", package: "Package",
      qty: "Qty", price: "Price", fee: "Fee", amount: "Amount", budget: "Budget",
      duration: "Duration", status: "Status",
      paymentStatus: "Payment Status", applicationStatus: "Application Status",
      followUpDate: "Follow-up Date", deadline: "Deadline",
    },
    topProducts: "Top Products", bestCustomers: "Best Customers", orders: "Orders",
  },
  ms: {
    dateRange: "Julat Tarikh", generated: "Dijana", page: "Halaman",
    summary: "Ringkasan", value: "Nilai",
    totalRevenue: "Jumlah Pendapatan", totalCost: "Jumlah Kos",
    grossProfit: "Untung Kasar", profitMargin: "Margin Untung",
    totalOrders: "Jumlah Pesanan", paidOrders: "Pesanan Berbayar",
    unpaidAmount: "Jumlah Tertunggak",
    totalCases: "Jumlah Kes", paidCases: "Kes Berbayar",
    completedCases: "Kes Selesai", inProgress: "Dalam Proses",
    totalAppointments: "Jumlah Temujanji", paidAppointments: "Temujanji Berbayar",
    paid: "Berbayar",
    totalLeads: "Jumlah Prospek", completed: "Selesai", rejected: "Ditolak",
    conversionRate: "Kadar Penukaran",
    totalProjects: "Jumlah Projek", activeProjects: "Projek Aktif",
    completedProjects: "Projek Selesai",
    th: {
      date: "Tarikh", orderId: "ID Pesanan", caseId: "ID Kes",
      appointmentId: "ID Temujanji", leadId: "ID Prospek", projectId: "ID Projek",
      customer: "Pelanggan", client: "Klien",
      product: "Produk", service: "Perkhidmatan", package: "Pakej",
      qty: "Kuantiti", price: "Harga", fee: "Yuran", amount: "Jumlah", budget: "Anggaran",
      duration: "Tempoh", status: "Status",
      paymentStatus: "Status Bayaran", applicationStatus: "Status Permohonan",
      followUpDate: "Tarikh Susulan", deadline: "Tarikh Akhir",
    },
    topProducts: "Produk Terlaris", bestCustomers: "Pelanggan Terbaik", orders: "Pesanan",
  },
  zh: {
    dateRange: "日期范围", generated: "生成时间", page: "页",
    summary: "摘要", value: "数值",
    totalRevenue: "总收入", totalCost: "总成本",
    grossProfit: "毛利润", profitMargin: "利润率",
    totalOrders: "总订单", paidOrders: "已付订单",
    unpaidAmount: "未付金额",
    totalCases: "总案例", paidCases: "已付案例",
    completedCases: "已完成案例", inProgress: "处理中",
    totalAppointments: "总预约", paidAppointments: "已付预约",
    paid: "已付",
    totalLeads: "总潜在客户", completed: "已完成", rejected: "已拒绝",
    conversionRate: "转化率",
    totalProjects: "总项目", activeProjects: "活跃项目",
    completedProjects: "已完成项目",
    th: {
      date: "日期", orderId: "订单编号", caseId: "案例编号",
      appointmentId: "预约编号", leadId: "潜在客户编号", projectId: "项目编号",
      customer: "客户", client: "客户",
      product: "产品", service: "服务", package: "配套",
      qty: "数量", price: "价格", fee: "费用", amount: "金额", budget: "预算",
      duration: "时长", status: "状态",
      paymentStatus: "付款状态", applicationStatus: "申请状态",
      followUpDate: "跟进日期", deadline: "截止日期",
    },
    topProducts: "热门产品", bestCustomers: "顶级客户", orders: "订单",
  },
};

function labels(lang: Lang, biz: BizType): ReportLabels {
  return { reportTitle: REPORT_TITLE[biz][lang], ...L[lang] };
}

// ---------------------------------------------------------------------------
// File save helper
// ---------------------------------------------------------------------------

export async function savePdf(doc: jsPDF, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const dataUri = doc.output("datauristring");
    const base64 = dataUri.split(",")[1];
    const res = await Filesystem.writeFile({
      path: filename, data: base64,
      directory: Directory.Documents, recursive: true,
    });
    try {
      await FileOpener.open({
        filePath: res.uri, contentType: "application/pdf", openWithDefault: true,
      });
      return;
    } catch (openErr) {
      console.error("[pdf] open failed, falling back to share", openErr);
      await Share.share({ title: filename, url: res.uri, dialogTitle: filename });
      return;
    }
  }
  try {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    doc.save(filename);
  }
}

// ---------------------------------------------------------------------------
// Header / footer chrome
// ---------------------------------------------------------------------------

function drawHeader(doc: jsPDF, l: ReportLabels, businessName: string, rangeLabel: string, logoDataUrl?: string | null) {
  doc.setFillColor(...PURPLE);
  doc.rect(0, 0, 210, 26, "F");
  doc.setTextColor(255, 255, 255);

  let textX = 14;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 12, 5, 16, 16);
      textX = 32;
    } catch { /* ignore bad image */ }
  }

  doc.setFontSize(16);
  doc.text(businessName || "Bossify", textX, 13);
  doc.setFontSize(11);
  doc.text(l.reportTitle, textX, 20);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(`${l.dateRange}: ${rangeLabel}`, 14, 34);
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(`${l.generated}: ${new Date().toLocaleString("en-MY")}`, 14, 39);
  doc.setTextColor(0, 0, 0);
}

function drawFooters(doc: jsPDF, l: ReportLabels) {
  const total = doc.getNumberOfPages();
  const when = new Date().toLocaleString("en-MY");
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.text(`Generated by Bossify — bossify-malaysia.lovable.app`, 14, h - 8);
    doc.text(`${l.page} ${i}/${total}  ·  ${when}`, w - 14, h - 8, { align: "right" });
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ReportRow = {
  date: string;
  code: string;
  customer: string;
  product: string;
  qty?: number;
  amount: number;
  status: string;
  duration?: string;
  followUpDate?: string;
  deadline?: string;
  applicationStatus?: string;
};

export type ReportData = {
  lang: Lang;
  bizType: BizType;
  businessName: string;
  logoDataUrl?: string | null;
  rangeLabel: string;
  totalRevenue: number;
  totalCost?: number;
  grossProfit?: number;
  profitMargin?: number;
  totalOrders: number;
  paidOrders: number;
  unpaidAmount: number;
  pendingCount?: number;
  unpaidCount?: number;
  completedCount?: number;
  topProducts?: { name: string; qty: number; revenue: number }[];
  topCustomers?: { name: string; orders: number; spent: number }[];
  rows: ReportRow[];
};

// ---------------------------------------------------------------------------
// Sales / case / appointment / lead / project report
// ---------------------------------------------------------------------------

function summaryForBiz(d: ReportData, l: ReportLabels): string[][] {
  const rm = (n: number) => `RM ${n.toFixed(2)}`;
  const biz = d.bizType;
  if (biz === "education") {
    const completed = d.completedCount ?? d.paidOrders;
    return [
      [l.totalCases, String(d.totalOrders)],
      [l.totalRevenue, rm(d.totalRevenue)],
      [l.paidCases, String(d.paidOrders)],
      [l.unpaidAmount, rm(d.unpaidAmount)],
      [l.completedCases, String(completed)],
      [l.inProgress, String(d.pendingCount ?? 0)],
    ];
  }
  if (biz === "beauty") {
    return [
      [l.totalAppointments, String(d.totalOrders)],
      [l.totalRevenue, rm(d.totalRevenue)],
      [l.paid, String(d.paidOrders)],
      [l.unpaidAmount, rm(d.unpaidAmount)],
    ];
  }
  if (biz === "property") {
    const conv = d.totalOrders > 0 ? ((d.paidOrders / d.totalOrders) * 100).toFixed(1) : "0.0";
    return [
      [l.totalLeads, String(d.totalOrders)],
      [l.completed, String(d.paidOrders)],
      [l.inProgress, String(d.pendingCount ?? 0)],
      [l.rejected, String(d.unpaidCount ?? 0)],
      [l.conversionRate, `${conv}%`],
      [l.totalRevenue, rm(d.totalRevenue)],
    ];
  }
  if (biz === "freelance") {
    return [
      [l.totalProjects, String(d.totalOrders)],
      [l.totalRevenue, rm(d.totalRevenue)],
      [l.activeProjects, String(d.pendingCount ?? 0)],
      [l.completedProjects, String(d.paidOrders)],
      [l.unpaidAmount, rm(d.unpaidAmount)],
    ];
  }
  // retail / fnb
  return [
    [l.totalRevenue, rm(d.totalRevenue)],
    [l.totalCost, rm(d.totalCost ?? 0)],
    [l.grossProfit, rm(d.grossProfit ?? 0)],
    [l.profitMargin, `${(d.profitMargin ?? 0).toFixed(1)}%`],
    [l.totalOrders, String(d.totalOrders)],
    [l.paidOrders, String(d.paidOrders)],
    [l.unpaidAmount, rm(d.unpaidAmount)],
  ];
}

function tableHeadersForBiz(biz: BizType, l: ReportLabels): string[] {
  const th = l.th;
  switch (biz) {
    case "education":
      return [th.date, th.caseId, th.client, th.service, th.fee, th.paymentStatus, th.applicationStatus];
    case "beauty":
      return [th.date, th.appointmentId, th.client, th.service, th.duration, th.price, th.status];
    case "property":
      return [th.date, th.leadId, th.client, th.package, th.budget, th.status, th.followUpDate];
    case "freelance":
      return [th.date, th.projectId, th.client, th.service, th.amount, th.status, th.deadline];
    default:
      return [th.date, th.orderId, th.customer, th.product, th.qty, th.price, th.status];
  }
}

function tableRowForBiz(biz: BizType, r: ReportRow): string[] {
  const amt = r.amount.toFixed(2);
  switch (biz) {
    case "education":
      return [r.date, r.code, r.customer, r.product, amt, r.status, r.applicationStatus ?? "—"];
    case "beauty":
      return [r.date, r.code, r.customer, r.product, r.duration ?? "—", amt, r.status];
    case "property":
      return [r.date, r.code, r.customer, r.product, amt, r.status, r.followUpDate ?? "—"];
    case "freelance":
      return [r.date, r.code, r.customer, r.product, amt, r.status, r.deadline ?? "—"];
    default:
      return [r.date, r.code, r.customer, r.product, String(r.qty ?? 1), amt, r.status];
  }
}

export async function exportSalesReportPDF(d: ReportData): Promise<void> {
  const doc = new jsPDF();
  const l = labels(d.lang, d.bizType);

  drawHeader(doc, l, d.businessName, d.rangeLabel, d.logoDataUrl);

  // Summary table
  autoTable(doc, {
    startY: 46,
    head: [[l.summary, l.value]],
    body: summaryForBiz(d, l),
    theme: "grid",
    headStyles: { fillColor: PURPLE, textColor: 255 },
    alternateRowStyles: { fillColor: ALT_ROW },
    styles: { fontSize: 10 },
  });

  let y = (doc as any).lastAutoTable.finalY + 8;

  if (d.topProducts && d.topProducts.length) {
    autoTable(doc, {
      startY: y,
      head: [[l.topProducts, l.th.qty, l.th.amount]],
      body: d.topProducts.map((p) => [p.name, String(p.qty), p.revenue.toFixed(2)]),
      theme: "striped",
      headStyles: { fillColor: PURPLE, textColor: 255 },
      alternateRowStyles: { fillColor: ALT_ROW },
      styles: { fontSize: 10 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (d.topCustomers && d.topCustomers.length) {
    autoTable(doc, {
      startY: y,
      head: [[l.bestCustomers, l.orders, l.th.amount]],
      body: d.topCustomers.map((c) => [c.name, String(c.orders), c.spent.toFixed(2)]),
      theme: "striped",
      headStyles: { fillColor: PURPLE, textColor: 255 },
      alternateRowStyles: { fillColor: ALT_ROW },
      styles: { fontSize: 10 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (d.rows.length) {
    autoTable(doc, {
      startY: y,
      head: [tableHeadersForBiz(d.bizType, l)],
      body: d.rows.map((r) => tableRowForBiz(d.bizType, r)),
      theme: "grid",
      headStyles: { fillColor: PURPLE, textColor: 255 },
      alternateRowStyles: { fillColor: ALT_ROW },
      styles: { fontSize: 8 },
    });
  }

  drawFooters(doc, l);

  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  await savePdf(doc, `Bossify_Report_${ymd}.pdf`);
}

// ---------------------------------------------------------------------------
// Orders list (lighter export from Orders screen)
// ---------------------------------------------------------------------------

export async function exportOrdersListPDF(opts: {
  lang: Lang;
  bizType: BizType;
  businessName: string;
  logoDataUrl?: string | null;
  statusLabel: string;
  rows: ReportRow[];
}): Promise<void> {
  const doc = new jsPDF();
  const l = labels(opts.lang, opts.bizType);

  drawHeader(doc, l, opts.businessName, opts.statusLabel, opts.logoDataUrl);

  autoTable(doc, {
    startY: 46,
    head: [tableHeadersForBiz(opts.bizType, l)],
    body: opts.rows.map((r) => tableRowForBiz(opts.bizType, r)),
    theme: "grid",
    headStyles: { fillColor: PURPLE, textColor: 255 },
    alternateRowStyles: { fillColor: ALT_ROW },
    styles: { fontSize: 9 },
  });

  drawFooters(doc, l);

  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  await savePdf(doc, `Bossify_Orders_${opts.statusLabel}_${ymd}.pdf`);
}
