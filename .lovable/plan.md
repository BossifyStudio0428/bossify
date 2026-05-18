## 功能：从 Excel / CSV 导入订单

让用户把已有 Excel/CSV 上传到 app，AI 自动识别列对应字段，预览确认后批量导入到 Orders。

### 用户流程

```text
Orders 页面
  ↓ 点 "导入 Excel/CSV" 按钮
上传文件 (.xlsx / .xls / .csv)
  ↓ 本地解析 (xlsx 库) 取前 N 行
AI 识别列对应字段 (Lovable AI Gateway)
  ↓
预览页面：
  - 显示 AI 识别的字段映射 (可手动修改下拉)
  - 显示前 10 行预览数据
  - 显示警告 (缺少必填、重复订单号等)
  ↓ 用户确认
批量导入 (按订单号覆盖现有)
  ↓
显示结果：新增 X 单 / 更新 Y 单 / 跳过 Z 单
跳到 Orders 列表
```

### 识别的字段

必填：`customer_name`, `product`, `amount`
可选：`code` (订单号), `phone`, `quantity`, `status` (Unpaid/Paid/Pending), `notes`, `created_at`, `cost`

没有 `code` 的行 → 自动生成新订单号
有 `code` 且数据库已存在 → 覆盖该订单
状态识别：中英文都接受 ("已付"/"Paid", "未付"/"Unpaid", "待付"/"Pending")

### 改动文件

**新增**
- `src/lib/import.functions.ts` — server function `parseColumnsWithAI`：接收表头+前 5 行样本，调 Lovable AI (Gemini 3 Flash) 用 structured output 返回 `{ columnMapping: { csvHeader: fieldName }, confidence }`
- `src/lib/import.functions.ts` — server function `bulkImportOrders`：接收已映射的 rows，校验+按 code 去重 upsert 到 `orders` 表，返回 `{ inserted, updated, skipped, errors }`
- `src/routes/import-orders.tsx` — 导入流程页 (上传 → 预览映射 → 确认导入 → 结果)
- `src/components/ImportColumnMapper.tsx` — 字段映射 UI (每个 Excel 列一个 select，选 app 字段)
- `src/components/ImportPreviewTable.tsx` — 预览表格

**修改**
- `src/routes/orders.tsx` — 顶部加 "导入" 按钮 → 跳 `/import-orders`
- `package.json` — 加 `xlsx` 依赖 (前端解析 .xlsx/.csv)
- i18n 文件 — 加新文案

### 技术要点

- 文件解析全部在前端做 (`xlsx` 库)，只把表头 + 5 行样本 + 最终映射后的 JSON 发到 server，避免上传整个文件
- AI 调用通过 server function (`createServerFn` + Lovable AI Gateway)，用 `google/gemini-3-flash-preview` + structured output (`Output.object` + Zod schema)
- 批量插入限制：单次最多 1000 行，超过提示用户分批
- 覆盖逻辑：用 `(user_id, code)` 查现有订单，存在则 update，不存在则 insert
- RLS 已存在 (`auth.uid() = user_id`)，server function 用 `requireSupabaseAuth`
- 不需要数据库 schema 改动

### 不在本次范围

- Customers / Inventory 导入 (留到下次)
- 模板下载 (AI 自动识别已经够用)
- 导入历史记录