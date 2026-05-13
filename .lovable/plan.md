我查到问题的根因是 Android 资源目录里同时存在同名的 `.png` 和 `.webp` launcher 图标（例如 `ic_launcher.png` + `ic_launcher.webp`、`ic_launcher_round.png` + `ic_launcher_round.webp`），Android 会把它们视为同一个资源名，所以 Build 报 `Duplicate resources`，APK 也可能继续用旧/默认图标。

计划：

1. 更新 `scripts/patch-android.mjs`
   - 新增一个清理函数，扫描 `android/app/src/main/res/mipmap-*` 和相关资源目录。
   - 当同一个目录里同名资源同时有 `.png` / `.webp` 时，自动删除重复的一种格式，保留一套 launcher icon。
   - 重点清理 `ic_launcher`、`ic_launcher_round`、`ic_launcher_foreground`、`ic_launcher_background` 这类图标资源，避免误删无关图片。

2. 更新 `scripts/reset-android.ps1`
   - 在生成 Android 项目后，自动把 `public/app-icons/` 的源图标复制到根目录 `assets/`。
   - 如果本地已安装或可临时运行 `@capacitor/assets`，执行 `npx capacitor-assets generate --android` 生成正确的 Android 图标。
   - 生成后继续运行 `npx cap sync android` 和 `android:patch`，确保每次 fresh reset 都使用 Bossify 图标。

3. 更新文档说明
   - 在 `ANDROID_BUILD.md` 或 `public/app-icons/README.txt` 里写清楚：
     - 不要在 Android Studio 里手动混合生成 png/webp 图标。
     - 运行 fresh reset / patch 后再 Build APK。
     - 安装新 APK 前先卸载旧 app，因为 Android launcher 会缓存旧图标。

4. 验证方式
   - 检查脚本逻辑不会改到前端业务代码。
   - 确认 duplicate resource 的触发条件被覆盖：同目录同名不同扩展的 launcher icon 会被自动清理。