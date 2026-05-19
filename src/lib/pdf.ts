import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { FileOpener } from "@capacitor-community/file-opener";

async function savePdf(doc: jsPDF, filename: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const dataUri = doc.output("datauristring");
    const base64 = dataUri.split(",")[1];
    // Write to Documents so the file is also accessible via the device file manager.
    const res = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    });
    try {
      await FileOpener.open({
        filePath: res.uri,
        contentType: "application/pdf",
        openWithDefault: true,
      });
      return;
    } catch (openErr) {
      console.error("[pdf] open failed, falling back to share", openErr);
      await Share.share({
        title: filename,
        url: res.uri,
        dialogTitle: filename,
      });
      return;
    }
  }
  // Web: trigger a direct download via an anchor. Opening blob: URLs in a new
  // tab is blocked on many published hosts (CSP / popup blockers) and shows a
  // blank page, so we download instead — which works everywhere.
  try {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    doc.save(filename);
  }
}

export type ReportData = {
  businessName: string;
  rangeLabel: string;
  totalRevenue: number;
  totalOrders: number;
  paidOrders: number;
  unpaidAmount: number;
  topProducts: { name: string; qty: number; revenue: number }[];
  topCustomers: { name: string; orders: number; spent: number }[];
  orders: { date: string; code: string; customer: string; product: string; qty: number; amount: number; status: string }[];
};

export async function exportSalesReportPDF(d: ReportData): Promise<void> {
  const doc = new jsPDF();
  const purple: [number, number, number] = [124, 58, 237];
  doc.setFillColor(...purple);
  doc.rect(0, 0, 210, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text("Bossify", 14, 14);
  doc.setFontSize(10);
  doc.text(d.businessName, 14, 19);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.text("Sales Report", 14, 32);
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  doc.text(d.rangeLabel, 14, 38);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString("en-MY")}`, 14, 43);

  // Summary
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  let y = 52;
  const summary = [
    ["Total Revenue", `RM ${d.totalRevenue.toFixed(2)}`],
    ["Total Orders", String(d.totalOrders)],
    ["Paid Orders", String(d.paidOrders)],
    ["Unpaid Amount", `RM ${d.unpaidAmount.toFixed(2)}`],
  ];
  autoTable(doc, {
    startY: y,
    head: [["Summary", "Value"]],
    body: summary,
    theme: "grid",
    headStyles: { fillColor: purple, textColor: 255 },
    styles: { fontSize: 10 },
  });

  y = (doc as any).lastAutoTable.finalY + 8;
  if (d.topProducts.length) {
    autoTable(doc, {
      startY: y,
      head: [["Top Products", "Qty Sold", "Revenue (RM)"]],
      body: d.topProducts.map((p) => [p.name, String(p.qty), p.revenue.toFixed(2)]),
      theme: "striped",
      headStyles: { fillColor: purple, textColor: 255 },
      styles: { fontSize: 10 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (d.topCustomers.length) {
    autoTable(doc, {
      startY: y,
      head: [["Best Customers", "Orders", "Spent (RM)"]],
      body: d.topCustomers.map((c) => [c.name, String(c.orders), c.spent.toFixed(2)]),
      theme: "striped",
      headStyles: { fillColor: purple, textColor: 255 },
      styles: { fontSize: 10 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (d.orders.length) {
    autoTable(doc, {
      startY: y,
      head: [["Date", "Code", "Customer", "Product", "Qty", "RM", "Status"]],
      body: d.orders.map((o) => [o.date, o.code, o.customer, o.product, String(o.qty), o.amount.toFixed(2), o.status]),
      theme: "grid",
      headStyles: { fillColor: purple, textColor: 255 },
      styles: { fontSize: 8 },
    });
  }

  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  await savePdf(doc, `Bossify_Report_${ymd}.pdf`);
}

export async function exportOrdersListPDF(opts: {
  businessName: string;
  statusLabel: string;
  orders: { date: string; code: string; customer: string; product: string; amount: number; status: string }[];
}): Promise<void> {
  const doc = new jsPDF();
  const purple: [number, number, number] = [124, 58, 237];
  doc.setFillColor(...purple);
  doc.rect(0, 0, 210, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text("Bossify", 14, 14);
  doc.setFontSize(10);
  doc.text(opts.businessName, 14, 19);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.text(`Orders — ${opts.statusLabel}`, 14, 32);
  doc.setTextColor(110, 110, 110);
  doc.setFontSize(9);
  doc.text(new Date().toLocaleDateString("en-MY"), 14, 38);

  autoTable(doc, {
    startY: 44,
    head: [["Date", "Code", "Customer", "Product", "RM", "Status"]],
    body: opts.orders.map((o) => [o.date, o.code, o.customer, o.product, o.amount.toFixed(2), o.status]),
    theme: "grid",
    headStyles: { fillColor: purple, textColor: 255 },
    styles: { fontSize: 9 },
  });

  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  await savePdf(doc, `Bossify_Orders_${opts.statusLabel}_${ymd}.pdf`);
}
