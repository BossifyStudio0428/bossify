## 目标
F&B 商家用的是「食材（ingredients）」而不是 inventory。首页的「库存不足」第四格应跟随 ingredients 表，链接也应跳到 /ingredients。

## 变更（仅 `src/routes/index.tsx`）

1. **数据来源按业务类型切换**
   - `retail`：继续查 `inventory`，`stock <= 5` 计为低库存（保持原逻辑）。
   - `fnb`：改为查 `ingredients` 表的 `current_stock` 与 `min_stock`，`current_stock < min_stock` 计为低库存（与 `/ingredients` 页面的判定一致）。
   - 在 `load()` 中按 `bizType` 选择对应查询，结果写入同一个 `lowStock` state。
   - 实时订阅（`postgres_changes`）也按业务类型订阅对应表（fnb → ingredients，retail → inventory）。

2. **卡片文案 & 跳转**
   - F&B 第四格 `lowStockCard` 的标签保持 `t("low_stock")`，但渲染时若 `eff === "fnb"`，点击跳到 `/ingredients`；retail 仍跳 `/inventory`。
   - 由于卡片目前是 Stat 渲染（非 Link），需让该 stat 支持自定义 `to`，或在 stats 网格里给低库存格特殊包一层 Link。采用最小改动：给 `Stat` 增加可选 `to` 字段，渲染时若有 `to` 就用 `Link`，否则用 `div`。

3. **不动**
   - ingredients 页面、inventory 页面本身。
   - 其它业务类型的卡片。

## 影响
- F&B 首页「库存不足」数值与 `/ingredients` 顶部红条数值一致，点击直达食材页。
- Retail 行为不变。
