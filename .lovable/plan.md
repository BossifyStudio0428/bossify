## 目标

把 `order.$code.tsx` 里的产品/服务详情弹窗升级成像 Shopee/Lazada 那样：
- 在弹窗里左右滑动，就可以切换到上一个 / 下一个产品
- 详情更完整：多图轮播、库存状态、变体选择、完整描述
- 所有 business type（retail/fnb/beauty/education/freelance/property、services）共用同一套体验

## 改动文件

只动一个文件：`src/routes/order.$code.tsx`（重写 `DetailSheet` + 调整调用方式）。

不改 DB、不改 API、不改后端逻辑——所有需要的数据（image_url、images、variants、description、category、stock）已经在 `Product` 类型和 `/api/public/order-form` 返回里。

## 详情弹窗新行为

### 1. 横向滑动切换产品

- `DetailSheet` 接收 `products: Product[]` + `initialIndex` + `onAdd(productId,...)`，而不是单个 `product`。
- 弹窗内部用一个 `currentIndex` state。
- 一个可横向滚动的 flex 容器（每个 slide 100% 宽，`snap-x snap-mandatory`），靠原生 scroll-snap 实现滑动手势 + 翻页动画。
- `scroll` 事件用 throttle 同步 `currentIndex`，用来：
  - 顶部"X / N"指示器
  - 重置变体选择 / 数量 / 图片轮播 index
- 左右各放一个箭头按钮（桌面端 / 不会滑的用户也能用）。
- 关闭按钮（X）固定在右上角浮层，不在滑动容器内。

### 2. 每张详情页内容

按用户选择，每页显示：

- **多图轮播**：用 `product.images`（fallback `image_url`）。一个独立的 scroll-snap 横向条 + 圆点指示器 + 缩略图条（property 已有，复用并扩展到所有 type）。
- **类目 / 名称 / 价格 / 描述（whitespace-pre-wrap）**
- **库存状态**：
  - `product.stock` 字段：如果 `> 0` 显示 `In stock · {n} left`（少于 5 时红色 "Only {n} left"），`=== 0` 显示 `Out of stock`（"Add" 按钮禁用），`null/undefined` 不显示（服务类没库存）。
  - 多语言（en/ms/zh）。
- **变体选择**：保留现有 list，选中重新计算 unitPrice + 显示该变体的库存（如果未来 variant 自己有 stock 就用 variant 的；目前用 product 的）。
- **数量加减**：retailish 才显示，加号上限 = `min(99, stock ?? 99)`。
- **底部 CTA**：`Add to cart` / `Enquire` / `Book` ... 按 bizType 走现有 `addToCartLabelFor`。库存为 0 时灰掉、不可点。

### 3. 调用方式调整

- `openProduct` state 改成 `openProductIndex: number | null`。
- 列表卡片点击：`setOpenProductIndex(filteredProducts.indexOf(p))`（用当前过滤后的列表，保证滑动切换的是用户看到的同一批产品）。
- `renderDetailSheet` 传 `products={filteredProducts}` + `initialIndex={openProductIndex}`。
- `onAdd` 拿当前 slide 的 product 来构造 CartLine（property 类型保持现有"不进 cart 直接走 Enquire"流程；现 DetailSheet 已经走 `onAdd` 加进 cart 然后关弹窗——保留 property 例外：property 详情页 CTA 仍是 Enquire（WhatsApp），不调用 `onAdd`，不切到购物车）。

### 4. UI 细节

- 弹窗高度 `max-h-[92vh]`，内层每个 slide 独立 `overflow-y-auto` 以便长内容滚动。
- 滑动时禁止纵向滚动冲突：水平 swipe 用 scroll-snap，足够顺。
- 进入时滚动到 `initialIndex` 对应位置（`scrollLeft = idx * width`），不带动画。
- 顶部加一个"X / N"小指示器 + 左右箭头（disabled when at edge）。
- 关闭按钮、指示器都在滑动容器外的固定层。

## 技术说明（给开发参考）

- 不引第三方 carousel 库，纯 CSS scroll-snap + 一个 ref + `useEffect` 监听 scroll 同步 index。性能好、bundle 小。
- `Product` 类型已经有 `images?: string[]`、`stock?: number | null`、`variants`、`description`、`category`。如果 `stock` 字段当前类型里没有，加到 `Product` 接口和 API select。
- 验证：build 跑通后用 preview 打开 `/order/{code}` 测试：点产品 → 弹窗、左右滑、变体切换、缺货状态、加入购物车。
