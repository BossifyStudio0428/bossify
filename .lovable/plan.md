## 为什么 APK 图标没变

你改的 `src/assets/...` 只在网页/H5 里生效。APK 桌面上的 launcher icon 是 **Android 原生资源**，存在你本地 `C:\dev\bossify\android\app\src\main\res\` 下面这些文件夹里：

```text
mipmap-mdpi/ic_launcher.png
mipmap-hdpi/ic_launcher.png
mipmap-xhdpi/ic_launcher.png
mipmap-xxhdpi/ic_launcher.png
mipmap-xxxhdpi/ic_launcher.png
mipmap-anydpi-v26/ic_launcher.xml  (Adaptive Icon)
drawable*/splash.png  (启动画面)
```

每次 `npx cap sync` 都**不会**自动覆盖这些 native 图。

---

## 一次性解决方案：用 `@capacitor/assets` 自动生成

这是 Capacitor 官方工具，从一张高清原图自动生成所有尺寸 + Adaptive Icon + Splash。

### 步骤 (在你本地 `C:\dev\bossify` 跑)

1. 准备 3 张图，放到一个新文件夹 `assets/`（项目根目录，不是 `src/assets`）：
   - `assets/icon.png` — 至少 **1024×1024**，正方形，PNG
   - `assets/icon-foreground.png` — 1024×1024，**主图标内容居中，四周留 ~25% 透明边距**（Adaptive Icon 前景）
   - `assets/icon-background.png` — 1024×1024，纯色或简单背景（Adaptive Icon 背景）
   - 可选：`assets/splash.png` — 2732×2732，logo 居中

2. 安装并运行：
   ```powershell
   cd C:\dev\bossify
   npm install -D @capacitor/assets
   npx capacitor-assets generate --android
   npx cap sync android
   ```

3. 在 Android Studio：**Build → Clean Project → Rebuild Project → Build APK**

4. 卸载手机上旧的 Bossify，再装新 APK（Android 会缓存图标，覆盖安装有时不刷新）。

---

## 我会做的部分

我没法替你跑本地命令，但我可以：

1. 检查/告诉你你 Lovable 项目里现成可以用作图标的高清原图（看到有 `public/bossify-logo.png` 和 `public/assets/...`）。
2. 如果你 Lovable 项目里**没有**够大的图源，我把你现在这张 logo 升级一份 1024×1024 的版本放进 `public/app-icon.png`，你下次 `git pull` 拉到本地后直接当 `assets/icon.png` 用。

确认两件事我就能继续：

1. 你想我帮你**在 Lovable 项目里准备一张 1024×1024 的图标源文件**吗？（要的话告诉我用现有 logo 就行，还是要重新设计风格）
2. 你已经在本地装好 Node + Android Studio，能跑 `npx capacitor-assets generate` 吗？还是要我把命令写成一个 `.bat` 一键脚本给你？