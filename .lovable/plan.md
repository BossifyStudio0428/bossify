我已经定位到不是单一按钮问题，而是三条通知链路都不稳。

Do I know what the issue is? Yes — 目前证据显示：
- 你的截图里 Android 走到了 `web push` 分支，所以当前安装/打开的版本没有被识别成 native push，才会出现 `Could not enable web push`。
- 数据库里只有 1 个 Android token，而且最后更新时间是 5月22日，说明现在这台设备没有成功重新注册 token。
- 每日提醒的 cron job 表面显示成功，但最近没有新的 HTTP push 回应记录，表示定时任务没有真正送到 push function。
- 晚上通知默认值目前是关的，跟页面显示“每天晚上通知”不一致。
- 新订单通知只在部分入口触发；外部/平台订单路径没有统一保证 push。

Plan:
1. 修复设备注册
   - 改 `registerPushForUser`，不要因为旧的全局 `tokenRegistered` 就跳过重新注册。
   - 每次登录、打开 Notification Settings、Send Test Push 前，都强制重新拿当前 Android FCM token 并 upsert 到 `device_tokens`。
   - Android native 失败时显示真正原因，不再误报 `Could not enable web push`。
   - Web push 保留，但只在真正浏览器使用，并修正 service worker scope / 错误回传。

2. 修复 Notification Settings 按钮
   - `Allow notifications` 和 `Send Test Push` 都先注册当前设备，再发送测试。
   - 成功授权后立即安排本机 9:00 AM / 9:00 PM / unpaid reminder local notifications。
   - 把 `Send Test Push (Admin)` 文案改成普通测试按钮，避免误导。

3. 修复每日 9点早上和晚上通知
   - 把 evening 默认通知改为开启。
   - 修复 native local schedule：权限、取消旧 schedule、重新安排 9:00 AM 和 9:00 PM。
   - 修复 Lovable Cloud 定时任务：重新创建/更新 daily push jobs，确保 9:00 AM Malaysia 和 9:00 PM Malaysia 会调用正确 push endpoint。
   - 增加可查的 job 执行记录，之后不会再只看到 cron “成功”但不知道有没有真的发送。

4. 修复新订单自动通知
   - 新增统一的 order-push helper。
   - 手动新增订单、public order form、TikTok/platform webhook 创建订单后，都调用同一套 push 逻辑。
   - 避免重复通知，同时确保不是只在当前打开 app 时才有。

5. 验证
   - 检查 `device_tokens` 是否更新为当前设备。
   - 测试 `send-push` 真实返回 sent 数量。
   - 检查 push function logs 和 scheduled job responses。
   - Android 需要重新 build / 安装新版；如果 `google-services.json` 不在 Android 项目里，我会把检查写进 build patch，让它明确报错而不是静默失败。

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>