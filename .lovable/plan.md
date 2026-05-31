## 目标

把上一轮误加的「原生 VAPID Web Push」路径删掉，让 Android + Web 都统一走 FCM。这样你不用再去找 VAPID secret，逻辑也更简单——只有一条推送通道。

## 背景

你的 Web 推送一直走的是 **FCM for Web**（`firebase-messaging-sw.js` + Firebase 的 VAPID public key 写在 `src/lib/firebaseConfig.ts`，public 值，非 secret）。Server 端用 `FCM_SERVICE_ACCOUNT_JSON` 通过 FCM HTTP v1 一并推送 Android + Web。

上一轮我额外加了一条「server 用 `npm:web-push` + VAPID 私钥直接 push 浏览器」的路径，需要 `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` 三个 secret。这条路径与现有 FCM 路径功能重叠，是多余的——所以你今天看到「VAPID 哪里弄」就是因为我多加的代码在找它们。

## 改动

### 1. `supabase/functions/send-push/index.ts`
- 删掉 `sendWebPush` 函数、`VAPID_*` env 读取、`npm:web-push` import。
- `dispatch` 只保留：
  - 从 `device_tokens` 读所有 FCM token（Android + iOS + Web 都在这里，platform 字段区分）。
  - 调 `sendToTokens` 统一通过 FCM HTTP v1 发送（message body 里 `webpush.notification` 块已经覆盖浏览器渲染）。
- 删掉读 `device_sessions.push_subscription`、`webSubs` 这条分支。
- `device_sessions` 不再参与发送决策，只用作"哪些设备登录过"的展示（设备管理页用）。
- `diagnostic` 模式继续保留，但只汇报 `device_tokens` 计数 + 每行 platform；删掉 `has_vapid_keys` 字段。

### 2. `src/lib/deviceSession.ts`
- 删掉 `saveDeviceSessionPush` 函数。它原本写入 `fcm_token` / `push_subscription` / `is_current` 三个外部 DB 列，现在不需要——FCM token 已经通过 `registerDeviceForPush` 写进 `device_tokens` 了。
- 保留 `registerDeviceSession`、`getDeviceId`、`getDeviceName`、`getDeviceType`、`removeDeviceSession`（设备登录管理仍然要用）。

### 3. `src/lib/pushRegister.ts`（Android）
- 删掉 `saveDeviceSessionPush` 调用和 `@capacitor/device` 的 import。
- Android 注册只做：FCM 注册 → `registerDeviceForPush({ platform: "android" })` → 写入 `device_tokens`。结束。

### 4. `src/lib/webPush.ts`（浏览器）
- 删掉 `saveDeviceSessionPush` 调用和 `pushManager.getSubscription()` 那段。
- 浏览器注册只做：service worker → `getToken(vapidKey)` → `registerDeviceForPush({ platform: "web" })` → 写入 `device_tokens`。结束。

### 5. 通知设置页 `Diagnose push` 按钮
保留按钮和摘要 toast；摘要文案改成只显示 FCM token 数（按 platform 分组：android / web / ios），不再提 VAPID。

### 6. 不动的部分
- `device_sessions` 表本身和 `register_device_session` RPC 不删——它仍然驱动「我登录了哪些设备 / 设备数量限制」。
- `firebase-messaging-sw.js`、`src/lib/firebaseConfig.ts`、Firebase VAPID public key 不动。
- 现有 3 语言（中文 / BM / English）逻辑不动。

## 不需要做的事

- ❌ 不需要再创建 / 添加任何 `VAPID_*` secret。
- ❌ 不需要 npm 安装 `web-push`（Deno edge function 也不再 import 它）。
- ❌ 不需要外部 DB 加 `is_current` / `fcm_token` / `push_subscription` 列（之前误加的 client 写入会一并删掉）。

## 验证步骤

清理完后：
1. 浏览器打开通知设置 → 允许 → 点 **Diagnose push** → 应该看到至少 1 个 `platform='web'` token。
2. 点 **Test push** → 浏览器应收到通知。
3. Android app 启动 → 登录 → 自动注册 → Diagnose push 应该多出 `platform='android'` token。
4. Android app 发 test push → 手机通知栏应收到。

整套不再依赖 VAPID secret，逻辑回到「加 web 之前」的稳定形态。
