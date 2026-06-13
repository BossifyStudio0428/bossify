## 思路

在现在 Shopee 风格长表单基础上，把上轮没做的 3 件补上。纯前端改动，不动数据库、不动 RLS。

---

## 1. 九宫格拖拽排序

依赖：`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`（先 `bun add` 装上）

改 `src/components/ProductImagesGrid.tsx`：

- 用 `DndContext` + `SortableContext`（`rectSortingStrategy`）包住 9 宫格
- 每个已上传图片格 = `useSortable` 项，长按 200ms 触发拖动（`PointerSensor` + `activationConstraint.delay`）
- 拖动时显示半透明 + 缩放反馈，拖到别的格自动换序
- 第 1 格（封面）也参与排序，拖到第 1 位 = 设为封面，原来的"⭐ Cover"按钮保留作为单击快捷
- 空格 `+` 不可拖
- 移动端用 `TouchSensor`，桌面用 `PointerSensor`，都加 5px 容差避免误触

---

## 2. 视频自动缩略图

`ProductImagesGrid.tsx` 视频上传成功后：

1. 用 `<video>` 元素在内存中加载视频（`crossOrigin="anonymous"`，`preload="metadata"`）
2. `seekTo(0.1)` 后用 `canvas.drawImage()` 抓帧
3. `canvas.toBlob('image/jpeg', 0.8)` → 上传到同一个 `product-images` bucket 的 `{userId}/video-thumbs/{uuid}.jpg`
4. 把 URL 通过新 prop `onVideoThumbChange(url)` 回传到 `ProductFormScreen`，写到一个新的本地 state，保存时随表单一起传

不加数据库列（避免再跑迁移）——用 **现有的 `cover_image_url`**：如果用户没上传任何图片只上传了视频，自动把视频缩略图填到 `cover_image_url`，保证 order page 和 list 卡片有图。如果用户已经有图片，缩略图只用在表单内预览。

预览：视频缩略图先用 `<video preload="metadata">` 自己渲染那一帧，不用等抓帧完成。

---

## 3. 草稿自动保存

新文件 `src/lib/formDraft.ts`：

```ts
export function loadDraft<T>(key: string): T | null
export function saveDraft<T>(key: string, value: T): void   // debounced 500ms
export function clearDraft(key: string): void
```

底层 `localStorage`，key 形如：
- `draft:service:{userId}:{bizType}:new` 新建
- `draft:service:{userId}:{bizType}:{serviceId}` 编辑
- `draft:listing:{userId}:new` / `:{id}`
- `draft:inventory:{userId}:new` / `:{id}`

集成点：
- `src/routes/services.tsx` 的表单 state：`useEffect` 监听 state 变化 → debounced `saveDraft`；mount 时 `loadDraft` 优先；保存成功 → `clearDraft`
- `src/components/InventorySheets.tsx` 同样接入
- 打开表单时如果检测到 draft 且与 initial 不同，顶部 banner："发现未保存的草稿，[恢复] [丢弃]"（不强制覆盖，让用户选）

不存图片/视频原始文件，只存它们已上传后的 URL 数组（已经在 storage 里了，刷新也还在）。

---

## 文件清单

### 新增
- `src/lib/formDraft.ts`

### 改
- `src/components/ProductImagesGrid.tsx`（dnd-kit 排序 + 视频抽帧）
- `src/components/ProductFormScreen.tsx`（接收 draft banner slot，可选）
- `src/routes/services.tsx`（接 draft load/save/clear）
- `src/components/InventorySheets.tsx`（接 draft load/save/clear）
- `src/routes/listing.$id.tsx` / `src/routes/listings.tsx` 新建入口（接 draft）

### 依赖
- `bun add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

### 不动
- 数据库 / RLS / storage bucket
- WizardSheet 和其它非产品表单
- order page 显示逻辑（已经会用 cover_image_url）

---

## 范围之外

- 多设备同步草稿（只本地 localStorage）
- 视频转码 / 服务端抽帧
- 拖拽排序桌面端键盘可达性（`KeyboardSensor` 暂不加）
