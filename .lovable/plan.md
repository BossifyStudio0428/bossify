## 思路

每个 biz type 卖的东西不同 → 管理端要问的字段也不同 → 客户在 order form 看到的卡片和下单流程也不同。让两边按 biz type 自动切换。

---

## 1. 管理端：每个 biz type 自己的 3 页 wizard

复用 `WizardSheet`，按 biz type 切换 step 内容：

| Biz | Page 1 | Page 2 | Page 3 |
|-----|--------|--------|--------|
| **retail** 🛍️ | 图片 (多图) | 名称 / 描述 / 价格 / 分类 | 库存 + 变体（尺码/颜色） |
| **fnb** 🍱 | 图片 | 名称 / 描述 / 价格 / 分类 | 选项（辣度、冰、糖、份量、加料）+ 可选库存 |
| **beauty** 💄 | 图片 | 名称 / 描述 / 价格 / **时长** | 加料服务（jsonb addons），无库存 |
| **education** 🎓 | 图片（可选） | 课程名 / 等级 / 入学时间 / 学时 / 学费 | 入学要求（多行文字） |
| **property** 🏠 | 图片（已 ok） | 标题 / 类型 / 买卖租 / 价格 / 地址 | 卧/浴/面积/状态/描述 |
| **freelance** 💪 | 图片（可选） | 名称 / 描述 / **收费类型**（固定 / 按小时）/ 金额 | 交付时间 / 作品链接 |

`property` 已经有专属 `/listing/$id` 路由（多图 + 户型），把它也转成 wizard 风格，UI 一致。

---

## 2. 数据库新增字段（一次 migration，全在 `services` 表）

```text
services + 
  category         text
  rate_type        text default 'fixed'   -- 'fixed' | 'hourly'
  addons           jsonb default '[]'     -- [{name, price}]
  level            text                   -- education
  intake           text                   -- education
  requirements     text                   -- education
  turnaround_days  integer                -- freelance
  portfolio_links  jsonb default '[]'     -- freelance
```

`listings` 表已经够用，不动。`variants` 已经存在（用于 retail 尺码/颜色）。

---

## 3. 客户端 order form：每个 biz type 不同视图

新增共用组件 `ProductDetailModal` — 点产品卡时打开全屏 modal，顶部多图轮播，下方按 biz 显示不同字段。

| Biz | 列表卡 | 点进去 modal | 加入订单后的下单流程 |
|-----|--------|--------------|------------------|
| **retail** | 图 + 名 + 价 | 多图 + 描述 + 变体 + 数量 | 购物车 → 收货 / COD |
| **fnb** | 按分类分组（Food/Drinks/...） | 图 + 描述 + 选项 chip + 加料 + 数量 | 购物车 → **外带/堂食/外送** 切换 |
| **beauty** | 图 + 服务 + 价 + 时长 | 图 + 描述 + 加料 | "下一步" → **日期 + 时间段选择器** → 客户资料 |
| **education** | 图（可选）+ 课程 + 等级 + 学费 | 课程详情 + 入学要求 | "申请 / 询问" → 用现有 `EducationDetailsForm` |
| **property** | 现有房源卡 | 已有 `/listing/$id` 公开页 | 询问 / 预约看房（已存在） |
| **freelance** | 图（可选）+ 服务 + 收费 + 交付天 | 图 + 描述 + 作品链接 | "下一步" → **项目简介** 表单（需求 + 截止日 + 预算范围） |

---

## 4. 文件改动清单

### 新增
- `supabase/migrations/<ts>_services_biz_fields.sql` — 上面 7 个字段（默认值都安全，旧数据不会坏）
- `src/components/ProductDetailModal.tsx` — 多图轮播 + 按 biz 显示字段 + 加入订单
- `src/components/AddonsEditor.tsx` — 多选加料编辑器（fnb / beauty）
- `src/components/BookingSlotPicker.tsx` — beauty 日期+时间段选
- `src/components/ProjectBriefForm.tsx` — freelance 项目简介
- `src/lib/bizFormConfig.ts` — 一个 map：`{ retail: { steps: [...], fields: [...] }, fnb: {...}, ... }`，wizard 读这个 config 渲染对应字段

### 改
- `src/routes/services.tsx` — `ServiceFormSheet` 改成读 `bizFormConfig`，按 bizType 渲染不同 3 页
- `src/routes/listing.$id.tsx` — 也改成 wizard 风格（图片 / 基本资料 / 户型详情）
- `src/routes/order.$code.tsx` — 卡片点击打开 `ProductDetailModal`；checkout 末步按 biz 接 BookingSlotPicker / ProjectBriefForm / EducationDetailsForm
- `src/lib/public-order.functions.ts` + `public-order.server.ts` — `select` 多带新字段；orders 表 payload 接受 booking_at / project_brief（写入 orders.notes 或 jsonb，不另开表）

### 不动
- 后端 RLS / 权限（services / listings 已有完整 RLS）
- 现有 orders / customers / 通知逻辑
- 国际化 key 新增的部分会一起补到 I18nContext

---

## 范围之外

- 真正的预约日历冲突检测（先做 picker UI + 写到 orders.notes，后续再做日历）
- 自动扣库存
- 教育课程的"批次"独立表（现在 intake 用 text 字段够用）