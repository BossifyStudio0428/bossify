# Bossify — Google Play Console Setup

完整步骤：从 build AAB 到能在 Play Console 创建订阅 → 测试购买。

---

## 1. 在本机 build AAB

```bash
npm run android:clean-apk
```

这个脚本会清掉旧 web bundle、Android 旧 assets 和 Gradle cache，再重新 build + sync + patch，避免 Android Studio 继续打到旧画面。

然后用 Android Studio 打开 `android/` 文件夹：

1. **Build → Generate Signed Bundle / APK** → 选 **Android App Bundle**
2. 选你已有的 keystore（如果是第一次，create new）
3. Variant 选 **release** → Finish
4. AAB 文件位置：`android/app/release/app-release.aab`

---

## 2. 上传到 Play Console（关键，昨天卡这里）

1. Play Console → 选 Bossify app → 左边栏 **Test and release → Testing → Internal testing**
2. **Create new release** → 上传刚才的 `app-release.aab`
3. 写 release notes（随便写，例如 "Initial billing setup"）
4. **Save** → **Review release** → **🚀 Start rollout to Internal testing**
5. ⚠️ **必须按 Start rollout，不只是 Save Draft！** 否则 Google 不会处理 AAB，订阅产品页会一直叫你上传。
6. 等几分钟到 1 小时，看到 release 状态变 **Available to testers (绿色)** 才算完成。

---

## 3. 加 License Tester（可以测试不扣钱）

1. Play Console → 左边栏底部 **Setup → License testing**
2. 加你的 Gmail 账号
3. License response 选 **RESPOND_NORMALLY**
4. Save

然后到 **Internal testing → Testers → Create email list**，把同一个 Gmail 加进去。

📱 测试设备上要用**这个 Gmail 登录 Play Store**，不然不会看到测试价。

---

## 4. 创建订阅产品

1. Play Console → 左边栏 **Monetize → Products → Subscriptions**
2. 点 **Create subscription**
3. **Product ID**: `bossify_pro` （必须一字不差，代码里写死的）
4. **Name**: `Bossify Pro`
5. **Description**: `Unlock unlimited orders, full reports, PDF export and bulk reminders.`
6. **Save**

### Base Plan #1 — Monthly

1. 在 `bossify_pro` 详情页，**Base plans → Add base plan**
2. **Base plan ID**: `monthly`
3. **Type**: Auto-renewing
4. **Billing period**: 1 month
5. **Grace period**: 7 days（推荐）
6. **Account hold**: 30 days（推荐）
7. **Price**: RM 49.00 → Google 会自动换算成各国货币（你可以手动调整）
8. **Activate**

### Base Plan #2 — Annual

1. **Add base plan**
2. **Base plan ID**: `annual`
3. **Type**: Auto-renewing
4. **Billing period**: 1 year
5. **Price**: RM 399.00
6. **Activate**

✅ 两个 base plan 状态必须都是 **Active**，不然 app 拉不到价格。

---

## 5. 测试购买流程

1. 用 license tester Gmail 登录的测试设备 → 装这个 AAB（从 Internal testing 链接装，不要直接 install APK，必须从 Play Store 装才会触发计费）
2. 打开 app → Profile → Choose Plan
3. 应该看到本地货币的价格（RM 49 / RM 399 或换算后的 USD/IDR/INR/PHP）
4. 点 **Upgrade to Pro** → 弹出 Google 购买框 → 应该显示 "Subscribe (test)" 或类似字样
5. 完成购买 → 不会真扣钱
6. App 自动激活 Pro

---

## 常见问题

**Q: Play Console 还是叫我上传 AAB？**
A: 检查这几点：
- AAB 真的 rollout 了（不只 save）？看 Internal testing → Releases，状态要 Available
- AAB 里有 BILLING 权限？解压 AAB → AndroidManifest 应该有 `<uses-permission android:name="com.android.vending.BILLING" />`。`bun run android:patch` 会自动加。
- 等够时间了？第一次上传后 Google 要 ~1-24 小时索引完才能创建订阅。

**Q: app 里看到的还是 "RM 49 / RM 399"，没换算成本地货币？**
A:
- 必须用 license tester 账号
- 必须从 Play Store 装（Internal testing 链接）而不是 sideload
- 两个 base plan 都 Active
- 等订阅产品页面显示 "Active" 状态后再打开 app

**Q: 点 Upgrade 报 "item_unavailable"？**
A: 订阅产品还没被 Google 批准。等 Active 状态出来再试。

---

## 代码里的 ID（已写死，不要改）

```ts
SUBSCRIPTION_ID = "bossify_pro"
BASE_PLAN_IDS.monthly = "monthly"
BASE_PLAN_IDS.annual  = "annual"
```

如果你在 Play Console 用了别的 ID，要回 `src/lib/billing.ts` 改。
