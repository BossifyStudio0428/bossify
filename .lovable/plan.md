## Android FCM 推送通知方案（仅 Android）

### 你需要先做的两件事

**1. 修复 build.gradle 拼写**（你已确认自己改）
```gradle
implementation("com.google.firebase:firebase-messaging")  // 不是 messasing
```

**2. 生成 FCM Service Account JSON**
- Firebase Console → 项目设置（齿轮图标）→ **服务账号** 标签
- 点 **"生成新的私钥"** → 下载 JSON 文件
- 文件长这样：`{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}`
- 下载后我会让你通过 Lovable 安全地存为 secret `FCM_SERVICE_ACCOUNT_JSON`

---

### 我会做的事情

#### 1. 数据库（新增一张表）
```
device_tokens
├─ id (uuid)
├─ user_id (uuid, FK auth.users)
├─ token (text, FCM device token)
├─ platform (text: 'android')
├─ updated_at (timestamptz)
└─ unique(user_id, token)
```
+ RLS：用户只能读写自己的 token

#### 2. App 端（Capacitor）
- 安装 `@capacitor/push-notifications`
- 新增 `src/lib/pushRegister.ts`：登录后注册 FCM token，存到 `device_tokens` 表
- 在 `__root.tsx` 或 AuthContext 里挂载注册逻辑（仅 native 平台执行，浏览器跳过）
- 处理 token 刷新事件

#### 3. 后端推送服务（TanStack server route）
- 新增 `/api/public/send-push`（HMAC 验证 + Service Account JWT 签名）
- 新增 `src/lib/fcm.ts`：用 Service Account 生成 OAuth2 access token，调用 FCM HTTP v1 API
- 关键函数：`sendPushToUser(userId, title, body, link)`

#### 4. 实时推送触发（事件驱动，无需 cron）
- **新订单创建**：在 `new-order.tsx` 保存订单后调用 `sendPushToUser`
- **低库存**：在 `inventory.tsx` 库存更新后检查并推送
- **里程碑**：达成时推送

#### 5. 定时推送（pg_cron）
在数据库里创建 3 个定时任务，调用 `/api/public/send-push`：
| 时间 | 内容 | 来源 |
|------|------|------|
| 09:00 | 早上摘要（昨日订单 + 今日待办） | 聚合查询 |
| 10:00 | 未付款订单提醒 | `orders where status='Unpaid'` |
| 21:00 | 收市报告（今日营收 + 订单数） | 聚合查询 |

每个 cron 任务遵循用户的 `notif_prefs` 偏好（已经存在的表）。

#### 6. Android 配置补丁
更新 `scripts/patch-android.mjs`：
- 自动复制 `android/app/google-services.json`（你已放好）
- 确保 `POST_NOTIFICATIONS` 权限（已有）
- 在 `build.gradle` 里强制保证 `firebase-messaging`（修复拼写）和 google-services plugin

#### 7. 保留本地通知作为备份
现有 `@capacitor/local-notifications` 不删，作为 FCM 失败时的 fallback。

---

### 测试流程
1. 你修拼写 + 生成 Service Account JSON
2. 我把代码全部写好
3. 你在 Android Studio 重新 build APK
4. 安装到手机 → 登录 → 后台运行 app
5. 用 Lovable 触发 `sendPushToUser` 测试 → 通知栏应该出现

### iOS 暂不做
代码会预留 platform 字段（'android'/'ios'），以后加 iOS 只需补 APNs 证书。
