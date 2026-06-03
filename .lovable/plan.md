# Property 业务类型修复计划

## 根本原因（一句话）
代码里所有"房源"操作都连到了 **不存在的 `property_listings` 表**，而 `listings` 表才是真实存在的（你之前那条 SQL 把 `customers.interested_listing_id` 也指向了 `listings`）。所以你在 /listings 页面添加的房源根本没存进数据库，下拉自然是空的。

**关于 SQL：这次不需要新的 SQL migration。** `listings` 表、`customers.interested_listing_id` 外键、所有 RLS policies 都已经存在并正确。只需要改前端代码把表名从 `property_listings` 改成 `listings`，你之前加的房源就会真的保存进去。

---

## 改动清单

### 1. 修房源表名错误（这是 dropdown 没东西的真正原因）
- `src/routes/listings.tsx` — 把 `from("property_listings" as never)` 改成 `from("listings")`
- `src/routes/listing.$id.tsx` — 同样 3 处 (`select` / `insert` / `update` / `delete`) 改成 `listings`

改完后你之前在 /listings 添加的房源会真的保存，新增客户表单里的房源下拉会出现。

### 2. 客户页 "配套" 按钮 → 改成 "房源"
- `src/routes/customers.tsx`（property 业务类型）：
  - 图标 📦 → 🏠
  - 文案 `packages_title` → `nav_listings`（CN 房源 / BM Hartanah / EN Listings — 翻译已存在）
  - 链接 `/services` → `/listings`

### 3. 把订阅计划的限制从"配套"改成"房源"（property 专属）
- `src/contexts/SubscriptionContext.tsx`：
  - `FREE_LIMITS` / `STARTER_LIMITS` 新增 `listings` 字段（建议沿用现有数字：Free 10、Starter 25、Pro/Lifetime/Team 无限）
  - 暴露 `listingsUsed` / `listingsLimit` / `listingsRemaining`
- `src/routes/listings.tsx`：参考 `inventory.tsx` 的 `atLimit` 写法 —— 达到上限时禁用 + 按钮并提示升级
- `src/routes/plans.tsx`：property 业务的特性列表 `pf_packages_10` / `ps_packages_25` 改成"10 个房源 / 25 个房源"对应的 key（如果需要新 key 我会加进 I18nContext）

### 4. "+" 按钮表单（property 业务）真正能用
现在 `/new-order` 对 property 业务来说叫"新潜在客户"，你说潜在客户已经删掉了 + 这里也不是创建订单 + 没有客户下拉。修复：
- `src/lib/businessType.ts`：property 的 `new_order` 从 `bl_new_lead` 改成 `bl_new_client`（"新客户"）
- `src/routes/new-order.tsx`（仅 property 分支）：
  - 在 "客户姓名" 字段上方加一个**已有客户下拉**：选了就自动填名字+电话+互动历史；选 "+ 新客户" 才显示姓名/电话输入
  - 房源下拉保持现状（修了 #1 之后就会有数据）
  - 移除"金额/数量"等订单字段对 property 的强制要求（property 流程是登记客户+感兴趣房源，不是收钱）
  - 保存时写入 `customers` 表（带 `interested_listing_id`），不再写 `orders`
- 客户页底部空状态文案 "当您创建订单时，客户会自动添加" 改成 "点击 + 添加新客户"（property 业务）

### 5. （顺手）AppShell 底部导航
property 业务类型下"订单"标签可考虑改为"客户"或"房源"。**不在本次默认范围内** —— 如果你要我改请告诉我。

---

## 数据库（确认无需 migration）
| 表 / 字段 | 状态 |
|---|---|
| `public.listings` | ✅ 已存在 |
| `customers.interested_listing_id` → `listings(id) ON DELETE SET NULL` | ✅ 已存在 |
| `listings` RLS（`can_access_user_data`）| ✅ 已存在 |

唯一需要的"SQL"是把代码里写错的表名改回来 —— 这是 TypeScript 代码改动，不是数据库改动。

---

## 不在本次范围
- 把订阅 Plan 在 Stripe/Paddle 那边的产品改名（只动 app 内的文案和数值上限）
- 重写 `/new-order` 整个表单使其变成纯客户管理页（只在 property 分支做最小改动让流程通顺）
- AppShell 底部导航的标签调整（除非你确认要改）

---

确认 OK 我就开始改。如果第 4 点的"客户下拉是否要保留'新客户'选项"或第 3 点的"具体数字 10 / 25 是否沿用"想调整，告诉我数字。
