## 目标
在 `/admin` 页加一个 **AI Usage** 区块，让你能实时看到每个 AI 功能的调用次数、估算成本、以及最近的失败（rate limit / credit exhausted）。

## 实现方式

### 1. 新表 `ai_usage_logs`（migration）
每次 AI 调用记一行：
```
- id (uuid)
- user_id (uuid, nullable — 可能是匿名 order form 等)
- feature (text) — 'classify_ingredient' / 'parse_po' / 等
- model (text) — 'google/gemini-2.5-flash'
- input_tokens (int), output_tokens (int)
- est_cost_usd (numeric) — 服务端按模型单价算
- status (text) — 'ok' / 'rate_limit' / 'credit_exhausted' / 'error'
- error_msg (text, nullable)
- created_at (timestamptz)
```
RLS：只 admin 可读（`is_admin()`），service_role 全权写入。GRANT 给 authenticated SELECT + service_role ALL。

### 2. 在现有 AI server fn 里加 logging
改这两个文件，在 `.handler()` 成功/失败时插一条 log（用 `supabaseAdmin`，不阻塞主流程，失败静默）：
- `src/lib/ai-classify-ingredient.functions.ts`
- `src/lib/ai-parse-po.functions.ts`

token 数从 gateway 响应的 `usage` 字段拿（`prompt_tokens` / `completion_tokens`）。成本按硬编码单价表算（gemini-2.5-flash: $0.075 / $0.30 per 1M）。

### 3. 新 server fn `getAiUsageStats`（admin only）
`src/lib/admin.functions.ts` 加一个查询，返回：
- 今日 / 本月 / 总计：调用次数、总成本、按 feature 分组
- 最近 20 条失败记录
- 用 `requireSupabaseAuth` + 服务端检查 `is_admin`

### 4. Admin 页 UI
在 `src/routes/admin.tsx` 加一个 "AI Usage" tab 或卡片：
- 顶部 3 个 stat card：今日调用 / 本月成本 (USD) / 本月剩余免费额度 ($1 - 本月成本)
- 按 feature 分组的表格：feature、calls、tokens、cost
- 失败日志 expandable 列表

### 5. 不做的事
- 不加用户层限流（现在用量远低于免费额度，没必要）
- 不暴露 AI 用量给普通用户
- 不动 push notification 系统

## 文件变更预览
- 新建 `supabase/migrations/<ts>_ai_usage_logs.sql`
- 编辑 `src/lib/ai-classify-ingredient.functions.ts`、`src/lib/ai-parse-po.functions.ts`
- 编辑 `src/lib/admin.functions.ts`
- 编辑 `src/routes/admin.tsx`

确认后就开工。