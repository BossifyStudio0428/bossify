import * as XLSX from "xlsx";
import type { OrderStatus } from "@/integrations/supabase/client";

export type ImportField =
  | "skip"
  | "code"
  | "customer_name"
  | "phone"
  | "product"
  | "quantity"
  | "amount"
  | "status"
  | "notes"
  | "created_at"
  | "cost";

export const FIELD_LABELS: Record<ImportField, string> = {
  skip: "— Skip —",
  code: "Order Code",
  customer_name: "Customer Name",
  phone: "Phone",
  product: "Product",
  quantity: "Quantity",
  amount: "Amount (RM)",
  status: "Status",
  notes: "Notes",
  created_at: "Date",
  cost: "Cost",
};

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, unknown>[];
};

/** Read .xlsx/.xls/.csv from a File and return first sheet. */
export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("No sheets found");
  const ws = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: false,
  });
  const headers = json.length
    ? Object.keys(json[0])
    : (XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })[0] as string[] | undefined) ?? [];
  return { headers, rows: json };
}

/** Heuristic: match a header to one of our fields (EN / MS / ZH). */
const PATTERNS: Record<Exclude<ImportField, "skip">, RegExp[]> = {
  code: [/^(order[\s_-]*)?(no|num|code|id|#)$/i, /单号|订单号|订单编号|order/i],
  customer_name: [/customer|client|name|buyer|nama|pelanggan/i, /客户|姓名|名字|买家/],
  phone: [/phone|tel|mobile|wa|whatsapp|hp|no\.?\s*tel/i, /电话|手机|号码/],
  product: [/product|item|barang|description|desc|sku/i, /产品|商品|货品|名称/],
  quantity: [/^qty$|quantity|kuantiti|jumlah(?!.*rm)/i, /数量|件数/],
  amount: [/amount|total|price|harga|rm|myr|sales|revenue|subtotal/i, /金额|价格|价钱|总额|总价/],
  status: [/status|paid|payment|bayar/i, /状态|付款/],
  notes: [/note|remark|comment|catatan/i, /备注|说明/],
  created_at: [/date|tarikh|time|created/i, /日期|时间/],
  cost: [/cost|kos|modal/i, /成本/],
};

export function autoMapHeaders(headers: string[]): Record<string, ImportField> {
  const mapping: Record<string, ImportField> = {};
  const used = new Set<ImportField>();
  for (const h of headers) {
    const trimmed = String(h ?? "").trim();
    if (!trimmed) { mapping[h] = "skip"; continue; }
    let best: ImportField = "skip";
    for (const [field, patterns] of Object.entries(PATTERNS) as [Exclude<ImportField, "skip">, RegExp[]][]) {
      if (used.has(field)) continue;
      if (patterns.some((re) => re.test(trimmed))) { best = field; break; }
    }
    if (best !== "skip") used.add(best);
    mapping[h] = best;
  }
  return mapping;
}

function normalizeStatus(v: unknown): OrderStatus {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "Unpaid";
  if (/(^|[^a-z])(paid|lunas|sudah\s*bayar|completed?|done)([^a-z]|$)/.test(s) || /已付|已收款|完成/.test(s)) return "Paid";
  if (/pending|hold|tunggu|process/.test(s) || /待付|待定|处理中/.test(s)) return "Pending";
  return "Unpaid";
}

function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const cleaned = String(v ?? "").replace(/[^\d.\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function toDateISO(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();
  // Try DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const year = yyyy.length === 2 ? 2000 + Number(yyyy) : Number(yyyy);
    const d2 = new Date(year, Number(mm) - 1, Number(dd));
    if (!isNaN(d2.getTime())) return d2.toISOString();
  }
  return null;
}

export type MappedOrder = {
  code: string | null;
  customer_name: string;
  phone: string | null;
  product: string;
  quantity: number;
  amount: number;
  status: OrderStatus;
  notes: string | null;
  created_at: string | null;
  cost: number | null;
  _rowIndex: number;
  _errors: string[];
};

export function applyMapping(
  rows: Record<string, unknown>[],
  mapping: Record<string, ImportField>,
): MappedOrder[] {
  const reverse: Partial<Record<ImportField, string>> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (field !== "skip" && !reverse[field]) reverse[field] = header;
  }
  return rows.map((row, i) => {
    const get = (f: ImportField) => (reverse[f] ? row[reverse[f]!] : undefined);
    const errors: string[] = [];
    const customer_name = String(get("customer_name") ?? "").trim();
    const product = String(get("product") ?? "").trim();
    const amount = toNumber(get("amount"));
    if (!customer_name) errors.push("Missing customer");
    if (!product) errors.push("Missing product");
    if (!Number.isFinite(amount) || amount <= 0) errors.push("Missing/invalid amount");
    const phoneRaw = String(get("phone") ?? "").trim();
    return {
      code: (() => { const c = String(get("code") ?? "").trim(); return c || null; })(),
      customer_name,
      phone: phoneRaw || null,
      product,
      quantity: Math.max(1, Math.round(toNumber(get("quantity"), 1))),
      amount,
      status: normalizeStatus(get("status")),
      notes: (() => { const n = String(get("notes") ?? "").trim(); return n || null; })(),
      created_at: toDateISO(get("created_at")),
      cost: (() => { const raw = get("cost"); if (raw == null || raw === "") return null; return toNumber(raw); })(),
      _rowIndex: i + 2, // +2 = excel row (1=header)
      _errors: errors,
    };
  });
}

export function generateCode(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rnd = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `ORD${yy}${mm}${dd}${rnd}`;
}