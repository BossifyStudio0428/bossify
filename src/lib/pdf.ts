import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

async function savePdf(doc: jsPDF, filename: string) {
  if (Capacitor.isNativePlatform()) {
    try {
      const dataUri = doc.output("datauristring");
      const base64 = dataUri.split(",")[1];
      const res = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: Directory.Cache,
      });
      await Share.share({
        title: filename,
        url: res.uri,
        dialogTitle: filename,
      });
      return;
    } catch (e) {
      console.error("[pdf] native save failed", e);
      try { doc.save(filename); } catch {}
      return;
    }
  }
  doc.save(filename);
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

export function exportSalesReportPDF(d: ReportData) {
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

  // Summary
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  let y = 48;
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
  void savePdf(doc, `Bossify_Report_${ymd}.pdf`);
}

export function exportOrdersListPDF(opts: {
  businessName: string;
  statusLabel: string;
  orders: { date: string; code: string; customer: string; product: string; amount: number; status: string }[];
}) {
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
  void savePdf(doc, `Bossify_Orders_${opts.statusLabel}_${ymd}.pdf`);
}
