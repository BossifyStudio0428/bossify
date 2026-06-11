## 目标

现在顾客端 detail modal 已经能左右滑、看大图、看库存和变体 — 但因为管理端添加表单太简单（只有单图/名称/描述/价格），所以滑过去其实"没什么东西看"。

这次把 **管理端表单** 补齐，所有 business type 通用。

## 改动范围

### 1. 数据库迁移（一次性）

给 `services` 和 `inventory` 两张表都加：

- `images jsonb` — 多图 URL 数组（最多 6 张）

变体和库存字段已经存在：
- `services.variants` ✅ `services.stock` ✅
- `inventory.variants` ✅ `inventory.stock` ✅

保留旧的 `image_url` 字段做向后兼容（读取时优先用 `images[0]`，回退到 `image_url`）。

### 2. 管理端表单升级

**`src/routes/services.tsx` — `ServiceFormSheet`**

新增：
- **多图上传**：缩略图网格，可加可删可调顺序，最多 6 张
- **库存数量**：数字输入（留空 = 不追踪库存）
- **变体编辑器**：可加多行，每行 = 名称 + 价格（可选 + 库存可选）。例：S/M/L、单人/双人、Basic/Premium

**`src/routes/inventory.tsx` 和 `src/routes/inventory.$itemId.tsx`**

同样三项升级（多图 + 变体编辑器；库存输入已经有了）。

### 3. 顾客端 modal 调整

**`src/routes/order.$code.tsx` + `src/lib/public-order.server.ts`**

- 读取 `images[]`（回退 `image_url` 单图）
- Services 类型也开启 detail modal 的图册和变体（之前只对 retail/F&B 启用）
- 变体选择时联动价格（已有逻辑，确认对 services 也生效）

## 技术细节

```text
新字段:
  services.images   jsonb DEFAULT '[]'::jsonb
  inventory.images  jsonb DEFAULT '[]'::jsonb

数据形状:
  images   = ["https://...", "https://...", ...]
  variants = [{ name: "Small", price: 10, stock: 5 }, ...]
```

变体编辑器组件 `<VariantsEditor>` 抽到 `src/components/`，两个表单共用。

多图上传组件 `<ImagesUploader>` 同样抽出来共用，复用现有 `product-images` storage bucket。

## 不在范围内

- 分类/标签字段（用户没要求，先不动）
- 拖拽排序图片（先用"上移/下移"按钮，简单可靠）
- 库存自动扣减逻辑（已有 `deduct_stock_on_order` trigger 在跑）
