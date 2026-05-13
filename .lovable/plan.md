## 目标

让 Free plan 用户即使删了 order / product，也不能"用完再删"绕开限制。

- **Order**：保持每月 20 单的重置逻辑，但删除不会让计数回退（只在新增时 +1）。
- **Product**：改成永久累计 10 个，一辈子最多创建 10 个产品，删了也不补回。

---

## 数据库改动（migration）

### 1. `subscriptions` 表
- 新增 `inventory_created_total INTEGER NOT NULL DEFAULT 0` —— 永久累计创建过的产品数。
- 保留现有 `order_count`（仍然按月重置）。

### 2. 数据库触发器（保证后端真实数据，绕不过）

**`orders` INSERT 触发器**
- 用户新增 order 时，对应 `subscriptions.order_count += 1`。
- 不再有 DELETE 触发器减回。

**`inventory` INSERT 触发器**
- 用户新增 product 时，`subscriptions.inventory_created_total += 1`。
- 不做 DELETE 减回。

### 3. 初始化已有数据
- `inventory_created_total` 用当前 `inventory` 表里每个用户已存在的产品数回填，避免老用户突然超限。
- `order_count` 不动。

---

## 前端改动

### `src/contexts/SubscriptionContext.tsx`
- `SubscriptionRow` 加上 `inventory_created_total`。
- 暴露 `productsUsed`、`productsLimit`、`productsRemaining`。
- **移除现在的 "self-heal order_count" 段**（那段会把 `order_count` 同步成实际行数，等于变相支持"删除回退"）。保留每月重置逻辑。

### `src/routes/inventory.tsx`
- `atLimit` 改为基于 `productsUsed >= FREE_LIMITS.inventory`，不再用 `items.length`。
- 这样即使用户删到只剩 3 个，只要历史上创建过 10 个，就不能再加。
- UI 文案体现"已使用 X / 10（含已删除）"。

### `src/routes/new-order.tsx`
- 已经用 `ordersUsed` 判断，无需改逻辑；但因为去掉了 self-heal，月内删除不会再让额度回来——符合预期。

### `src/routes/index.tsx` / `src/routes/profile.tsx`（如果显示了进度条/数字）
- Order 进度仍显示 `ordersUsed / 20`。
- Product 新增显示 `productsUsed / 10`。
- 在 inventory limit 提示文案里加一句小字"删除产品不会释放额度"，避免用户疑惑。

---

## 验证

- 新增一个 order → `order_count` +1；删掉那个 order → 计数仍然是 1。
- 新增 10 个 product → 第 11 个加号按钮变灰，弹 upgrade。删掉所有 product 后再点加号，仍然弹 upgrade。
- 月初自动重置 `order_count` 仍然有效；`inventory_created_total` 永远不重置。
- Pro 用户不受任何限制（`isPro` 短路）。
