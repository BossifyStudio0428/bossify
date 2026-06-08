## 目标

给 ingredients 加上 `category` 字段，支持预设分类 + 用户自定义，AI 在三处自动建议分类。

## 1. 数据库

新建 migration（一个）：

- `ingredients` 表加 `category text`（可空）
- `ingredients` 表加 index `idx_ingredients_user_category`
- 新建 `ingredient_categories` 表：用户自定义分类
  - `id`, `user_id`, `name`, `created_at`
  - unique(user_id, lower(name))
  - RLS：仅本人 CRUD；GRANT authenticated + service_role

预设分类（前端常量，不入库）：
`肉类 / 海鲜 / 蔬菜 / 水果 / 调味料 / 干货 / 饮料 / 包装 / 乳制品 / 蛋类 / 其他`

## 2. AI 分类 server function

新建 `src/lib/ai-classify-ingredient.functions.ts`：

- 输入：`{ names: string[], existingCategories: string[] }`（批量，最多 50 个）
- 调用 Lovable AI Gateway（`google/gemini-3-flash-preview`，`response_format: json_object`）
- Prompt 让 AI 优先从 `existingCategories`（预设+用户自定义合并）中选；不合适才返回新分类名
- 返回：`Array<{ name: string, category: string, confidence: number }>`

## 3. AI 采购单解析（PO）增强

`src/lib/ai-parse-po.functions.ts`：

- `InputSchema` 加 `existingCategories: string[]`（mode === ingredients 时使用）
- `buildSystemPrompt` / `buildUserText` 加入 categories 列表
- `ParsedPoItem` 类型加 `category: string | null`
- 解析返回每项的 `category`，没把握则 null

`PurchaseOrderAiReview.tsx`：解析时把预设+用户自定义 categories 传入；UI 每行加 category 下拉（预设+用户自定义+自由输入），写入新 ingredient 时带上 category。

## 4. 新增/编辑 ingredient 表单

`src/routes/ingredients.tsx` 的 `IngredientForm`：

- 加 category 字段：下拉（预设 + 用户自定义） + "+ 新分类" 自由输入 + "✨ AI 建议" 按钮
- AI 按钮：调 `ai-classify-ingredient`（单个 name），自动填入 category；若是新分类自动写入 `ingredient_categories`
- 保存时若 category 不在已有列表则同时 upsert 到 `ingredient_categories`

列表卡片显示 category 小 chip。

## 5. 批量补全旧数据

`src/routes/ingredients.tsx` 顶部加按钮 `✨ AI 自动分类未分类项`（仅当存在 `category IS NULL` 时显示）：

- 拉取所有 `category` 为空的 ingredients
- 分批（50 个/批）调 `ai-classify-ingredient`
- 进度条 / loading toast
- 写回 `category`；新分类 upsert 到 `ingredient_categories`

## 6. i18n

`I18nContext.tsx` 补上 zh/en/ms：
`category, select_category, new_category, ai_suggest_category, auto_categorize_all, categorizing, all_categories` + 11 个预设分类名。

## 7. UI 分组（可选小增强）

ingredients 列表顶部加 category 横向 chip 过滤（含「全部」），跟现有搜索/排序并列。

## 技术细节

- Category 字段允许 null（兼容旧数据）
- 用 `lower(name)` unique 防重复
- AI 调用都走 server function；client 不接触 `LOVABLE_API_KEY`
- 批量补全失败的项目跳过，不阻断
- 不动 `purchase_order_items` 表结构

## 不在本次

- 不给 inventory（retail products）加 category（现有表已有 `category` 列，不重复改造）
- 不动 recipes
