## 你看到的问题

页 2、页 3 显示**空白** — 不是因为没字段，是 `WizardSheet` 的左右滑动数学算错了：

- pager 容器宽度 = `300%`（3 页）
- 每页宽度 = `33.33%` of pager = 100% 视口 ✓
- 但 `translateX(-100%)` 是 **相对元素自身**，等于 −300% 视口 → 整个内容滑出屏幕外，所以你看到一片空白

这是 1 行 CSS 的小 bug，不是设计问题。

---

## 还有 property 的事

你说"屋子 property 要每个图片介绍" — 现在 `listings.tsx`（property 房源）虽然数据库已经有 `images` 数组字段，但表单还只能上传 1 张图，没有 Shopee 那种多图。

---

## 计划（3 件事，都是前端）

### 1. 修 `WizardSheet` 滑动 bug
- pager 容器改 `w-full`（不用 300%），每个 step 改 `w-full shrink-0`
- transform 改 `translateX(-${idx * 100}%)`（相对自身 = 100% 视口，正确）
- 结果：page 2 / page 3 立刻有内容显示

### 2. Property listings 也用 wizard（多图 + 分页）
改 `src/routes/listings.tsx` 的新增/编辑表单 → 用 `WizardSheet`，3 页：
- Page 1 — **图片**：`ImagesUploader`（最多 6 张，首图自动当封面）
- Page 2 — **基本资料**：标题、类型、买/租、价格、地址
- Page 3 — **房屋详情**：卧室、浴室、面积、状态、描述

列表卡片继续显示 `images[0]`（已经在做）。

### 3. 顺手核对 inventory 和 services 的 3 页都填好内容
按现在的代码两个都已经填齐了（services: 图片/资料/库存+变体；inventory: 图片/资料/库存+变体），bug 修完就能看到。

---

## 不在范围

- 不动后端、不动 SQL（`listings.images` 字段已存在）
- 不改客户端 order form 的产品详情 modal（已经做好）
- 不动 services / inventory 的字段结构