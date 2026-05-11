
# 接入 Google Play Billing + 准备新 AAB

目标：让你下次上传到 Internal Testing 后，Play Console 能成功创建订阅 `bossify_pro`，并且 app 内会显示真·本地货币价格 + 真·能购买。

---

## 改动清单

### 1. 安装插件
- `cordova-plugin-purchase`（CC.Fovea，最成熟的 Capacitor 兼容 Google Play Billing 插件，免费开源）

### 2. AndroidManifest.xml
- 加 `<uses-permission android:name="com.android.vending.BILLING" />`
- 这是 Play Console 接受订阅产品的硬性条件，**没有这个权限上传几次都没用**

### 3. 改写 `src/lib/billing.ts`
保留现有 API 形状（`purchasePlan` / `restorePurchases` / `queryProductDetails`），把 stub 替换成真实插件调用：
- `queryProductDetails()` → 从 Play Store 拉 `bossify_pro` 的两个 base plan，返回每个用户**本地货币的格式化价格**（RM 49 / $11.99 / ₹999 / Rp 165.000…）
- `tryNativePurchase()` → 调 `store.order()` 触发 Google Play 的购买弹窗
- `tryNativeRestore()` → 调 `store.restorePurchases()` 拉历史订阅
- 处理用户取消（`user_cancelled`）、网络错误、产品未配置等错误码
- 监听 `approved` 事件 → 调 `transaction.finish()` 结清订单

### 4. 在 app 启动时初始化插件
- 在 `AppShell.tsx` 里 app 第一次挂载时调 `store.register()` + `store.initialize()`
- 注册产品：`{ id: 'bossify_pro', type: 'PAID_SUBSCRIPTION' }` 带两个 offer (`monthly` / `annual`)
- 这样 Plans 页面打开时 `queryProductDetails()` 立刻能拿到价格

### 5. Plans 页价格自动跟随
现有 `storePrices` state 已经做好了，插件接好后会自动从 Play Store 拉到本地货币显示。无需改 UI。

### 6. 写一份 `PLAY_CONSOLE_SETUP.md`
逐步说明（带截图位置提示）：
1. 在 Android Studio build signed AAB
2. 上传到 Internal testing → Add release → Review → **Rollout to Internal testing**（必须 rollout，不只是 save）
3. 等 Google review（通常几分钟）
4. Setup → Internal testing → Testers → 加 license tester 邮箱
5. Monetize → Subscriptions → Create subscription → ID 填 `bossify_pro`
6. Add base plan #1：ID `monthly`，1 个月，auto-renewing，price RM 49
7. Add base plan #2：ID `annual`，1 年，auto-renewing，price RM 399
8. 两个 base plan 都 **Activate**
9. 用 license tester 账号在测试设备上打开 app 即可看到价格 + 测试购买（不会真扣钱）

### 7. 翻译补全
加几个新错误信息的 EN/BM/ZH 翻译：
- "Connecting to Google Play…"
- "Subscription not yet approved by Google Play"
- "Purchase pending verification"

---

## 文件改动

```text
package.json              + cordova-plugin-purchase
android/app/src/main/AndroidManifest.xml   + BILLING permission
src/lib/billing.ts        重写 stub → 真实 cordova-plugin-purchase 调用
src/components/AppShell.tsx   + store.initialize() on mount
src/contexts/I18nContext.tsx  + 3 个新翻译 key
PLAY_CONSOLE_SETUP.md     新文件，详细步骤
```

---

## 你需要做的（代码搞定后）

1. Pull 代码 → `bun install` → `bun run build` → `npx cap sync android`
2. Android Studio 打开 `android/` → Build → Generate Signed Bundle (AAB)
3. 上传到 Play Console → Internal testing → **Rollout**（这一步昨天可能漏了）
4. 等 review 完（看到绿色 ✓）
5. 按 `PLAY_CONSOLE_SETUP.md` 第 5-9 步建订阅产品
6. 用 license tester 账号装 app → 打开 Plans 页应该能看到本地货币价格 + 能点 Upgrade 触发 Google 购买弹窗

---

## 注意事项

- 第一次上传 AAB 后 Play Console 可能要 **几小时到 24 小时** 才允许你建订阅产品（Google 在后台索引你的 BILLING 权限）。**昨天叫你上传过的提示，很可能就是因为 AAB 没声明 BILLING 权限**——这次加上之后即可解决。
- License tester 必须用 Gmail 账号，且要在 Play Store **登录这个账号** 才会看到测试价格。
- 所有 base plan 必须 **Activate**，否则 `queryProductDetails()` 拉不到。
