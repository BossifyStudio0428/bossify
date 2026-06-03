## 现状（为什么没连接）

- **listings.interested_customer_id** ✅ 已存在 → 房源页可以选客户
- **customers.interested_listing_id** ✅ 已存在 → 但客户页**没有显示**
- **property_viewings** ✅ 表已存在 → 但只在首页显示今日，没绑到客户/房源页
- **Enquiry Form 提交** ❌ 提交后只写 `orders`，没写 `customers`，也没关联 `interested_listing_id`
- **客户页（客户详情）** ❌ 没有「感兴趣房源」「看房记录」分区

所以你看到的：房源选了 WONG ZONG HAN，但客户页看不到这个房源，也看不到看房记录。

---

## 一次过修复的功能

### 1. 房源 ↔ 客户 双向自动同步
房源页保存 `interested_customer_id` 时，**同时**更新该客户的 `interested_listing_id`（已有字段，直接用）。反之亦然。

### 2. 客户详情页新增 2 个分区（仅 property 业务显示）

**A. 感兴趣房源**
- 显示 `customers.interested_listing_id` 对应的房源（标题、价格、状态徽章）
- 点击 → 跳到 `/listing/$id`
- 同时反向查询 `listings.interested_customer_id = 该客户` 的房源（一对多）

**B. 看房记录**
- 查询 `property_viewings` where `customer_id = 该客户`
- 列表：日期、房源标题、状态（scheduled/completed/cancelled）
- 「+ 安排看房」按钮 → 直接预填这个客户，跳到看房新增页

### 3. 房源详情页新增「看房记录」分区
- 查询 `property_viewings` where `listing_id = 该房源`
- 同样的列表 + 「+ 安排看房」按钮（预填房源）

### 4. Enquiry Form 提交自动建客户 + 关联房源
当 property 业务客户从 `/order/$code` 提交询盘：
- 用电话号码 `upsert` `customers`（已有就更新最后联系时间，没有就新建）
- 把客户的 `interested_listing_id` 设为询盘选的房源
- 反过来把房源的 `interested_customer_id` 也设过去
- `orders` 表照旧记录（保持现有收入/通知逻辑）
- 客户初始 `customer_status = 'enquiry'`（蓝色「询问中」）

### 5. 看房记录 ↔ 客户 ↔ 房源 三向跳转
- 看房记录页每条记录的客户名 → 跳客户页
- 房源标题 → 跳房源页
- 看房完成后，弹个提示问要不要把客户状态升到 `in_progress`

### 6. 首页「最新客户」显示感兴趣房源
每个客户卡片下面加一行小字：「感兴趣：xxx 房源标题」（如果有 `interested_listing_id`）

---

## 技术细节

**改动文件**（不动数据库 schema，全部字段已存在）：
- `src/routes/listing.$id.tsx` — 保存时双向同步 + 新增看房记录分区
- `src/routes/customer.$customerId.tsx` — 新增「感兴趣房源」「看房记录」两个分区（仅 property 显示）
- `src/routes/order.$code.tsx` — 提交询盘时 upsert customer + 关联 listing
- `src/lib/public-order.server.ts` — server fn 接收 `listing_id`，写入 customers 表
- `src/routes/viewings.tsx` 和 `src/routes/viewing.$id.tsx` — 加 `?customer_id=xxx&listing_id=xxx` 预填参数
- `src/routes/index.tsx` — 最新客户卡片加感兴趣房源行

**不改数据库**：所有需要的字段（`customers.interested_listing_id`, `listings.interested_customer_id`, `property_viewings.customer_id`, `property_viewings.listing_id`）已存在。

**3 种语言文本**：在 `src/contexts/I18nContext.tsx` 加新 key（感兴趣房源、看房记录、安排看房、暂无看房记录 等），en/ms/zh 三套都写。

**不破坏现有功能**：其他业务类型（retail/fnb/education/beauty/freelance）的客户页保持原样，property 专属分区用 `bizType === "property"` 包起来。

---

确认就开做。