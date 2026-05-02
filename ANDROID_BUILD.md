# Bossify → Android (Play Console) 操作手册

这个 app 用 **Capacitor** 打包成真正的 Android app（**离线 SPA 模式**），
package id 是 `com.zhstudio.bossify`。
Play Console 不允许「只是加载外部网址」的 webview 壳，所以我们把网页 build
进 `dist/` 然后打包进 APK/AAB。

**意味着：以后 Lovable 改了东西 → 必须重新 build + 上传新版本到 Play。**

---

## 一次性安装（电脑上准备）

- Node.js 20+
- Bun (`npm i -g bun`)
- Android Studio (含 SDK 34+)
- Java JDK 21（Android Studio 自带）
- Git

---

## 第一次设置（每台电脑只做一次）

```bash
# 1. clone
git clone https://github.com/<你的账号>/<repo名>.git bossify
cd bossify

# 2. 装依赖
bun install

# 3. Build 真正的网页进 dist/
bun run build

# 4. 加 Android 平台（第一次）
npx cap add android

# 5. 同步 dist/client/ + 配置进 Android 项目
npx cap sync android

# 6. 打开 Android Studio
npx cap open android
```

---

## 在 Android Studio 生成签名 AAB

1. 菜单 **Build → Generate Signed App Bundle / APK**
2. 选 **Android App Bundle** → Next
3. **Create new keystore**（第一次）：
   - 路径：随便，但 **务必备份 .jks 文件 + 密码**（丢了永远无法更新 app）
   - Alias: `bossify`
   - Validity: 25 年
4. 选 **release** → Finish
5. 产物路径：`android/app/release/app-release.aab`

---

## 上传 Play Console

1. https://play.google.com/console（首次注册 $25 USD）
2. **Create app** → 填资料
3. **Production → Create new release** → 上传 `app-release.aab`
4. 完成 **App content**（隐私政策 / 内容分级 / 目标受众）
5. **Store listing**（图标、截图、描述）
6. **Send for review**（首次约 1–7 天）

---

## 以后 Lovable 改了东西

**每次改动都要 git pull → 重新 build → 重新上传 Play**（因为是离线 SPA，不是远程 WebView）：

```bash
cd bossify
git pull
bun install
bun run build
npx cap sync android
npm run android:patch
```

确认 `capacitor.config.ts` 里必须是：

```ts
webDir: 'dist/client'
```

不要加 `server.url`，否则就会变成远程 WebView，不适合上传 Google Play。

然后在 Android Studio：
1. 打开 `android/app/build.gradle`
2. `versionCode` +1，`versionName` 改成新版本（例如 `1.0.1`）
3. **Build → Generate Signed App Bundle**（用同一个 keystore！）
4. 上传新 `.aab` 到 Play Console → Production → Create new release

---

## ⚠️ 关键提醒

| 事项 | 说明 |
|------|------|
| Keystore (`.jks`) | 备份云盘 + U盘，丢了 = app 永远无法更新 |
| `appId` | `com.zhstudio.bossify` 上架后**永远不能改** |
| 隐私政策 URL | Play 必填 |
| Lovable Cloud (后端) | 继续在云端跑，无需改动 |
| 离线访问 | 在线壳模式不支持，需要可改成离线 SPA 模式 |

---

## 🔒 锁定竖屏 (Portrait Only) + 防启动闪退

不要手动乱改 `AndroidManifest.xml`。每次 `npx cap sync android` 之后运行：

```bash
npm run android:patch
```

它会自动给 `MainActivity` 加竖屏，并把启动 Splash 主题改成旧机型兼容写法，避免部分 Android 8/旧机型出现
`Only fullscreen opaque activities can request orientation` 后一打开就闪退。

最终 `MainActivity` 会长这样：

```xml
<activity
    android:screenOrientation="portrait"
    android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize"
    android:name=".MainActivity"
    android:label="@string/title_activity_main"
    android:theme="@style/AppTheme.NoActionBarLaunch"
    android:launchMode="singleTask"
    android:exported="true">
    ...
</activity>
```

这样 app 永远竖屏，不会跟着手机旋转，同时不会因为启动主题透明/Android 8 兼容问题直接崩。每次重新生成 Android 项目后都要再跑一次 `npm run android:patch`。