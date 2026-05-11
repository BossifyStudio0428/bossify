把推送功能完整跑通的三件事我都规划好了。

## 1. 让定时推送 work（修 cron 认证）

**问题**：cron 用 `x-cron-secret` 认证，但数据库 `app.push_secret` 没设置，且 ALTER DATABASE 不允许。

**做法**：改用 Supabase 推荐的 `apikey` header 模式（用 anon key），不再依赖自定义 secret：
- 修改 edge function `send-push`：当请求头 `apikey` 等于 `SUPABASE_ANON_KEY` 时，视为 cron 调用，允许 broadcast。
- 修改数据库函数 `trigger_push_kind`：把请求头从 `x-cron-secret` 改成 `apikey: <anon_key>`。
- 这样不需要在 DB 里存任何密钥，也不需要改 secrets。

## 2. 加测试按钮（方便你在手机上验证）

在「通知设置」页面（`/notification-settings`）加一个 **"发送测试推送"** 按钮：
- 点击后调用 `sendPushToSelf({ kind: "custom", title: "Test", body: "推送 work 啦 🎉" })`
- 显示成功 / 失败 toast
- 只在 Android 原生 app 里有意义，但在浏览器点也不会出错

## 3. 检查 Capacitor / FCM 配置

确认推送在 APK 里能正常注册：
- ✅ `@capacitor/push-notifications` 已装
- ✅ `pushRegister.ts` 已经在用户登录后调用
- ⚠️ 你需要确认 `android/app/google-services.json` 已经从 Firebase Console 下载并放进去（Lovable 看不到 android 文件夹下用户本地放的文件）
- 在 `ANDROID_BUILD.md` 末尾加一段「FCM 推送配置检查清单」，列出：
  1. Firebase 项目里启用了 Cloud Messaging
  2. `google-services.json` 放在 `android/app/`
  3. `android/build.gradle` 和 `android/app/build.gradle` 已加 Google Services 插件
  4. 重新 `npx cap sync android` 然后 build AAB

## 流程

```text
手机 app 登录 → 注册 FCM token → 存进 device_tokens 表
       ↓
新订单 / 定时任务 → send-push edge function → FCM → 手机收到推送
```

## 技术细节

- Cron 切到 anon key 模式后，`PUSH_WEBHOOK_SECRET` 就成了死代码，但保留它不影响功能（向后兼容）。
- 测试按钮使用现有 `sendPushToSelf`，不需要新增任何后端。
- google-services.json 是你本地操作，我没法替你做，但会写清楚步骤。

做完之后，你只需要：
1. 重新 `bun run build && npx cap sync android`
2. 在 Android Studio build 新 AAB
3. 装到手机 → 登录 → 点测试按钮 / 等定时任务

就能验证推送了。