# Bossify → Android (Play Console) 操作手册

这个 app 用 **Capacitor** 把 Bossify 网站包成 Android app。
采用「在线壳」模式 — app 加载 `https://bossify-malaysia.lovable.app`，
所以以后在 Lovable 改动 → 用户打开 app 就看到新版本，**不用重新上传 Play**。

只有以下情况才需要重新打包 + 上传 Play：
- 改 app 图标 / 名称 / 启动画面
- 改 `capacitor.config.ts`
- 升级 Capacitor 或加新原生插件
- Play 要求更新 target SDK

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

# 3. 装 Capacitor
bun add @capacitor/core @capacitor/android
bun add -D @capacitor/cli

# 4. 准备一个空 dist/（在线壳模式不需要真正的 web build）
mkdir -p dist && echo "<!doctype html><title>Bossify</title>" > dist/index.html

# 5. 加 Android 平台
npx cap add android

# 6. 同步配置进 Android 项目
npx cap sync android

# 7. 打开 Android Studio
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

**内容/功能更新（99% 的情况）：什么都不用做。**
用户打开 app 自动看到最新版本（在线壳）。

**需要重新打包的情况：**

```bash
cd bossify
git pull
bun install
npx cap sync android
```

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
| `appId` | `com.bossify.app` 上架后**永远不能改** |
| 隐私政策 URL | Play 必填 |
| Lovable Cloud (后端) | 继续在云端跑，无需改动 |
| 离线访问 | 在线壳模式不支持，需要可改成离线 SPA 模式 |