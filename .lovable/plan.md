## 目标

1. 管理端「加产品/服务」表单 → 改成 Shopee 风格的**左右滑动 3 页**，底部固定保存按钮（不再被遮挡）
2. 客户 order form 点产品 → 全屏 modal，顶部**多图轮播**，下面详情 + variant 选择 + 数量

---

## A. 管理端表单（services + inventory 共用）

新组件 `ProductFormSheet`（替换现有 `ServiceFormSheet`，inventory sheet 同步使用）：

**布局：**
```text
┌─────────────────────────────┐
│  ←   编辑服务         ✕     │  header
├─────────────────────────────┤
│  ● ○ ○   1 / 3              │  进度点
├─────────────────────────────┤
│                             │
│     [可滑动的 3 页内容]      │  scroll-snap-x
│                             │
├─────────────────────────────┤
│  [上一步]      [下一步/保存] │  固定底部
└─────────────────────────────┘
```

**3 页内容：**
- Page 1 — 图片：`ImagesUploader`（多图，最多 6 张）
- Page 2 — 基本信息：名称、描述、价格、时长（仅 beauty）
- Page 3 — 库存与选项：库存数量、变体编辑器

**交互：**
- 用 `scroll-snap-type: x mandatory` 横向滑动；圆点可点击跳转
- 底部按钮：page 1/2 = "下一步"，page 3 = "保存"；左边 "上一步"（page 1 隐藏）
- sheet 高度固定 `h-[85vh]`，header 和 footer 固定，中间区可滚动 → 保存按钮永远可见

---

## B. 客户端产品详情 modal

新组件 `ProductDetailModal`，在 `order.$code.tsx` 点产品卡时打开：

**布局：**
```text
┌─────────────────────────────┐  full screen
│  ✕                          │
│  ┌───────────────────────┐  │
│  │   图片轮播 (swipe)    │  │  aspect 1:1
│  │      ● ○ ○            │  │
│  └───────────────────────┘  │
│                             │
│  产品名             RM 25   │
│  描述文字...                │
│                             │
│  选项                       │  variant chips
│  [小] [中✓] [大]            │
│                             │
│  数量    [−] 1 [+]          │
│  库存：还剩 8 件             │
├─────────────────────────────┤
│       [加入订单]             │  固定底部
└─────────────────────────────┘
```

**功能：**
- 顶部 `scroll-snap` 横向多图轮播 + 圆点
- 选 variant 时价格同步更新
- 数量受 stock 限制
- "加入订单" 关闭 modal 并把选中项（含 variant + qty）加进购物车

**触发：** Services / Retail / F&B 三种类型的产品卡都点击可开 modal（不止 retail）

---

## 技术细节

- 数据已就绪：`services` / `inventory` 都有 `images jsonb`、`stock`、`variants jsonb`
- `public-order.server.ts` 已返回完整字段，不用改后端
- 国际化新增 key：`next`, `previous`, `step_images`, `step_basic`, `step_stock`, `add_to_order`, `quantity`, `in_stock_left`

## 不在范围

- 拖拽排图（保留现在的左右箭头）
- 自动扣库存
- 分类/标签
