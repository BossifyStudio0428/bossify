## 目标
一次性把 Android APK 里的两个问题修掉，同时保持 Web 现有功能继续正常：
- Admin Panel：Web 有数据，但 Android 统计全部 0。
- Stock PDF：Web 能下载，但 Android 点了没有反应。

## 我找到的关键问题
- Android APK 是离线打包的 WebView，不等于 Web 站点；它不能可靠使用 Web 的下载方式，也不能依赖未打进 APK 的后端调用变化。
- Admin 当前 Android 分支先尝试用浏览器端数据库读取全部 profiles / orders；这个在权限下很可能只读到当前用户或空结果，所以统计会变 0。
- 项目连接的实际业务数据表在外部业务后端里；Lovable Cloud 当前项目里只看到 `profiles/orders/subscriptions`，没有 `stock_takes/stock_take_items/admin_users_view`，所以 Android 不能靠当前项目数据库去推断 admin 总览。
- PDF 当前原生保存逻辑使用 `Filesystem.writeFile` 返回的 URI 直接交给 FileOpener/Share；在部分 Android/Capacitor 版本里这个 URI 不一定能被外部 App 正确打开或分享，需要改成更稳的“真实 file:// 路径 + 原生打开 + 原生分享 + 明确错误提示”。

## 实施计划
1. **重做 Android Admin 数据加载路径**
   - 移除 Android 端“直接用浏览器数据库读取所有用户/订单”的 fallback。
   - Android 和 Web 都统一走安全的 admin 后端逻辑：
     - Web 继续用 server function。
     - Android 用 HTTPS `/api/public/admin`，带当前登录 token。
   - Admin API 返回 `users/orders` 后再计算统计，避免 Android 因 RLS/权限读不到全表而显示 0。

2. **让 Admin API 更可靠、更容易定位问题**
   - Admin API 使用同一套 server-side admin helper 读取真实业务数据。
   - 给 Android 请求失败时显示明确 toast，例如：未登录、不是管理员、API 未发布、服务端缺少 secret、读取失败。
   - 不再静默把失败当成空数组，这样不会再出现“看起来正常但全部 0”。

3. **重做 Android PDF 保存/打开流程**
   - 在 `savePdf` 里为 Android 单独生成 base64 PDF。
   - 写入 app cache / documents 后，优先解析并使用稳定的 `file://` 路径。
   - 先尝试 `FileOpener.open(... openWithDefault: true)`，失败再尝试 Android Share sheet。
   - 如果手机没有 PDF viewer 或系统拒绝文件 URI，会在 UI 里弹出具体错误，不再“按了没反应”。

4. **给 Stock PDF 按钮完整反馈**
   - 保留导出中的 loading/disabled 状态。
   - 成功时 toast 提示“PDF ready / opened”。
   - 失败时 toast 显示具体错误，并让按钮恢复可按。

5. **更新 Android build 说明，避免继续安装旧 APK**
   - 明确必须重新打包 APK/AAB，因为 Android 是离线包。
   - Android admin API 依赖已发布站点，所以修复后也要 Publish 一次，再重新 `android:prep → cap sync → android:patch → Android Studio build`。

## 验证方式
- 代码层面检查：确认 Android admin 不再走直接前端全表查询，PDF 不再只依赖 Web 下载。
- 后端层面检查：查询/确认 admin helper 读取的数据源和 API 路径。
- 用户侧最终验证：安装新 APK 后打开 Admin 应该显示与 Web 一样的数据；Stock Report 点 Export PDF 应该打开 PDF 或弹出系统分享面板。