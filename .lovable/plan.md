# Reports Hub — 3 PDF Cards

Convert the current `/reports` single-PDF-button screen into a hub where the user picks which report to generate. All 3 reports reuse existing data — no new tables, no schema changes.

## 1. Hub screen layout

**Location:** `/reports` (same route). The existing Sales Report view moves to `/reports/sales`; `/reports` becomes the hub.

```text
┌─ Reports ───────────────────────┐
│ [date range picker — shared]    │
│                                 │
│ ┌───────────────────────────┐   │
│ │ 📊 Sales Report           │   │
│ │ Revenue, orders, top      │   │
│ │ products, best customers  │   │
│ │              [Open PDF →] │   │
│ └───────────────────────────┘   │
│ ┌───────────────────────────┐   │
│ │ 💰 Profit Report          │   │
│ │ Gross profit, margin,     │   │
│ │ most/least profitable     │   │
│ │              [Open PDF →] │   │
│ └───────────────────────────┘   │
│ ┌───────────────────────────┐   │
│ │ 📦 Stock Report           │   │
│ │ In stock, low stock, out, │   │
│ │ losing-money items        │   │
│ │              [Open PDF →] │   │
│ └───────────────────────────┘   │
└─────────────────────────────────┘
```

- Shared date-range picker at the top (already exists on current Reports) applies to Sales + Profit. Stock ignores it (stock is a point-in-time snapshot as of "now").
- Each card tap → generates & opens that PDF directly. Paywall gate stays on the export action (same `usePaywall` check the current button uses); reuse it verbatim per card.
- Sales card = existing `exportSalesReportPDF` — no logic change.

## 2. Profit Report PDF structure

Data source: existing `orders` rows in the selected range (already fetched for Sales). No new query.

```text
─ Header ────────────────────────
Profit Report
{business name}    {date range}
─ Summary ──────────────────────
Revenue          RM x,xxx.xx
Cost of goods    RM x,xxx.xx
Gross profit     RM x,xxx.xx   ← bold
Gross margin %   xx.x%
Orders           n
Avg profit/order RM xx.xx
─ Most profitable products (top 10) ─
Product | Qty sold | Revenue | Cost | Profit | Margin %
─ Least profitable / loss-making (bottom 10) ─
Product | Qty sold | Revenue | Cost | Profit | Margin %
─ Footer ───────────────────────
Generated {timestamp} · Bossify
```

Aggregation helper: group order line items by product, sum revenue/cost/profit, sort desc for top-10 and asc for bottom-10 (include negatives).

## 3. Stock Report PDF structure

Data source: existing `inventory` table (same query `/inventory` and `/alerts` already run). Snapshot as of generation time — no date range.

```text
─ Header ────────────────────────
Stock Report
{business name}    As of {timestamp}
─ Summary ──────────────────────
Total SKUs             n
Total stock value      RM x,xxx.xx   (sum qty × cost)
In stock               n
Low stock              n   (qty ≤ reorder level, > 0)
Out of stock           n   (qty = 0)
Losing money           n   (sell price < cost)
─ Low stock (needs reorder) ────
SKU | Product | Qty on hand | Reorder level | Cost | Value
─ Out of stock ─────────────────
SKU | Product | Cost | Last sold
─ Losing money ─────────────────
SKU | Product | Cost | Sell price | Margin (negative)
─ Full inventory ──────────────
SKU | Product | Qty | Cost | Sell price | Value
─ Footer ───────────────────────
Generated {timestamp} · Bossify
```

The 4 category buckets reuse the exact same classification logic already used on `/alerts` — no new business rules.

## 4. i18n keys (EN / BM / ZH)

Add to `src/contexts/I18nContext.tsx`:

| Key | EN | BM | ZH |
|---|---|---|---|
| `reports_hub_title` | Reports | Laporan | 报表 |
| `reports_sales_title` | Sales Report | Laporan Jualan | 销售报表 |
| `reports_sales_desc` | Revenue, orders, top products, best customers | Hasil, pesanan, produk teratas, pelanggan terbaik | 营收、订单、热销产品、最佳客户 |
| `reports_profit_title` | Profit Report | Laporan Untung | 利润报表 |
| `reports_profit_desc` | Gross profit, margin, most & least profitable products | Untung kasar, margin, produk paling & kurang menguntungkan | 毛利、利润率、最赚钱与最不赚钱的产品 |
| `reports_stock_title` | Stock Report | Laporan Stok | 库存报表 |
| `reports_stock_desc` | In stock, low stock, out of stock, losing money | Ada stok, stok rendah, habis stok, rugi | 有库存、低库存、缺货、亏本 |
| `reports_open_pdf` | Open PDF | Buka PDF | 打开 PDF |
| `reports_as_of` | As of | Setakat | 截至 |
| `profit_report_cogs` | Cost of goods | Kos barang | 商品成本 |
| `profit_report_gross_profit` | Gross profit | Untung kasar | 毛利 |
| `profit_report_margin` | Gross margin | Margin kasar | 毛利率 |
| `profit_report_avg_per_order` | Avg profit/order | Purata untung/pesanan | 每单平均利润 |
| `profit_report_most_profitable` | Most profitable products | Produk paling menguntungkan | 最赚钱的产品 |
| `profit_report_least_profitable` | Least profitable products | Produk kurang menguntungkan | 最不赚钱的产品 |
| `stock_report_total_skus` | Total SKUs | Jumlah SKU | SKU 总数 |
| `stock_report_total_value` | Total stock value | Jumlah nilai stok | 库存总值 |
| `stock_report_in_stock` | In stock | Ada stok | 有库存 |
| `stock_report_low_stock` | Low stock | Stok rendah | 低库存 |
| `stock_report_out_of_stock` | Out of stock | Habis stok | 缺货 |
| `stock_report_losing_money` | Losing money | Rugi | 亏本 |
| `stock_report_needs_reorder` | Needs reorder | Perlu pesan semula | 需要补货 |
| `stock_report_full_inventory` | Full inventory | Inventori penuh | 全部库存 |
| `stock_report_last_sold` | Last sold | Terakhir dijual | 上次售出 |

Existing `reports_*` keys used by the Sales Report stay as-is.

## Technical notes

**Files:**
- `src/routes/reports.tsx` → becomes hub (3 cards + shared date picker). Removes the inline sales-report UI.
- `src/routes/reports.sales.tsx` → new; hosts the existing sales-report view (moved as-is).
- `src/lib/pdf.ts` → add `exportProfitReportPDF(orders, range, t)` and `exportStockReportPDF(inventory, t)`. Reuse existing jsPDF+autotable helpers and header/footer style from `exportSalesReportPDF`.
- `src/contexts/I18nContext.tsx` → add keys above in all 3 languages.

**Data reuse (no new queries):**
- Profit: same `orders` fetch already used for Sales Report; aggregate client-side.
- Stock: same `inventory` fetch pattern as `/inventory` and `/alerts`; one `supabase.from('inventory').select(...)` call.

**Paywall:** each card's PDF action goes through the existing `usePaywall` check — identical gating to today's single button.

**Reversibility:** wrap the new hub behind a `REPORTS_HUB_MODE` flag in `src/lib/featureFlags.ts` (default `true`). If off, `/reports` renders the old single-PDF view; the new `/reports/sales`, profit, and stock code paths simply aren't linked.

**No schema changes. No new tables. No server functions.**
