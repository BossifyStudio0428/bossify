import html2pdf from "html2pdf.js";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { FileOpener } from "@capacitor-community/file-opener";
import type { Lang } from "@/contexts/I18nContext";

const PURPLE = "#6C3FD6";
const ALT_ROW = "#F0EEF8";

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

function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function pageShell(title: string, subtitle: string, businessName: string, lang: Lang, bodyHtml: string): string {
  const l = T[lang];
  const generatedAt = new Date().toLocaleString("en-MY");
  // Inline CSS, use widely supported fallback fonts. html2canvas uses the
  // browser's font stack so CJK glyphs render natively via the OS fonts.
  return `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  /* All rules scoped under #bossify-pdf-root so they don't leak to the live app.
     html2canvas cannot parse oklch/lab colors, so we hard-reset inherited
     border/color/background to plain hex values. */
  #bossify-pdf-root, #bossify-pdf-root * {
    box-sizing: border-box;
    border-color: #e6e2f0 !important;
    color: #111 !important;
  }
  #bossify-pdf-root {
    background: #ffffff !important;
    margin: 0; padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei",
      "Hiragino Sans GB", "Noto Sans CJK SC", "Noto Sans", "Segoe UI", Arial, sans-serif;
    font-size: 12px; line-height: 1.4;
    width: 760px;
  }
  #bossify-pdf-root .hdr { background: ${PURPLE} !important; padding: 16px 20px; border-radius: 8px; }
  #bossify-pdf-root .hdr, #bossify-pdf-root .hdr * { color: #ffffff !important; }
  #bossify-pdf-root .hdr h1 { margin: 0; font-size: 20px; font-weight: 700; }
  #bossify-pdf-root .hdr .sub { margin-top: 4px; font-size: 13px; opacity: 0.95; }
  #bossify-pdf-root .meta { font-size: 11px; margin: 10px 4px 16px; display: flex; justify-content: space-between; }
  #bossify-pdf-root .meta, #bossify-pdf-root .meta * { color: #555 !important; }
  #bossify-pdf-root table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  #bossify-pdf-root th { background: ${PURPLE} !important; color: #ffffff !important; text-align: left; padding: 8px 10px; font-weight: 600; font-size: 11px; }
  #bossify-pdf-root td { padding: 7px 10px; border-bottom: 1px solid #e6e2f0; font-size: 11px; vertical-align: top; }
  #bossify-pdf-root tr:nth-child(even) td { background: ${ALT_ROW} !important; }
  #bossify-pdf-root tfoot td { background: ${ALT_ROW} !important; font-weight: 700; }
  #bossify-pdf-root .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 10px; text-align: center; }
  #bossify-pdf-root .footer, #bossify-pdf-root .footer * { color: #777 !important; }
</style></head>
<body>
<div id="bossify-pdf-root">
  <div class="hdr">
    <h1>${esc(businessName || "Bossify")}</h1>
    <div class="sub">${esc(title)}${subtitle ? " — " + esc(subtitle) : ""}</div>
  </div>
  <div class="meta"><span>${esc(l.generated)}: ${esc(generatedAt)}</span><span></span></div>
  ${bodyHtml}
  <div class="footer">Powered by Bossify — bossify-malaysia.lovable.app</div>
</div>
</body></html>`;
}

async function renderAndSave(html: string, filename: string): Promise<void> {
  // Render into an offscreen container; html2canvas needs the node attached.
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.innerHTML = html;
  document.body.appendChild(container);
  try {
    const worker = (html2pdf as any)()
      .set({
        margin: 10,
        filename,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(container);

    if (Capacitor.isNativePlatform()) {
      const blob: Blob = await worker.outputPdf("blob");
      const base64 = await blobToBase64(blob);
      const res = await Filesystem.writeFile({
        path: filename, data: base64,
        directory: Directory.Documents, recursive: true,
      });
      try {
        await FileOpener.open({ filePath: res.uri, contentType: "application/pdf", openWithDefault: true });
      } catch {
        await Share.share({ title: filename, url: res.uri, dialogTitle: filename });
      }
    } else {
      await worker.save();
    }
  } finally {
    container.remove();
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result || "");
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
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
  const summaryHtml = `
    <table>
      <thead><tr>
        <th>${esc(l.summary.totalCommissions)}</th>
        <th>${esc(l.summary.thisMonth)}</th>
        <th>${esc(l.summary.pending)}</th>
        <th>${esc(l.summary.received)}</th>
      </tr></thead>
      <tbody><tr>
        <td>${rm(opts.summary.total)}</td>
        <td>${rm(opts.summary.month)}</td>
        <td>${rm(opts.summary.pending)}</td>
        <td>${rm(opts.summary.received)}</td>
      </tr></tbody>
    </table>`;
  const rowsHtml = opts.rows.map((r) => `<tr>
    <td>${esc(r.listing_title || "—")}</td>
    <td>${esc(r.client_name || "—")}</td>
    <td>${esc(r.transaction_type)}</td>
    <td>${rm(r.transaction_price)}</td>
    <td>${esc(r.commission_rate)}%</td>
    <td>${rm(r.commission_amount)}</td>
    <td>${esc(r.status)}</td>
    <td>${esc(r.transaction_date)}</td>
  </tr>`).join("");
  const tableHtml = `
    <table>
      <thead><tr>
        <th>${esc(l.th.property)}</th><th>${esc(l.th.client)}</th><th>${esc(l.th.type)}</th>
        <th>${esc(l.th.price)}</th><th>${esc(l.th.rate)}</th><th>${esc(l.th.commission)}</th>
        <th>${esc(l.th.status)}</th><th>${esc(l.th.date)}</th>
      </tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="8" style="text-align:center;color:#999;">—</td></tr>`}</tbody>
      <tfoot><tr>
        <td colspan="4"></td><td>${esc(l.total)}</td><td>${rm(opts.summary.total)}</td><td colspan="2"></td>
      </tr></tfoot>
    </table>`;
  const html = pageShell(l.commissionReport, "", opts.businessName, opts.lang, summaryHtml + tableHtml);
  await renderAndSave(html, `Bossify_Commissions_${ymd()}.pdf`);
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
  const total = opts.rows.length;
  const available = opts.rows.filter((r) => r.status === "available").length;
  const sold = opts.rows.filter((r) => r.status === "sold").length;
  const rented = opts.rows.filter((r) => r.status === "rented").length;
  const summaryHtml = `
    <table>
      <thead><tr>
        <th>${esc(l.summary.totalListings)}</th>
        <th>${esc(l.summary.available)}</th>
        <th>${esc(l.summary.sold)}</th>
        <th>${esc(l.summary.rented)}</th>
      </tr></thead>
      <tbody><tr>
        <td>${total}</td><td>${available}</td><td>${sold}</td><td>${rented}</td>
      </tr></tbody>
    </table>`;
  const rowsHtml = opts.rows.map((r) => `<tr>
    <td>${esc(r.title)}</td>
    <td>${esc(r.property_type)}</td>
    <td>${esc(r.listing_type)}</td>
    <td>${rm(r.price)}</td>
    <td>${esc(r.bedrooms ?? "—")}</td>
    <td>${esc(r.status)}</td>
  </tr>`).join("");
  const tableHtml = `
    <table>
      <thead><tr>
        <th>${esc(l.th.title)}</th><th>${esc(l.th.type)}</th><th>${esc(l.th.forSaleRent)}</th>
        <th>${esc(l.th.price)}</th><th>${esc(l.th.bedrooms)}</th><th>${esc(l.th.status)}</th>
      </tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="6" style="text-align:center;color:#999;">—</td></tr>`}</tbody>
    </table>`;
  const html = pageShell(l.listingsReport, "", opts.businessName, opts.lang, summaryHtml + tableHtml);
  await renderAndSave(html, `Bossify_Listings_${ymd()}.pdf`);
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
  const rowsHtml = opts.rows.map((r) => `<tr>
    <td>${esc(r.listing_title || "—")}</td>
    <td>${esc(r.customer_name || "—")}</td>
    <td>${esc(new Date(r.viewing_at).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" }))}</td>
    <td>${esc(r.status)}</td>
    <td>${esc(r.interest_level || "—")}</td>
    <td>${esc(r.feedback || "—")}</td>
  </tr>`).join("");
  const tableHtml = `
    <table>
      <thead><tr>
        <th>${esc(l.th.property)}</th><th>${esc(l.th.client)}</th><th>${esc(l.th.viewingDate)}</th>
        <th>${esc(l.th.status)}</th><th>${esc(l.th.interest)}</th><th>${esc(l.th.feedback)}</th>
      </tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="6" style="text-align:center;color:#999;">—</td></tr>`}</tbody>
    </table>`;
  const html = pageShell(l.viewingsReport, "", opts.businessName, opts.lang, tableHtml);
  await renderAndSave(html, `Bossify_Viewings_${ymd()}.pdf`);
}

// ----- Document checklist -----

export type DocChecklistItem = { name: string; status: string; notes?: string };

export async function exportDocumentChecklistPDF(opts: {
  lang: Lang; businessName: string;
  clientName: string; propertyTitle?: string | null;
  items: DocChecklistItem[];
}) {
  const l = T[opts.lang];
  const subtitle = `${opts.clientName}${opts.propertyTitle ? " — " + opts.propertyTitle : ""}`;
  const rowsHtml = opts.items.map((it) => `<tr>
    <td>${esc(it.name)}</td>
    <td>${esc(it.status)}</td>
    <td>${esc(it.notes || "—")}</td>
  </tr>`).join("");
  const tableHtml = `
    <table>
      <thead><tr>
        <th>${esc(l.th.document)}</th><th>${esc(l.th.status)}</th><th>${esc(l.th.notes)}</th>
      </tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="3" style="text-align:center;color:#999;">—</td></tr>`}</tbody>
    </table>`;
  const html = pageShell(l.docReport, subtitle, opts.businessName, opts.lang, tableHtml);
  await renderAndSave(html, `Bossify_Documents_${ymd()}.pdf`);
}
