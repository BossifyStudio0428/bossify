
# Bossify 通知系统升级计划

目标：让通知不只是 app 内的小铃铛，而是真正会"叮"一声弹到手机锁屏 / 状态栏的系统通知（Android APK 上是真的 push）。

---

## 现在有什么

- ✅ 已经接入 `@capacitor/local-notifications`（OS 级本地通知）
- ✅ 已经接入 `capacitor-native-settings`（被拒绝时跳到系统设置页）
- ✅ Supabase `notifications` 表（app 内铃铛历史记录）
- ⚠️ 但目前真正会"弹"的只有：低库存、3 天未付款的每日检查

---

## 推荐加 6 种真通知

### 1. 💰 新订单确认 (instant)
顾客下单后立刻弹一个 OS 通知给老板：
> "新订单 #ORD-0123 — Ali 买了 2x 椰浆 = RM 24"
点击 → 跳到该订单详情页。

### 2. ⚠️ 未付款提醒 (1 天 / 3 天 / 7 天，自动)
现在只有 3 天的每日检查。改成按订单各自计时：
- 1 天：温馨提醒
- 3 天：第二次提醒
- 7 天：标记为可能坏账
每个订单独立排程，到时间自动弹。

### 3. 📦 低库存 + 缺货 (instant)
已有低库存。增加：
- 库存 = 0 → "❌ 椰浆已售完，请补货"
- 库存 ≤ max_stock × 20% → "⚠️ 椰浆只剩 5 件"

### 4. 🌅 每日早安总结 (每天 9:00am)
> "早安老板！昨天 5 单 / RM 230 销售 / 还有 3 单未付款"
鼓励老板每天打开 app。

### 5. 🌙 每日晚间收盘 (每天 9:00pm)
> "今天总结：12 单 / RM 580 / 利润 RM 210 🎉"

### 6. 🎯 里程碑 + 客户回归 (instant)
- 第 100 单 / 第 1000 单 → 庆祝通知
- 老顾客 30 天没回购 → "Siti 已经 30 天没下单了，要不要 WhatsApp 一下？"

---

## 通知设置页 (新)

在 Profile 里加一个"通知设置"页，每种通知都可独立开关 + 简短说明（参考 ReLife 那个截图的样式）：

```
├── 全部通知            [●]
├── 其他
│   ├── 🛍 新订单提醒    [●]   立即
│   ├── 💰 未付款追讨    [●]   1/3/7 天
│   ├── 📦 库存警报      [●]   低库存 + 缺货
│   ├── 🌅 早安总结      [●]   每天 9:00am
│   ├── 🌙 收盘报告      [○]   每天 9:00pm
│   └── 🎯 里程碑庆祝    [●]   达成时
└── [打开系统通知设置] →
```

每个开关存在 Supabase `profiles` 新栏位（`notif_*_enabled`），关掉后该类通知就不排程。

---

## 技术细节（给开发参考）

- **真实推送来源**：全部走 `@capacitor/local-notifications`（Android 13+ 会弹真正的系统通知，锁屏可见，APK 上立即生效）。Web preview 用 `Notification` API 退化。
- **定时类**（每日总结、未付款）：用 `LocalNotifications.schedule({ schedule: { on: { hour, minute }, repeats: true } })` 排程。
- **即时类**（新订单、低库存）：在对应业务逻辑触发时直接 `notify()`。
- **Supabase 表**：双写 — 既排 OS 通知（弹屏幕），也写 `notifications` 表（app 内历史）。
- **多语言**：标题 / 内容用 `t()` 翻译，跟随 `bossify_lang`。
- **新增数据库栏位**（需要新 migration）：
  ```
  alter table profiles add column notif_new_order boolean default true;
  alter table profiles add column notif_unpaid boolean default true;
  alter table profiles add column notif_inventory boolean default true;
  alter table profiles add column notif_morning boolean default true;
  alter table profiles add column notif_evening boolean default false;
  alter table profiles add column notif_milestone boolean default true;
  ```
- **文件改动**：
  - 新增 `src/lib/notifSchedule.ts`（排程 / 取消所有定时任务）
  - 新增 `src/routes/notification-settings.tsx`（设置页）
  - 编辑 `src/routes/new-order.tsx`、`orders.tsx`、`inventory.tsx`、`profile.tsx`
  - 编辑 `src/lib/notifications.ts`（加每日 morning/evening 排程方法）
  - 编辑 `src/contexts/I18nContext.tsx`（加翻译 key，EN/BM/ZH）

---

## 建议分两步实施

**第 1 步（核心 5 种 + 设置页）**：新订单、未付款、库存、早安、晚间 + 设置页 + DB migration  
**第 2 步（进阶）**：里程碑、客户回归（需要更多业务逻辑）

要我先做第 1 步吗？还是要全部一起做？
