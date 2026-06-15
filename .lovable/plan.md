## 改动目标

首页的「库存不足」卡片目前在 FNB 模式下只统计**食材**(ingredients)，不会显示**成品**(inventory) 的库存预警。需要让卡片同时显示两者。

## 改动内容（仅 FNB 模式）

### 1. 数据加载 (`src/routes/index.tsx` 第 94–136 行)

- 将 `lowStock: number` 状态改为 `lowStock: { product: number; ingredient: number }`。
- FNB 模式下同时请求 `inventory.stock` 和 `ingredients.current_stock,min_stock`，分别计算：
  - 成品不足：`stock <= 5`
  - 食材不足：`current_stock < min_stock`
- 非 FNB 模式保持原样（只算 inventory）。

### 2. 卡片显示 (第 427、630–658 行)

FNB 模式下「库存不足」卡片样式：

```text
┌─────────────────────┐
│ [📦 icon]           │
│                     │
│  2  |  5            │   ← 大字两个数字，中间竖线分隔
│ 成品   食材          │   ← 小字标签
│ 库存不足             │   ← 卡片副标题
└─────────────────────┘
```

- 数字总和 = 0 时显示单个 "0"，与其他卡片一致。
- 点击卡片：
  - 如果只有成品不足 → 跳 `/inventory`
  - 如果只有食材不足 → 跳 `/ingredients`
  - 两者都有或都为 0 → 跳 `/inventory`（默认，与现行 FNB 行为相反，但更直观；如你倾向 `/ingredients` 我也可以改）

### 3. 文案

新增多语言 key：
- `low_stock_products` = 成品 / Products / Produk
- `low_stock_ingredients` = 食材 / Ingredients / Bahan

### 4. 底部红色提醒条 (第 874–880 行)

`lowStock > 0` 改为 `product + ingredient > 0`，文案显示两者总和。

## 待确认

点击两类都有库存不足的卡片时，你希望默认跳到「成品库存」还是「食材库存」页面？
