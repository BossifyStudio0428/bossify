## 目标

把 `src/routes/orders.tsx` 里的订单卡片换成所选 v2「结构分区」设计：信息分三个区（身份 / 商品 / 金额+操作），重要信息（客户名、状态、金额、主按钮）加重，次要信息（订单号、时间）变弱。

## 卡片结构

```text
┌─────────────────────────────────┐
│ [头像]  ZH  [来源标签]    [状态] │ ← Header (白底)
│        📞 电话号码         ⋮    │
│ ─────────────────────────────── │
│ 单号: ORD-...        今日 8:56am │
├─────────────────────────────────┤
│ [小图] 商品名             × 1   │ ← Content (浅灰底)
│ 📍 地址全文                      │
├─────────────────────────────────┤
│ 实付款           [图标][图标]│[✓ 收据已发送] │ ← Footer
│ RM 16.00                         │
└─────────────────────────────────┘
```

## 视觉规范（直接套用 prototype tokens）

- 卡片：`bg-white rounded-2xl border border-slate-100`，柔和阴影
- 头像：12×12 圆形，`bg-indigo-50 text-indigo-600 font-bold`
- 客户名：`text-slate-900 font-bold text-base`（重）
- 来源 chip：`bg-indigo-50 text-indigo-600` 小圆 pill
- 电话：`text-slate-500 text-sm` + 小电话 icon
- 状态 chip：`bg-emerald-50 text-emerald-600 font-semibold` + 跳动小圆点（已付款时）
- 单号 + 时间：`text-[11px] text-slate-400`（弱），上方加 `border-t border-slate-50` 分隔
- 商品区：`bg-slate-50/50` 浅灰底块；商品名 `text-slate-700 font-medium`，× N 弱化
- 地址：`text-slate-500 text-xs leading-relaxed`，带粉色定位 icon
- 金额：上方小字 "实付款" uppercase 弱，下方 `text-xl font-bold text-slate-900`
- 操作区：附件/删除两个 icon 按钮（弱色），右侧用 `border-r` 与主按钮分隔
- 主按钮：`bg-emerald-500 text-white rounded-xl font-bold` + 阴影，已发收据时显示「✓ 收据已发送」，未发显示「发送收据」

## 实现范围

只改 `src/routes/orders.tsx` 中订单卡片的 JSX（之前讨论过的那段：约 800–900 行附近，包含头像、状态、商品名、地址、金额、操作按钮）。

保留全部现有逻辑与交互：
- 状态下拉切换
- 上传 / 删除 / 标记收据已发送 等 onClick handler
- 产品图（如果有 `productImages[name]`）当作商品名前的小缩略图
- 翻译 key（`t('...')`）保持原状

## 不改

- 页头「订单」「1今日」「上传/文件」按钮
- 「我的订单表格」开关条
- Tab 栏（全部/未付款/已付款/待处理）
- 日期筛选
- 底部导航 + FAB
- 任何后端 / 数据获取代码

## 技术细节

- 用项目现有 Tailwind 工具类，颜色直接套 prototype 里的 `slate / indigo / emerald / rose` —— 这块订单卡片在原代码就是直接用 Tailwind 颜色类（不是 semantic tokens），保持一致。
- 图标继续用 `lucide-react`（Phone、MoreVertical、MapPin、Paperclip、Trash2、Check 等），替换 prototype 里的内联 SVG。
- 不引入新依赖。
