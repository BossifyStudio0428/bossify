## 思路

去掉现在 `WizardSheet` 那种"一页一页点继续"的流程。改成 Shopee Seller Center 那种：**全屏弹窗 / 整页，一条长表单从上往下滚，分 section 卡片**，所有字段一眼看到，底部一个"保存"按钮常驻。

---

## 1. 新组件 `ProductFormScreen`（取代 wizard）

全屏 sheet（不是 88vh 抽屉），顶部 sticky header（关闭 + 标题 + 保存），中间 scroll 区按 section 渲染卡片，每张卡片就是 Shopee 那种白底圆角 + 标题 + 字段。

```text
┌─────────────────────────────────┐
│ ✕  新增产品              保存   │  sticky
├─────────────────────────────────┤
│ ┌─ 商品图片 ─────────────────┐  │
│ │ [封面]  [+][+][+]          │  │  九宫格
│ │ [+][+][+][+][+]            │  │
│ │ 视频: [+ 上传视频]          │  │
│ └────────────────────────────┘  │
│ ┌─ 基本信息 ─────────────────┐  │
│ │ 名称  __________           │  │
│ │ 分类  [选择 ▼]             │  │
│ │ 描述  __________           │  │
│ └────────────────────────────┘  │
│ ┌─ 价格 & 库存 ──────────────┐  │
│ │ 价格  RM ____   库存 ___   │  │
│ │ + 启用多规格                │  │
│ └────────────────────────────┘  │
│ ┌─ (biz 专属 section) ───────┐  │
│ └────────────────────────────┘  │
└─────────────────────────────────┘
```

### Section 顺序（按 biz）

| Biz | Section 顺序 |
|-----|--------------|
| retail | 图片 → 基本信息 → 价格&库存 → 规格(变体) |
| fnb | 图片 → 基本信息(含分类) → 价格&库存 → 选项(辣度/冰/糖/加料) |
| beauty | 图片 → 基本信息 → 价格&时长 → 加料服务 |
| education | 图片 → 课程信息(名/等级/入学/学时) → 学费 → 入学要求 |
| property | 图片 → 房源信息(标题/买卖租/地址) → 价格 → 户型(卧/浴/面积/状态) |
| freelance | 图片 → 服务信息 → 收费(固定/按小时) → 交付时间 & 作品链接 |

---

## 2. 九宫格图片组件 `ProductImagesGrid`

替换现在的 `ImagesUploader`（在产品表单里用，其它地方不动）：

- **第 1 格**：封面图（更大，左上角标"封面"badge），点击上传/替换
- **2-9 格**：3×3 网格，空格显示"+ 添加"虚线框，已传显示缩略图 + 右上角 ✕
- **长按拖动排序**（用 `@dnd-kit/sortable`，已在依赖里就用，没有就用简单的左右箭头先顶上）
- **视频位**：网格下方一个独立按钮"+ 上传视频"，已传显示缩略图 + 时长 + ✕
- 限制：图 ≤9 张 / 每张 ≤5MB；视频 ≤1 个 / ≤30MB / mp4

视频存到现有 `service-images` bucket，加一列 `video_url text` 到 `services` 和 `listings`。

---

## 3. 数据库改动

```sql
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS cover_image_url text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS cover_image_url text;
```

`cover_image_url` 用来明确存"封面"那张，避免依赖 `images[0]` 顺序。其它字段（category / addons / rate_type / level / intake / requirements / turnaround_days / portfolio_links）上一轮已经加好，不重复。

---

## 4. 文件改动清单

### 新增
- `src/components/ProductFormScreen.tsx` — Shopee 风格全屏长表单容器（header + scroll sections + sticky save）
- `src/components/ProductImagesGrid.tsx` — 九宫格 + 封面 + 视频位
- `src/components/form-sections/BasicInfoSection.tsx` — 名称/描述/分类
- `src/components/form-sections/PriceStockSection.tsx` — 价格/库存/变体开关
- `src/components/form-sections/AddonsSection.tsx` — fnb/beauty 加料和选项编辑器
- `src/components/form-sections/BookingSection.tsx` — beauty 时长
- `src/components/form-sections/CourseSection.tsx` — education 等级/入学/学时/要求
- `src/components/form-sections/PropertySection.tsx` — property 户型/状态
- `src/components/form-sections/FreelanceSection.tsx` — 收费类型/交付/作品链接
- `src/lib/bizFormConfig.ts` — `{ retail: [BasicInfo, PriceStock, Variants], fnb: [...], ... }` 决定每个 biz 渲染哪些 section

### 改
- `src/routes/services.tsx` — 把 `ServiceFormSheet`（现在用 WizardSheet）整个替换成 `<ProductFormScreen biz={...} initial={...} onSave={...} />`，保存逻辑(insert/update)保留不动
- `src/routes/listing.$id.tsx` + `src/routes/listings.tsx` 的新建入口 — 也用 `ProductFormScreen` 加 `PropertySection`
- `src/lib/public-order.server.ts` — `select` 多带 `video_url`, `cover_image_url`
- `src/routes/order.$code.tsx` — 卡片优先用 `cover_image_url`，detail modal 顶部图片轮播如果有 `video_url` 第一帧就是视频

### 不动
- `WizardSheet.tsx` 保留，其它地方（库存盘点等）还在用
- RLS、orders、customers、通知逻辑、storage bucket 不动

---

## 范围之外

- 真正的视频转码 / 缩略图自动抽帧（视频缩略图先用一个 video 标签 `preload="metadata"` 自己渲染）
- 拖拽排序的高级动画（先做基础排序）
- 草稿自动保存（保存按钮触发即可，不做自动 draft）
