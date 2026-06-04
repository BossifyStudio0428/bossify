## 你的流程（保持不变）

```
web 更新 → git pull → 本机 build → npx cap sync android → Android Studio 打新 APK/AAB → 上传 Play
```

Web 和 Android **完全分开**，不会自动同步，符合 Google Play 上架要求。

---

## 问题根源

截图里 `npx cap sync android` 失败：

```
Could not find the web assets directory: .\dist\client
```

不是 Android Studio 的问题，是 build 出来的网页文件**没有落在 `dist/client/` 里 + 没有 `index.html`**，所以 Capacitor 没东西可以复制进 Android 项目。Android Studio 当然就还是打到旧的 APK。

技术原因：现在的 Vite 配置（TanStack Start + Cloudflare）build 出来的 SPA 入口是分散在 `dist/client/assets/*` 和 `.output/public/` 里的，**Vite 本身不会生成 `dist/client/index.html`**。Capacitor 需要那个 `index.html` 才肯 sync。

---

## 解决方案

不动你的工作流，只修「build 完之后、`cap sync` 之前」这一步。

### 1. 加一个简单命令：`npm run android:prep`

它做两件事：
- `bun run build`（或 `npm run build`）
- 跑 `scripts/generate-spa-html.mjs`，确保 `dist/client/index.html` 存在并指向最新的 hashed JS / CSS

### 2. 修 `scripts/generate-spa-html.mjs` 让它更耐用

- 如果 `dist/client` 不存在 → 从 `.output/public/` 自动复制
- 找不到入口 chunk / CSS → 直接报清楚错误，不写一个坏的 HTML（避免你又打到一个白屏 APK）
- 检查通过后写 `dist/client/index.html`

### 3. 你以后的固定命令（4 行，不会错）

```bash
git pull
npm install
npm run android:prep
npx cap sync android
```

然后照常打开 Android Studio → Build → Generate Signed Bundle → 上传 Play。

Web 和 Android 还是分开，Google Play 审核没问题。

### 4. 更新 `ANDROID_BUILD.md` 和 `PLAY_CONSOLE_SETUP.md`

把那条「以后 web 改了怎么办」段落改成上面的 4 行命令，不再叫你用 PowerShell 脚本。

---

## 验证

跑完 `npm run android:prep` 后必须存在：

```
dist/client/index.html
dist/client/assets/*.js
dist/client/assets/*.css
```

然后 `npx cap sync android` 不再报错，并且：

```
android/app/src/main/assets/public/index.html
```

是新的（mtime 是刚才）。这时 Android Studio 打出来的 APK 才会是最新版。