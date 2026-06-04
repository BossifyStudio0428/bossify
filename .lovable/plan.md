我会把这次 Android 空白页按“离线 APK 启动失败”来修，不再只修 `dist/client` 有没有生成。

计划：

1. 修 `scripts/generate-spa-html.mjs`
   - 在生成的 `dist/client/index.html` 里加入 TanStack Start 客户端需要的最小启动数据。
   - 现在的离线 HTML 只有 JS/CSS，但没有服务端注入的 `window.$_TSR` bootstrap；Android 里会导致客户端启动失败或挂载后空白。
   - 同时把页面根路径强制兼容 Capacitor 的离线路径，避免 WebView 打开 `/index.html` 时路由不匹配。

2. 加 Android 空白保护
   - 保留 Bossify 预加载画面，直到 React 真正渲染出页面后才隐藏。
   - 如果 JS 启动失败，不会再只剩一整片浅色背景，会显示 Bossify 和重新加载提示。

3. 修文档/命令一致性
   - 保持你要的流程不变：Web 更新后，你手动在 Android Studio 打包新 APK/AAB。
   - 命令仍然是：

```text
git pull
npm install
npm run android:prep
npx cap sync android
npm run android:patch
```

4. 验证重点
   - 验证生成的 `dist/client/index.html` 有：CSS、entry JS、TanStack bootstrap、Bossify fallback。
   - 确认不会再依赖 `dist/server`。
   - 确认 Android Studio 打包时复制进去的是新 `dist/client/index.html`。