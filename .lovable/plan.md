我已经查到这次截图里的真正错误，不是 Firebase token 了，而是数据库 trigger 把 `device_tokens` 也当成“登录设备限制”来拦截：

- 日志真实错误：`device_limit_reached: plan allows 1 device(s); already registered 1`
- 现在用户已经有 1 台登录设备，网站 push token 要保存进 `device_tokens` 时被旧 trigger 拦住，所以前端只看到 `An unexpected error occurred.`
- 正确逻辑应该是：`device_sessions` 管登录设备限制；`device_tokens` 只管通知 token，不应该限制数量，否则一个手机浏览器/FCM token 更新就会失败。

实施计划：

1. 修数据库规则
   - 移除 `device_tokens` 上的 `trg_enforce_device_limit` trigger。
   - 保留 `device_sessions` 的设备限制逻辑，让登录设备限制仍然有效。
   - 确认通知 token 不再被 plan device limit 拦住。

2. 修 `send-push` 的错误处理
   - `register_device` 保存失败时返回真实错误，不再统一变成 `An unexpected error occurred.`。
   - 如果以后真的遇到 device limit，会返回可读信息，而不是误导用户。

3. 修通知设置页流程
   - “Send Test Push” 必须先检查 `registerCurrentDevice()` 结果。
   - 如果注册失败，停止发送并显示真实原因；不能继续 send push。
   - 网站模式如果当前浏览器不能稳定支持 web push，会显示清楚原因，不再一直尝试失败。

4. 验证
   - 部署 `send-push`。
   - 用日志确认没有新的 `device_limit_reached`。
   - 确认同一登录设备下，web push token 可以保存，测试推送不会再出现截图里的错误。

这次修复重点：登录设备限制只影响 `/devices` 和登录流程；通知 token 不再被设备限制误杀。