
## 功能概述

在 **采购单 (Purchase Orders)** 页面新增 "AI 智能识别" 入口，用户可以：
1. 拍照 / 上传收据图片
2. 上传 PDF 采购单
3. 贴上文字（WhatsApp 讯息等）

AI 会自动识别出 **ingredient 名字 + 数量 + 单位 + 单价 + supplier**，然后弹出 review 页面让用户逐项确认 / 修改 / 跳过，再一次过创建采购单。如果某 ingredient / supplier 在 DB 里没有，会标记 "新建" 让用户决定要不要加进 ingredients 表。

---

## 用户流程

```text
[采购单页] → 按 "AI 识别" 按钮
   ↓
[选择输入方式] 拍照 / 相册 / PDF / 文字
   ↓
[上传 → 显示 "AI 识别中..."]
   ↓
[Review 页面] 列出 AI 解析的每一行：
   ┌──────────────────────────────────┐
   │ ☑ 鸡肉  2 kg  RM 15.00           │
   │   ↳ 匹配到: Chicken Breast       │
   │ ☑ 洋葱  5 kg  RM 3.50  [新建]    │
   │   ↳ 名字: [洋葱___] 单位: [kg]   │
   │ ☐ ??? (低信心，默认不选)         │
   └──────────────────────────────────┘
   Supplier: [ABC 供应商 ▼] 或 [+ 新建]
   ↓
[确认] → 新建缺失的 ingredients → 建立采购单 → 跳转详情页
```

---

## 技术实现

### 1. 后端：AI 识别 Server Function

新增 `src/lib/ai-parse-po.functions.ts`，用 `createServerFn`：

- 入参：`{ kind: "image" | "pdf" | "text", payload: string }`（图片/PDF 用 base64，文字直接 string）
- 用 Lovable AI Gateway + `google/gemini-2.5-pro`（支援 vision + PDF）
- 传入现有 ingredients 和 suppliers 的 list（只传 id + 名字，省 token）让 AI 做 fuzzy match
- 用 AI SDK `Output.object` 输出 structured JSON：
  ```ts
  {
    supplier: { matched_id: string | null, name: string, confidence: number },
    items: [{
      matched_ingredient_id: string | null,
      name: string,
      quantity: number,
      unit: string,
      unit_price: number,
      confidence: number
    }],
    order_date?: string,
    notes?: string
  }
  ```
- 需先 provision `LOVABLE_API_KEY`（用 `ai_gateway--create` 或确认已存在）

### 2. 前端：触发入口

`src/routes/purchase-orders.tsx` 加 "AI 识别" 按钮（在 + FAB 旁边或顶部）。点击打开 action sheet 选输入方式。

- 拍照/相册：用 Capacitor `Camera` plugin（Web fallback 用 `<input type="file" accept="image/*">`）
- PDF：`<input type="file" accept="application/pdf">`
- 文字：`<textarea>`

转 base64 后调用 server function。

### 3. 前端：Review Modal

新增 `src/components/PurchaseOrderAiReview.tsx`：
- 复用现有 `PurchaseOrderForm` 的 SheetShell + lines UI
- 每行加：
  - Checkbox（低 confidence < 0.6 默认不勾）
  - "已匹配 / 新建" badge
  - 如果是 "新建"：显示名字 / 单位输入框，确认后会写入 `ingredients` 表
- Supplier dropdown 预选 AI 匹配的；如果 AI 给的是新 supplier 名字，提供 "新建 supplier" 选项
- 底部 "确认建立采购单" 按钮：
  1. 先 insert 新 ingredients（拿到新 id）
  2. 如果有新 supplier 也 insert
  3. 再走原本的 `purchase_orders` + `purchase_order_items` insert 流程
  4. 如果状态 = received，调用现有 `applyReceivedStock`

### 4. i18n

`I18nContext.tsx` 加新 keys（CN/BM/EN）：
- `po_ai_scan` = AI 智能识别 / Imbas AI / AI Scan
- `po_ai_choose_source` / `po_ai_camera` / `po_ai_gallery` / `po_ai_pdf` / `po_ai_text`
- `po_ai_scanning` = AI 识别中...
- `po_ai_review_title` / `po_ai_new_ingredient` / `po_ai_new_supplier`
- `po_ai_low_confidence` / `po_ai_no_items_found`
- `po_ai_failed` = AI 识别失败，请重试

### 5. 错误处理

- 429 (rate limit) → toast "AI 忙碌中，请稍后再试"
- 402 (credit exhausted) → toast "AI 额度不足，请联系管理员"
- AI 返回空 items → toast "未检测到 ingredients，请手动添加"
- 图片太大 → 前端压缩到 max 2MB 再上传

---

## 文件改动清单

新增：
- `src/lib/ai-parse-po.functions.ts` — AI 识别 server function
- `src/lib/ai-gateway.server.ts` — Lovable AI Gateway provider helper（如还没存在）
- `src/components/PurchaseOrderAiReview.tsx` — Review modal

修改：
- `src/routes/purchase-orders.tsx` — 加 "AI 识别" 按钮和 modal 控制
- `src/contexts/I18nContext.tsx` — 加 AI 相关 i18n keys

不动 DB schema（用现有 `ingredients` / `suppliers` / `purchase_orders` / `purchase_order_items`）。

---

## 平台支援

- Web：用 `<input type="file">`
- Android (Capacitor)：用 `@capacitor/camera` 拍照 / 选相册（plugin 应该已经有，会确认）
- 所有 AI 调用走 server function（已配置 `attachSupabaseAuth`），Android app 也能用

---

## 风险 & 备注

- Gemini 对 PDF 支援需用 `google/gemini-2.5-pro`（flash preview 也支援 vision 但对中文/马来文菜单准确率较低）
- 中文/马来文混杂的收据要在 system prompt 明确说明三语
- AI 不保证 100% 准确，所以一定要 review 才提交（不会全自动 insert）
