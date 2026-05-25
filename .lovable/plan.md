# Web Push 通知 for Bossify Web

让 web 用户跟 Android app 一样能收到推送通知（订单、follow-up 提醒），就算关掉网页也能收到。

## 策略

复用现有的 **FCM (Firebase Cloud Messaging)** 基础设施 —— 因为：
- `FCM_SERVICE_ACCOUNT_JSON` secret 已经存在 ✅
- `send-push` edge function 已经在跑，已支持按 `device_tokens` 推送 ✅
- `device_tokens` 表已有 `platform` 字段（目前默认 `android`） ✅
- 只需加 `web` 这一种 platform，FCM 同一个项目同时管 Android + Web

不用买 domain、不用新加 secret（除了一次性的 VAPID public key），不用做 backend rewrite。

## 实施步骤

### 1. 你需要从 Firebase Console 拿两样东西（一次性）
你已经有 FCM project（Android 在用），只需进 Firebase Console：
- **Project Settings → General → Your apps** → 加一个 **Web App** → 复制 `firebaseConfig`（apiKey, projectId, messagingSenderId, appId 这些都是公开的，可放 code）
- **Project Settings → Cloud Messaging → Web Push certificates** → Generate key pair → 复制 **VAPID public key**（也是公开的，放 code）

我会在实施时让你贴进来。

### 2. 加 Firebase Web SDK

```text
bun add firebase
```

### 3. 新建 Service Worker

`public/firebase-messaging-sw.js` —— Firebase 需要这个文件在 root，浏览器关了网页时由它接收 push 并弹通知。

### 4. 新建 web push 注册逻辑

`src/lib/webPush.ts`：
- 检查浏览器是否支持（Chrome/Edge/Firefox/Safari 16.4+ 都行）
- 注册 service worker
- 请求 Notification 权限
- 用 Firebase Messaging `getToken(vapidKey)` 拿到 FCM web token
- 把 token 插入 `device_tokens` 表，`platform = 'web'`

### 5. 改 `src/lib/notifications.ts`

`requestNotifPermission()` 现在只处理 Capacitor 原生。加一个分支：
- 如果是 web（非 Capacitor），调 `webPush.ts` 的注册函数
- 现有的 `localStorage` 权限标记 + UI 提示弹窗都不动

### 6. 改 `send-push` edge function

目前推送代码已经按 device tokens 推送 → FCM 的 sendMulticast 同时支持 Android FCM token 和 Web FCM token（**同一个 API**），所以**不需要改逻辑**，只需确认它没过滤 `platform = 'android'`（要看一眼现有 code 来确定）。如果有过滤，就放宽成 `platform IN ('android', 'web')`。

### 7. UI 改动（最小）

`NotifPermissionPrompt.tsx` 现有的"允许通知"弹窗在 web 也会触发（因为 `enabled` 判断的是 user 设置），只需保证 `requestNotifPermission()` 在 web 也能跑 → 步骤 5 做完就行。

## 触发点 —— 已经在跑，不用改

订单提交 (`submitPublicOrder`) 已经在调 `send-push` with `kind: 'new_order'` 和 `targetUserId`。Web push 注册后，同一个用户的 web token 也在 `device_tokens` 里 → **同一条订单会自动同时推送到 Android app 和 web 浏览器**。

## 兼容性

| 浏览器 | 支持 |
|---|---|
| Chrome (desktop + Android) | ✅ |
| Edge | ✅ |
| Firefox | ✅ |
| Safari macOS 16+ | ✅ |
| **Safari iOS 16.4+** | ✅（用户必须先把网页"加入主屏幕"才能收 push，iOS 限制） |
| iOS Safari < 16.4 | ❌（fallback 到现有的页面打开时通知） |

## 文件改动清单

**新增：**
- `public/firebase-messaging-sw.js`
- `src/lib/webPush.ts`
- `src/lib/firebaseConfig.ts`（公开 config）

**修改：**
- `src/lib/notifications.ts`（加 web 分支）
- `package.json`（加 firebase）
- 可能改 `supabase/functions/send-push/index.ts`（如果有 platform 过滤）

**不动：**
- `device_tokens` 表（已经支持 platform 字段）
- `submitPublicOrder` 触发逻辑
- Android Capacitor 流程

## 你需要做的

1. **现在**：批准这个 plan
2. **Plan 跑到一半时**：去 Firebase Console 拿 Web App config + VAPID public key 贴给我
3. 我把 code 写完，你测试 → 在 web 上填个 order form，看通知会不会弹

准备好就按 Implement，我先开始 1, 3, 4, 5, 6 的部分，等到第 4 步会跟你要 Firebase config。