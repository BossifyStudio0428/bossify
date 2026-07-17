import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { FileOpener } from "@capacitor-community/file-opener";
import type { Lang } from "@/contexts/I18nContext";
import type { BizType } from "@/lib/businessType";
import { applyCjkFont, CJK_FONT_FAMILY } from "@/lib/pdfCjk";

// Brand purple (#6C3FD6) and alt-row tint (#F0EEF8)
const PURPLE: [number, number, number] = [108, 63, 214];
const ALT_ROW: [number, number, number] = [240, 238, 248];
type AutoTablePdf = jsPDF & { lastAutoTable?: { finalY: number } };

function isAndroidNative(): boolean {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return false;
  return true;
}

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
  retail: { en: "SALES REPORT", ms: "LAPORAN JUALAN", zh: "销售报告" },
  fnb: { en: "SALES REPORT", ms: "LAPORAN JUALAN", zh: "销售报告" },
  education: { en: "CASE REPORT", ms: "LAPORAN KES", zh: "案例报告" },
  beauty: { en: "APPOINTMENT REPORT", ms: "LAPORAN TEMUJANJI", zh: "预约报告" },
  property: { en: "LEAD REPORT", ms: "LAPORAN PROSPEK", zh: "潜在客户报告" },
  freelance: { en: "PROJECT REPORT", ms: "LAPORAN PROJEK", zh: "项目报告" },
};

const L: Record<Lang, Omit<ReportLabels, "reportTitle">> = {
  en: {
    dateRange: "Date Range",
    generated: "Generated",
    page: "Page",
    summary: "Summary",
    value: "Value",
    totalRevenue: "Total Revenue",
    totalCost: "Total Cost",
    grossProfit: "Gross Profit",
    profitMargin: "Profit Margin",
    totalOrders: "Total Orders",
    paidOrders: "Paid Orders",
    unpaidAmount: "Unpaid Amount",
    totalCases: "Total Cases",
    paidCases: "Paid Cases",
    completedCases: "Completed Cases",
    inProgress: "In Progress",
    totalAppointments: "Total Appointments",
    paidAppointments: "Paid Appointments",
    paid: "Paid",
    totalLeads: "Total Leads",
    completed: "Completed",
    rejected: "Rejected",
    conversionRate: "Conversion Rate",
    totalProjects: "Total Projects",
    activeProjects: "Active Projects",
    completedProjects: "Completed Projects",
    th: {
      date: "Date",
      orderId: "Order ID",
      caseId: "Case ID",
      appointmentId: "Appointment ID",
      leadId: "Lead ID",
      projectId: "Project ID",
      customer: "Customer",
      client: "Client",
      product: "Product",
      service: "Service",
      package: "Package",
      qty: "Qty",
      price: "Price",
      fee: "Fee",
      amount: "Amount",
      budget: "Budget",
      duration: "Duration",
      status: "Status",
      paymentStatus: "Payment Status",
      applicationStatus: "Application Status",
      followUpDate: "Follow-up Date",
      deadline: "Deadline",
    },
    topProducts: "Top Products",
    bestCustomers: "Best Customers",
    orders: "Orders",
  },
  ms: {
    dateRange: "Julat Tarikh",
    generated: "Dijana",
    page: "Halaman",
    summary: "Ringkasan",
    value: "Nilai",
    totalRevenue: "Jumlah Pendapatan",
    totalCost: "Jumlah Kos",
    grossProfit: "Untung Kasar",
    profitMargin: "Margin Untung",
    totalOrders: "Jumlah Pesanan",
    paidOrders: "Pesanan Berbayar",
    unpaidAmount: "Jumlah Tertunggak",
    totalCases: "Jumlah Kes",
    paidCases: "Kes Berbayar",
    completedCases: "Kes Selesai",
    inProgress: "Dalam Proses",
    totalAppointments: "Jumlah Temujanji",
    paidAppointments: "Temujanji Berbayar",
    paid: "Berbayar",
    totalLeads: "Jumlah Prospek",
    completed: "Selesai",
    rejected: "Ditolak",
    conversionRate: "Kadar Penukaran",
    totalProjects: "Jumlah Projek",
    activeProjects: "Projek Aktif",
    completedProjects: "Projek Selesai",
    th: {
      date: "Tarikh",
      orderId: "ID Pesanan",
      caseId: "ID Kes",
      appointmentId: "ID Temujanji",
      leadId: "ID Prospek",
      projectId: "ID Projek",
      customer: "Pelanggan",
      client: "Klien",
      product: "Produk",
      service: "Perkhidmatan",
      package: "Pakej",
      qty: "Kuantiti",
      price: "Harga",
      fee: "Yuran",
      amount: "Jumlah",
      budget: "Anggaran",
      duration: "Tempoh",
      status: "Status",
      paymentStatus: "Status Bayaran",
      applicationStatus: "Status Permohonan",
      followUpDate: "Tarikh Susulan",
      deadline: "Tarikh Akhir",
    },
    topProducts: "Produk Terlaris",
    bestCustomers: "Pelanggan Terbaik",
    orders: "Pesanan",
  },
  zh: {
    dateRange: "日期范围",
    generated: "生成时间",
    page: "页",
    summary: "摘要",
    value: "数值",
    totalRevenue: "总收入",
    totalCost: "总成本",
    grossProfit: "毛利润",
    profitMargin: "利润率",
    totalOrders: "总订单",
    paidOrders: "已付订单",
    unpaidAmount: "未付金额",
    totalCases: "总案例",
    paidCases: "已付案例",
    completedCases: "已完成案例",
    inProgress: "处理中",
    totalAppointments: "总预约",
    paidAppointments: "已付预约",
    paid: "已付",
    totalLeads: "总潜在客户",
    completed: "已完成",
    rejected: "已拒绝",
    conversionRate: "转化率",
    totalProjects: "总项目",
    activeProjects: "活跃项目",
    completedProjects: "已完成项目",
    th: {
      date: "日期",
      orderId: "订单编号",
      caseId: "案例编号",
      appointmentId: "预约编号",
      leadId: "潜在客户编号",
      projectId: "项目编号",
      customer: "客户",
      client: "客户",
      product: "产品",
      service: "服务",
      package: "配套",
      qty: "数量",
      price: "价格",
      fee: "费用",
      amount: "金额",
      budget: "预算",
      duration: "时长",
      status: "状态",
      paymentStatus: "付款状态",
      applicationStatus: "申请状态",
      followUpDate: "跟进日期",
      deadline: "截止日期",
    },
    topProducts: "热门产品",
    bestCustomers: "顶级客户",
    orders: "订单",
  },
};

function labels(lang: Lang, biz: BizType): ReportLabels {
  return { reportTitle: REPORT_TITLE[biz][lang], ...L[lang] };
}

// ---------------------------------------------------------------------------
// File save helper
// ---------------------------------------------------------------------------

export async function savePdf(doc: jsPDF, filename: string): Promise<void> {
  if (isAndroidNative()) {
    const dataUri = doc.output("datauristring");
    const base64 = dataUri.split(",")[1];
    if (!base64) throw new Error("Unable to generate PDF data");

    const safeFilename = filename.replace(/[^a-zA-Z0-9._ -]/g, "_");

    // Save directly to the device's Documents folder so the file is a real
    // download the user can find later, instead of opening a share sheet.
    let savedUri: string | null = null;
    try {
      await Filesystem.writeFile({
        path: safeFilename,
        data: base64,
        directory: Directory.Documents,
        recursive: true,
      });
      const { uri } = await Filesystem.getUri({
        path: safeFilename,
        directory: Directory.Documents,
      });
      savedUri = /^(file|content):\/\//.test(uri) ? uri : `file://${uri}`;
    } catch (writeErr) {
      console.error("[pdf] write to Documents failed, falling back to Cache", writeErr);
      await Filesystem.writeFile({
        path: safeFilename,
        data: base64,
        directory: Directory.Cache,
      });
      const { uri } = await Filesystem.getUri({
        path: safeFilename,
        directory: Directory.Cache,
      });
      savedUri = /^(file|content):\/\//.test(uri) ? uri : `file://${uri}`;
    }

    // Try to open the saved PDF in the device's default viewer. If that
    // fails, surface a friendly message — the file is already saved.
    try {
      await FileOpener.open({
        filePath: savedUri!,
        contentType: "application/pdf",
        openWithDefault: true,
      });
    } catch (openErr) {
      console.warn("[pdf] saved but could not auto-open", openErr);
    }
    return;
  }
  try {
    const blob = doc.output("blob");
    const safeFilename = filename.replace(/[^a-zA-Z0-9._ -]/g, "_");

    // On the web, always trigger a real file download instead of opening the
    // OS share sheet — users expect the PDF to land in their Downloads folder.
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeFilename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    doc.save(filename);
  }
}

// ---------------------------------------------------------------------------
// Header / footer chrome
// ---------------------------------------------------------------------------

function drawHeader(
  doc: jsPDF,
  l: ReportLabels,
  businessName: string,
  rangeLabel: string,
  logoDataUrl?: string | null,
) {
  doc.setFillColor(...PURPLE);
  doc.rect(0, 0, 210, 26, "F");
  doc.setTextColor(255, 255, 255);

  let textX = 14;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", 12, 5, 16, 16);
      textX = 32;
    } catch {
      /* ignore bad image */
    }
  }

  doc.setFont(CJK_FONT_FAMILY, "bold");
  doc.setFontSize(16);
  doc.text(businessName || "Bossify", textX, 13);
  doc.setFontSize(11);
  doc.text(l.reportTitle, textX, 20);

  doc.setTextColor(0, 0, 0);
  doc.setFont(CJK_FONT_FAMILY, "normal");
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
      return [
        th.date,
        th.caseId,
        th.client,
        th.service,
        th.fee,
        th.paymentStatus,
        th.applicationStatus,
      ];
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

  await applyCjkFont(doc);

  drawHeader(doc, l, d.businessName, d.rangeLabel, d.logoDataUrl);

  // Summary table
  autoTable(doc, {
    startY: 46,
    head: [[l.summary, l.value]],
    body: summaryForBiz(d, l),
    theme: "grid",
    headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
    alternateRowStyles: { fillColor: ALT_ROW },
    styles: { fontSize: 10, font: CJK_FONT_FAMILY },
  });

  let y = ((doc as AutoTablePdf).lastAutoTable?.finalY ?? 46) + 8;

  if (d.topProducts && d.topProducts.length) {
    autoTable(doc, {
      startY: y,
      head: [[l.topProducts, l.th.qty, l.th.amount]],
      body: d.topProducts.map((p) => [p.name, String(p.qty), p.revenue.toFixed(2)]),
      theme: "striped",
      headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
      alternateRowStyles: { fillColor: ALT_ROW },
      styles: { fontSize: 10, font: CJK_FONT_FAMILY },
    });
    y = ((doc as AutoTablePdf).lastAutoTable?.finalY ?? y) + 8;
  }

  if (d.topCustomers && d.topCustomers.length) {
    autoTable(doc, {
      startY: y,
      head: [[l.bestCustomers, l.orders, l.th.amount]],
      body: d.topCustomers.map((c) => [c.name, String(c.orders), c.spent.toFixed(2)]),
      theme: "striped",
      headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
      alternateRowStyles: { fillColor: ALT_ROW },
      styles: { fontSize: 10, font: CJK_FONT_FAMILY },
    });
    y = ((doc as AutoTablePdf).lastAutoTable?.finalY ?? y) + 8;
  }

  if (d.rows.length) {
    autoTable(doc, {
      startY: y,
      head: [tableHeadersForBiz(d.bizType, l)],
      body: d.rows.map((r) => tableRowForBiz(d.bizType, r)),
      theme: "grid",
      headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
      alternateRowStyles: { fillColor: ALT_ROW },
      styles: { fontSize: 8, font: CJK_FONT_FAMILY },
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

  await applyCjkFont(doc);

  drawHeader(doc, l, opts.businessName, opts.statusLabel, opts.logoDataUrl);

  autoTable(doc, {
    startY: 46,
    head: [tableHeadersForBiz(opts.bizType, l)],
    body: opts.rows.map((r) => tableRowForBiz(opts.bizType, r)),
    theme: "grid",
    headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
    alternateRowStyles: { fillColor: ALT_ROW },
    styles: { fontSize: 9, font: CJK_FONT_FAMILY },
  });

  drawFooters(doc, l);

  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  await savePdf(doc, `Bossify_Orders_${opts.statusLabel}_${ymd}.pdf`);
}

// ---------------------------------------------------------------------------
// Profit Report (retail focus — reuses order-level cost/profit numbers)
// ---------------------------------------------------------------------------

const PROFIT_TITLE: Record<Lang, string> = {
  en: "PROFIT REPORT",
  ms: "LAPORAN UNTUNG",
  zh: "利润报告",
};

const STOCK_TITLE: Record<Lang, string> = {
  en: "STOCK REPORT",
  ms: "LAPORAN STOK",
  zh: "库存报告",
};

type ExtraLabels = {
  cogs: string;
  grossProfit: string;
  margin: string;
  orders: string;
  avgPerOrder: string;
  revenue: string;
  mostProfitable: string;
  leastProfitable: string;
  product: string;
  qty: string;
  cost: string;
  profit: string;
  marginPct: string;
  // stock
  asOf: string;
  totalSkus: string;
  totalValue: string;
  inStock: string;
  lowStock: string;
  outOfStock: string;
  losingMoney: string;
  needsReorder: string;
  fullInventory: string;
  sellPrice: string;
  stockValue: string;
};

const EXTRA: Record<Lang, ExtraLabels> = {
  en: {
    cogs: "Cost of goods", grossProfit: "Gross profit", margin: "Gross margin",
    orders: "Orders", avgPerOrder: "Avg profit / order", revenue: "Revenue",
    mostProfitable: "Most profitable products", leastProfitable: "Least profitable products",
    product: "Product", qty: "Qty", cost: "Cost", profit: "Profit", marginPct: "Margin %",
    asOf: "As of", totalSkus: "Total SKUs", totalValue: "Total stock value",
    inStock: "In stock", lowStock: "Low stock", outOfStock: "Out of stock",
    losingMoney: "Losing money", needsReorder: "Needs reorder", fullInventory: "Full inventory",
    sellPrice: "Sell price", stockValue: "Value",
  },
  ms: {
    cogs: "Kos barang", grossProfit: "Untung kasar", margin: "Margin kasar",
    orders: "Pesanan", avgPerOrder: "Purata untung / pesanan", revenue: "Hasil",
    mostProfitable: "Produk paling menguntungkan", leastProfitable: "Produk kurang menguntungkan",
    product: "Produk", qty: "Kuantiti", cost: "Kos", profit: "Untung", marginPct: "Margin %",
    asOf: "Setakat", totalSkus: "Jumlah SKU", totalValue: "Jumlah nilai stok",
    inStock: "Ada stok", lowStock: "Stok rendah", outOfStock: "Habis stok",
    losingMoney: "Rugi", needsReorder: "Perlu pesan semula", fullInventory: "Inventori penuh",
    sellPrice: "Harga jual", stockValue: "Nilai",
  },
  zh: {
    cogs: "商品成本", grossProfit: "毛利", margin: "毛利率",
    orders: "订单", avgPerOrder: "每单平均利润", revenue: "营收",
    mostProfitable: "最赚钱的产品", leastProfitable: "最不赚钱的产品",
    product: "产品", qty: "数量", cost: "成本", profit: "利润", marginPct: "利润率 %",
    asOf: "截至", totalSkus: "SKU 总数", totalValue: "库存总值",
    inStock: "有库存", lowStock: "低库存", outOfStock: "缺货",
    losingMoney: "亏本", needsReorder: "需要补货", fullInventory: "全部库存",
    sellPrice: "售价", stockValue: "价值",
  },
};

// ---------------------------------------------------------------------------
// Shared: Net-profit disclaimer footnote
// ---------------------------------------------------------------------------

const NET_PROFIT_FOOTNOTE: Record<Lang, string> = {
  en: "Note: Net profit excludes platform fees, ad spend, and operating expenses (not currently tracked).",
  ms: "Nota: Untung bersih tidak termasuk yuran platform, kos iklan, dan perbelanjaan operasi (belum direkodkan).",
  zh: "备注：净利润不包括平台手续费、广告支出及营运开销（目前系统未记录）。",
};

function drawFootnote(doc: AutoTablePdf, lang: Lang, y: number) {
  const w = doc.internal.pageSize.getWidth();
  const text = NET_PROFIT_FOOTNOTE[lang];
  doc.setFont(CJK_FONT_FAMILY, "italic");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  const lines = doc.splitTextToSize(text, w - 28);
  doc.text(lines, 14, y);
  doc.setFont(CJK_FONT_FAMILY, "normal");
  doc.setTextColor(0, 0, 0);
  return y + lines.length * 4 + 2;
}

function makeLabels(lang: Lang, reportTitle: string, dateRange: string): ReportLabels {
  return { ...labels(lang, "retail"), reportTitle, dateRange } as ReportLabels;
}

export type ProfitProductRow = {
  name: string;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
};

export type ProfitReportData = {
  lang: Lang;
  businessName: string;
  logoDataUrl?: string | null;
  rangeLabel: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  margin: number;
  orderCount: number;
  avgPerOrder: number;
  top: ProfitProductRow[];
  bottom: ProfitProductRow[];
};

export async function exportProfitReportPDF(d: ProfitReportData): Promise<void> {
  const doc = new jsPDF();
  const l = makeLabels(d.lang, PROFIT_TITLE[d.lang], EXTRA[d.lang].revenue);
  const x = EXTRA[d.lang];
  await applyCjkFont(doc);
  drawHeader(doc, l, d.businessName, d.rangeLabel, d.logoDataUrl);

  const rm = (n: number) => `RM ${n.toFixed(2)}`;
  autoTable(doc, {
    startY: 46,
    head: [[l.summary, l.value]],
    body: [
      [x.revenue, rm(d.revenue)],
      [x.cogs, rm(d.cost)],
      [x.grossProfit, rm(d.grossProfit)],
      [x.margin, `${d.margin.toFixed(1)}%`],
      [x.orders, String(d.orderCount)],
      [x.avgPerOrder, rm(d.avgPerOrder)],
    ],
    theme: "grid",
    headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
    alternateRowStyles: { fillColor: ALT_ROW },
    styles: { fontSize: 10, font: CJK_FONT_FAMILY },
  });
  let y = ((doc as AutoTablePdf).lastAutoTable?.finalY ?? 46) + 8;

  const prodRows = (rows: ProfitProductRow[]) =>
    rows.map((r) => [
      r.name, String(r.qty), rm(r.revenue), rm(r.cost), rm(r.profit), `${r.margin.toFixed(1)}%`,
    ]);

  if (d.top.length) {
    autoTable(doc, {
      startY: y,
      head: [[x.mostProfitable, x.qty, x.revenue, x.cost, x.profit, x.marginPct]],
      body: prodRows(d.top),
      theme: "striped",
      headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
      alternateRowStyles: { fillColor: ALT_ROW },
      styles: { fontSize: 9, font: CJK_FONT_FAMILY },
    });
    y = ((doc as AutoTablePdf).lastAutoTable?.finalY ?? y) + 8;
  }

  if (d.bottom.length) {
    autoTable(doc, {
      startY: y,
      head: [[x.leastProfitable, x.qty, x.revenue, x.cost, x.profit, x.marginPct]],
      body: prodRows(d.bottom),
      theme: "striped",
      headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
      alternateRowStyles: { fillColor: ALT_ROW },
      styles: { fontSize: 9, font: CJK_FONT_FAMILY },
    });
  }

  drawFooters(doc, l);
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  await savePdf(doc, `Bossify_Profit_${ymd}.pdf`);
}

// ---------------------------------------------------------------------------
// Financial Report (P&L)
// ---------------------------------------------------------------------------

const FINANCIAL_TITLE: Record<Lang, string> = {
  en: "FINANCIAL REPORT (P&L)",
  ms: "LAPORAN KEWANGAN (P&L)",
  zh: "财务报表（损益表）",
};

const FIN_LABELS: Record<Lang, { avgOrder: string; net: string; unpaidAmt: string }> = {
  en: { avgOrder: "Avg order value", net: "Net profit (gross)", unpaidAmt: "Unpaid outstanding" },
  ms: { avgOrder: "Purata nilai pesanan", net: "Untung bersih (kasar)", unpaidAmt: "Belum bayar tertunggak" },
  zh: { avgOrder: "平均订单金额", net: "净利润（毛利）", unpaidAmt: "未收款项" },
};

export type FinancialReportData = {
  lang: Lang;
  businessName: string;
  logoDataUrl?: string | null;
  rangeLabel: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  margin: number;
  orderCount: number;
  avgOrder: number;
  unpaidAmount: number;
};

export async function exportFinancialReportPDF(d: FinancialReportData): Promise<void> {
  const doc = new jsPDF();
  const l = makeLabels(d.lang, FINANCIAL_TITLE[d.lang], d.rangeLabel);
  const x = EXTRA[d.lang];
  const fl = FIN_LABELS[d.lang];
  await applyCjkFont(doc);
  drawHeader(doc, l, d.businessName, d.rangeLabel, d.logoDataUrl);

  const rm = (n: number) => `RM ${n.toFixed(2)}`;
  autoTable(doc, {
    startY: 46,
    head: [[l.summary, l.value]],
    body: [
      [x.revenue, rm(d.revenue)],
      [x.cogs, rm(d.cogs)],
      [fl.net, rm(d.grossProfit)],
      [x.margin, `${d.margin.toFixed(1)}%`],
      [x.orders, String(d.orderCount)],
      [fl.avgOrder, rm(d.avgOrder)],
      [fl.unpaidAmt, rm(d.unpaidAmount)],
    ],
    theme: "grid",
    headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
    alternateRowStyles: { fillColor: ALT_ROW },
    styles: { fontSize: 10, font: CJK_FONT_FAMILY },
  });
  const y = ((doc as AutoTablePdf).lastAutoTable?.finalY ?? 46) + 8;
  drawFootnote(doc as AutoTablePdf, d.lang, y);

  drawFooters(doc, l);
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  await savePdf(doc, `Bossify_Financial_${ymd}.pdf`);
}

// ---------------------------------------------------------------------------
// Customer Statement
// ---------------------------------------------------------------------------

const CUSTOMER_STMT_TITLE: Record<Lang, string> = {
  en: "CUSTOMER STATEMENT",
  ms: "PENYATA PELANGGAN",
  zh: "客户对账单",
};

const STMT_L: Record<Lang, { customer: string; phone: string; totalOrders: string; totalSpent: string; lastOrder: string; unpaid: string; date: string; code: string; product: string; qty: string; amount: string; status: string; orderHistory: string; noOrders: string; }> = {
  en: { customer: "Customer", phone: "Phone", totalOrders: "Total orders", totalSpent: "Total spent", lastOrder: "Last order", unpaid: "Unpaid balance", date: "Date", code: "Order ID", product: "Product", qty: "Qty", amount: "Amount", status: "Status", orderHistory: "Order history", noOrders: "No orders in this range." },
  ms: { customer: "Pelanggan", phone: "Telefon", totalOrders: "Jumlah pesanan", totalSpent: "Jumlah dibelanja", lastOrder: "Pesanan terakhir", unpaid: "Baki belum bayar", date: "Tarikh", code: "ID Pesanan", product: "Produk", qty: "Kuantiti", amount: "Jumlah", status: "Status", orderHistory: "Sejarah pesanan", noOrders: "Tiada pesanan dalam julat ini." },
  zh: { customer: "客户", phone: "电话", totalOrders: "订单总数", totalSpent: "消费总额", lastOrder: "最后订单", unpaid: "未付余额", date: "日期", code: "订单编号", product: "产品", qty: "数量", amount: "金额", status: "状态", orderHistory: "订单历史", noOrders: "此范围内无订单。" },
};

export type CustomerStatementRow = {
  date: string; code: string; product: string; qty: number; amount: number; status: string;
};

export type CustomerStatementData = {
  lang: Lang;
  businessName: string;
  logoDataUrl?: string | null;
  rangeLabel: string;
  customerName: string;
  phone: string | null;
  totalOrders: number;
  totalSpent: number;
  unpaidBalance: number;
  lastOrderAt: string | null;
  rows: CustomerStatementRow[];
};

export async function exportCustomerStatementPDF(d: CustomerStatementData): Promise<void> {
  const doc = new jsPDF();
  const l = makeLabels(d.lang, CUSTOMER_STMT_TITLE[d.lang], d.rangeLabel);
  const s = STMT_L[d.lang];
  await applyCjkFont(doc);
  drawHeader(doc, l, d.businessName, d.rangeLabel, d.logoDataUrl);

  const rm = (n: number) => `RM ${n.toFixed(2)}`;
  autoTable(doc, {
    startY: 46,
    head: [[l.summary, l.value]],
    body: [
      [s.customer, d.customerName],
      [s.phone, d.phone ?? "—"],
      [s.totalOrders, String(d.totalOrders)],
      [s.totalSpent, rm(d.totalSpent)],
      [s.unpaid, rm(d.unpaidBalance)],
      [s.lastOrder, d.lastOrderAt ? new Date(d.lastOrderAt).toLocaleDateString("en-MY") : "—"],
    ],
    theme: "grid",
    headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
    alternateRowStyles: { fillColor: ALT_ROW },
    styles: { fontSize: 10, font: CJK_FONT_FAMILY },
  });
  let y = ((doc as AutoTablePdf).lastAutoTable?.finalY ?? 46) + 8;

  autoTable(doc, {
    startY: y,
    head: [[s.orderHistory, "", "", "", "", ""]],
    body: [
      [s.date, s.code, s.product, s.qty, s.amount, s.status],
      ...(d.rows.length
        ? d.rows.map((r) => [r.date, r.code, r.product, String(r.qty), rm(r.amount), r.status])
        : [[s.noOrders, "", "", "", "", ""]]),
    ],
    theme: "grid",
    headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
    alternateRowStyles: { fillColor: ALT_ROW },
    styles: { fontSize: 9, font: CJK_FONT_FAMILY },
  });

  drawFooters(doc, l);
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const safeName = d.customerName.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 30);
  await savePdf(doc, `Bossify_Statement_${safeName}_${ymd}.pdf`);
}

// ---------------------------------------------------------------------------
// Supplier Report (per-supplier totals + POs + restock items)
// ---------------------------------------------------------------------------

const SUPPLIER_TITLE: Record<Lang, string> = {
  en: "SUPPLIER REPORT",
  ms: "LAPORAN PEMBEKAL",
  zh: "供应商报表",
};

const SUP_L: Record<Lang, { supplier: string; contact: string; poCount: string; totalSpend: string; poList: string; poDate: string; poId: string; poStatus: string; poTotal: string; restockItems: string; itemName: string; qty: string; unit: string; unitPrice: string; total: string; noPos: string; noItems: string; }> = {
  en: { supplier: "Supplier", contact: "Contact", poCount: "PO count", totalSpend: "Total spend", poList: "Purchase orders", poDate: "Date", poId: "PO ID", poStatus: "Status", poTotal: "Total", restockItems: "Restock history (items)", itemName: "Item", qty: "Qty", unit: "Unit", unitPrice: "Unit price", total: "Total", noPos: "No purchase orders in this range.", noItems: "No restock items in this range." },
  ms: { supplier: "Pembekal", contact: "Kenalan", poCount: "Jumlah PO", totalSpend: "Jumlah belanja", poList: "Pesanan pembelian", poDate: "Tarikh", poId: "ID PO", poStatus: "Status", poTotal: "Jumlah", restockItems: "Sejarah stok masuk (barang)", itemName: "Barang", qty: "Kuantiti", unit: "Unit", unitPrice: "Harga seunit", total: "Jumlah", noPos: "Tiada pesanan pembelian.", noItems: "Tiada barang stok masuk." },
  zh: { supplier: "供应商", contact: "联系方式", poCount: "采购单数量", totalSpend: "总支出", poList: "采购订单", poDate: "日期", poId: "采购单编号", poStatus: "状态", poTotal: "总额", restockItems: "补货历史（明细）", itemName: "商品", qty: "数量", unit: "单位", unitPrice: "单价", total: "总额", noPos: "此范围内无采购单。", noItems: "此范围内无补货记录。" },
};

export type SupplierPO = {
  date: string; code: string; status: string; total: number;
};
export type SupplierItem = {
  date: string; name: string; qty: number; unit: string; unitPrice: number; total: number;
};
export type SupplierBlock = {
  supplier: string;
  contact: string | null;
  poCount: number;
  totalSpend: number;
  pos: SupplierPO[];
  items: SupplierItem[];
};

export type SupplierReportData = {
  lang: Lang;
  businessName: string;
  logoDataUrl?: string | null;
  rangeLabel: string;
  blocks: SupplierBlock[];
};

export async function exportSupplierReportPDF(d: SupplierReportData): Promise<void> {
  const doc = new jsPDF();
  const l = makeLabels(d.lang, SUPPLIER_TITLE[d.lang], d.rangeLabel);
  const s = SUP_L[d.lang];
  await applyCjkFont(doc);
  drawHeader(doc, l, d.businessName, d.rangeLabel, d.logoDataUrl);

  const rm = (n: number) => `RM ${n.toFixed(2)}`;
  const totalSpend = d.blocks.reduce((a, b) => a + b.totalSpend, 0);
  const totalPos = d.blocks.reduce((a, b) => a + b.poCount, 0);

  autoTable(doc, {
    startY: 46,
    head: [[l.summary, l.value]],
    body: [
      ["Suppliers", String(d.blocks.length)],
      [s.poCount, String(totalPos)],
      [s.totalSpend, rm(totalSpend)],
    ],
    theme: "grid",
    headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
    alternateRowStyles: { fillColor: ALT_ROW },
    styles: { fontSize: 10, font: CJK_FONT_FAMILY },
  });
  let y = ((doc as AutoTablePdf).lastAutoTable?.finalY ?? 46) + 8;

  for (const b of d.blocks) {
    autoTable(doc, {
      startY: y,
      head: [[`${s.supplier}: ${b.supplier}`, ""]],
      body: [
        [s.contact, b.contact ?? "—"],
        [s.poCount, String(b.poCount)],
        [s.totalSpend, rm(b.totalSpend)],
      ],
      theme: "grid",
      headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
      alternateRowStyles: { fillColor: ALT_ROW },
      styles: { fontSize: 9, font: CJK_FONT_FAMILY },
    });
    y = ((doc as AutoTablePdf).lastAutoTable?.finalY ?? y) + 4;

    autoTable(doc, {
      startY: y,
      head: [[s.poDate, s.poId, s.poStatus, s.poTotal]],
      body: b.pos.length
        ? b.pos.map((p) => [p.date, p.code, p.status, rm(p.total)])
        : [[s.noPos, "", "", ""]],
      theme: "striped",
      headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
      alternateRowStyles: { fillColor: ALT_ROW },
      styles: { fontSize: 8, font: CJK_FONT_FAMILY },
    });
    y = ((doc as AutoTablePdf).lastAutoTable?.finalY ?? y) + 4;

    autoTable(doc, {
      startY: y,
      head: [[s.restockItems, "", "", "", "", ""]],
      body: [
        [s.poDate, s.itemName, s.qty, s.unit, s.unitPrice, s.total],
        ...(b.items.length
          ? b.items.map((it) => [it.date, it.name, String(it.qty), it.unit, rm(it.unitPrice), rm(it.total)])
          : [[s.noItems, "", "", "", "", ""]]),
      ],
      theme: "grid",
      headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
      alternateRowStyles: { fillColor: ALT_ROW },
      styles: { fontSize: 8, font: CJK_FONT_FAMILY },
    });
    y = ((doc as AutoTablePdf).lastAutoTable?.finalY ?? y) + 8;
  }

  drawFooters(doc, l);
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  await savePdf(doc, `Bossify_Suppliers_${ymd}.pdf`);
}

// ---------------------------------------------------------------------------
// Order Status & Reconciliation
// ---------------------------------------------------------------------------

const RECON_TITLE: Record<Lang, string> = {
  en: "ORDER STATUS & RECONCILIATION",
  ms: "STATUS PESANAN & RECONCILIATION",
  zh: "订单状态与对账",
};

const RECON_L: Record<Lang, { byStatus: string; byPayment: string; bySource: string; chaseList: string; status: string; count: string; amount: string; paymentMethod: string; source: string; date: string; code: string; customer: string; days: string; noItems: string; ageDays: string; unspecified: string; }> = {
  en: { byStatus: "Orders by status", byPayment: "Orders by payment method", bySource: "Orders by source (platform)", chaseList: "Chase list (Unpaid / Pending)", status: "Status", count: "Count", amount: "Amount", paymentMethod: "Payment method", source: "Source", date: "Date", code: "Order ID", customer: "Customer", days: "Age (days)", noItems: "Nothing to reconcile — all clear.", ageDays: "Age (days)", unspecified: "(unspecified)" },
  ms: { byStatus: "Pesanan mengikut status", byPayment: "Pesanan mengikut kaedah bayaran", bySource: "Pesanan mengikut sumber (platform)", chaseList: "Senarai kejar (Belum bayar / Tertangguh)", status: "Status", count: "Bilangan", amount: "Jumlah", paymentMethod: "Kaedah bayaran", source: "Sumber", date: "Tarikh", code: "ID Pesanan", customer: "Pelanggan", days: "Umur (hari)", noItems: "Tiada yang perlu dikejar — semua bersih.", ageDays: "Umur (hari)", unspecified: "(tidak dinyatakan)" },
  zh: { byStatus: "按状态分类订单", byPayment: "按付款方式分类订单", bySource: "按来源（平台）分类订单", chaseList: "待催收清单（未付 / 待处理）", status: "状态", count: "数量", amount: "金额", paymentMethod: "付款方式", source: "来源", date: "日期", code: "订单编号", customer: "客户", days: "账龄（天）", noItems: "无需对账 — 一切正常。", ageDays: "账龄（天）", unspecified: "（未指定）" },
};

export type ReconOrder = {
  created_at: string;
  code: string;
  customer_name: string;
  amount: number;
  status: string;
  payment_method: string | null;
  order_source: string | null;
};

export type ReconReportData = {
  lang: Lang;
  businessName: string;
  logoDataUrl?: string | null;
  rangeLabel: string;
  orders: ReconOrder[];
};

export async function exportOrderReconciliationPDF(d: ReconReportData): Promise<void> {
  const doc = new jsPDF();
  const l = makeLabels(d.lang, RECON_TITLE[d.lang], d.rangeLabel);
  const r = RECON_L[d.lang];
  await applyCjkFont(doc);
  drawHeader(doc, l, d.businessName, d.rangeLabel, d.logoDataUrl);

  const rm = (n: number) => `RM ${n.toFixed(2)}`;

  function groupBy(key: (o: ReconOrder) => string) {
    const m = new Map<string, { count: number; amount: number }>();
    for (const o of d.orders) {
      const k = key(o) || r.unspecified;
      const cur = m.get(k) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += Number(o.amount ?? 0);
      m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].amount - a[1].amount);
  }

  const byStatus = groupBy((o) => o.status);
  const byPayment = groupBy((o) => o.payment_method ?? "");
  const bySource = groupBy((o) => o.order_source ?? "");

  const drawGroup = (title: string, header: string, rows: Array<[string, { count: number; amount: number }]>, y0: number) => {
    autoTable(doc, {
      startY: y0,
      head: [[title, r.count, r.amount]],
      body: rows.length ? rows.map(([k, v]) => [k, String(v.count), rm(v.amount)]) : [[header, "0", rm(0)]],
      theme: "grid",
      headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
      alternateRowStyles: { fillColor: ALT_ROW },
      styles: { fontSize: 9, font: CJK_FONT_FAMILY },
    });
    return ((doc as AutoTablePdf).lastAutoTable?.finalY ?? y0) + 6;
  };

  let y = 46;
  y = drawGroup(r.byStatus, r.status, byStatus, y);
  y = drawGroup(r.byPayment, r.paymentMethod, byPayment, y);
  y = drawGroup(r.bySource, r.source, bySource, y);

  const now = Date.now();
  const chase = d.orders
    .filter((o) => o.status === "Unpaid" || o.status === "Pending")
    .map((o) => ({
      ...o,
      ageDays: Math.max(0, Math.floor((now - new Date(o.created_at).getTime()) / 86400000)),
    }))
    .sort((a, b) => b.ageDays - a.ageDays);

  autoTable(doc, {
    startY: y,
    head: [[r.chaseList, "", "", "", "", ""]],
    body: [
      [r.date, r.code, r.customer, r.status, r.amount, r.ageDays],
      ...(chase.length
        ? chase.map((o) => [
            new Date(o.created_at).toLocaleDateString("en-MY"),
            o.code, o.customer_name, o.status, rm(Number(o.amount)), String(o.ageDays),
          ])
        : [[r.noItems, "", "", "", "", ""]]),
    ],
    theme: "grid",
    headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
    alternateRowStyles: { fillColor: ALT_ROW },
    styles: { fontSize: 8, font: CJK_FONT_FAMILY },
  });

  drawFooters(doc, l);
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  await savePdf(doc, `Bossify_Reconciliation_${ymd}.pdf`);
}

// ---------------------------------------------------------------------------
// Stock Report (point-in-time inventory snapshot)
// ---------------------------------------------------------------------------

export type StockInvRow = {
  id: string;
  name: string;
  stock: number | null;
  price: number | null;
  cost_price: number | null;
};

export type StockReportData = {
  lang: Lang;
  businessName: string;
  logoDataUrl?: string | null;
  items: StockInvRow[];
};

const LOW_STOCK_THRESHOLD = 5;

export async function exportStockReportPDF(d: StockReportData): Promise<void> {
  const doc = new jsPDF();
  const asOf = new Date().toLocaleString("en-MY");
  const l = makeLabels(d.lang, STOCK_TITLE[d.lang], `${EXTRA[d.lang].asOf} ${asOf}`);
  const x = EXTRA[d.lang];
  await applyCjkFont(doc);
  drawHeader(doc, l, d.businessName, `${x.asOf} ${asOf}`, d.logoDataUrl);

  const rm = (n: number) => `RM ${n.toFixed(2)}`;
  const items = d.items;
  const buckets = { out: [] as StockInvRow[], low: [] as StockInvRow[], losing: [] as StockInvRow[] };
  let totalValue = 0, inStockCount = 0;
  for (const r of items) {
    const s = Number(r.stock ?? 0);
    const p = Number(r.price ?? 0);
    const c = Number(r.cost_price ?? 0);
    totalValue += s * c;
    if (s <= 0) buckets.out.push(r);
    else if (s <= LOW_STOCK_THRESHOLD) { buckets.low.push(r); inStockCount++; }
    else inStockCount++;
    if (p > 0 && c > p) buckets.losing.push(r);
  }

  autoTable(doc, {
    startY: 46,
    head: [[l.summary, l.value]],
    body: [
      [x.totalSkus, String(items.length)],
      [x.totalValue, rm(totalValue)],
      [x.inStock, String(inStockCount)],
      [x.lowStock, String(buckets.low.length)],
      [x.outOfStock, String(buckets.out.length)],
      [x.losingMoney, String(buckets.losing.length)],
    ],
    theme: "grid",
    headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
    alternateRowStyles: { fillColor: ALT_ROW },
    styles: { fontSize: 10, font: CJK_FONT_FAMILY },
  });
  let y = ((doc as AutoTablePdf).lastAutoTable?.finalY ?? 46) + 8;

  const drawSection = (title: string, head: string[], body: string[][]) => {
    if (body.length === 0) return;
    autoTable(doc, {
      startY: y,
      head: [[title, ...Array(head.length - 1).fill("")]],
      body: [head, ...body],
      theme: "grid",
      headStyles: { fillColor: PURPLE, textColor: 255, font: CJK_FONT_FAMILY, fontStyle: "bold" },
      alternateRowStyles: { fillColor: ALT_ROW },
      styles: { fontSize: 9, font: CJK_FONT_FAMILY },
    });
    y = ((doc as AutoTablePdf).lastAutoTable?.finalY ?? y) + 8;
  };

  drawSection(
    x.needsReorder,
    [x.product, x.qty, x.cost, x.sellPrice, x.stockValue],
    buckets.low.map((r) => [
      r.name,
      String(Number(r.stock ?? 0)),
      rm(Number(r.cost_price ?? 0)),
      rm(Number(r.price ?? 0)),
      rm(Number(r.stock ?? 0) * Number(r.cost_price ?? 0)),
    ]),
  );
  drawSection(
    x.outOfStock,
    [x.product, x.cost, x.sellPrice],
    buckets.out.map((r) => [
      r.name, rm(Number(r.cost_price ?? 0)), rm(Number(r.price ?? 0)),
    ]),
  );
  drawSection(
    x.losingMoney,
    [x.product, x.cost, x.sellPrice, x.margin],
    buckets.losing.map((r) => {
      const p = Number(r.price ?? 0);
      const c = Number(r.cost_price ?? 0);
      return [r.name, rm(c), rm(p), rm(p - c)];
    }),
  );
  drawSection(
    x.fullInventory,
    [x.product, x.qty, x.cost, x.sellPrice, x.stockValue],
    items.map((r) => [
      r.name,
      String(Number(r.stock ?? 0)),
      rm(Number(r.cost_price ?? 0)),
      rm(Number(r.price ?? 0)),
      rm(Number(r.stock ?? 0) * Number(r.cost_price ?? 0)),
    ]),
  );

  drawFooters(doc, l);
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  await savePdf(doc, `Bossify_Stock_${ymd}.pdf`);
}
