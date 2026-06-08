## Goal

Make every WhatsApp message use wording that matches the merchant's business type — not always "Order/订单/Pesanan". The order and reminder templates already differ per biz type; what's still generic is the **receipt** template (and the receipt PDF wording).

## Changes

### 1. `src/lib/wa.ts` — biz-aware receipt template
Replace the single `RECEIPT_TPL: Record<Lang, string>` with a `TplMap` (biz × lang), mirroring `REMINDER_TPL`, using the same per-biz wording:

| Biz | Code label | Item label |
|---|---|---|
| retail | Order / Pesanan / 订单 | Product / Produk / 商品 |
| fnb | Order / Pesanan / 订单 | Item / Menu / 餐点 |
| education | Case / Kes / 案例 | Service / Perkhidmatan / 服务 |
| beauty | Appointment / Temujanji / 预约 | Service / Perkhidmatan / 服务 |
| property | Reference / Rujukan / 参考编号 | Listing / Hartanah / 房源 |
| freelance | Project / Projek / 项目 | Service / Perkhidmatan / 服务 |

Update `getReceiptTemplate(lang, biz)` signature; fall back to retail+en.

### 2. `src/routes/orders.tsx` — pass biz type
At the `getReceiptTemplate(lang)` call site (line 336), pass `bizType` so the right wording is used.

### 3. `src/lib/receiptPdf.ts` — biz-aware PDF labels
The auto-generated PDF receipt currently uses generic "Receipt / Order / Item / Qty" labels. Add a `bizType` field to `ReceiptInput` and switch the receipt title + the itemized table headers to match the biz:

- Title: `Receipt` stays for retail/fnb; `Invoice` for education/beauty/property/freelance (still localised in ms/zh).
- Column 1 header: same mapping as the WhatsApp item label above (Product / Menu / Service / Listing).
- "Order #" line: re-use the biz code label (Order / Case / Appointment / Reference / Project).

Then pass `bizType` from `orders.tsx` when calling `buildReceiptPdf(...)`.

### Out of scope
- Order template, reminder template, and the per-customer manual WA messages already use biz-aware wording — no changes needed there.
- Renewal reminders stay property-only.
- No DB / schema changes.

## Files touched
- `src/lib/wa.ts`
- `src/lib/receiptPdf.ts`
- `src/routes/orders.tsx`
