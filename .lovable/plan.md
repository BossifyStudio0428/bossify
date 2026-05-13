问题原因已经定位：不是 admin 权限问题，也不是设备 token 没注册。

`send-push` 后端函数在读取 `FCM_SERVICE_ACCOUNT_JSON` 时执行 `JSON.parse(...)`，但当前这个 secret 的值是普通字符串 `json`，不是 Firebase service account 的完整 JSON，所以函数报错：

```text
Unexpected token 'j', "json" is not valid JSON
```

我会按这个方案修：

1. **修正错误提示**
   - 在 `supabase/functions/send-push/index.ts` 里加强 `FCM_SERVICE_ACCOUNT_JSON` 解析逻辑。
   - 如果 secret 不是合法 JSON，返回清楚的错误，例如 `FCM_SERVICE_ACCOUNT_JSON is not valid service account JSON`，避免以后只看到很迷惑的 `Unexpected token 'j'`。

2. **保留现有推送流程**
   - 不改前端按钮、不改 admin 判断、不改设备注册流程。
   - 现有 `Send Test Push (Admin)` 仍然会调用 `registerPushForUser` 后再调用 `send-push`。

3. **重新部署并测试后端函数**
   - 部署 `send-push`。
   - 调用测试接口确认错误变成可诊断的配置错误，或在 secret 正确后确认可以发送。

4. **你需要做的一件事**
   - 把 Lovable Cloud 里的 `FCM_SERVICE_ACCOUNT_JSON` secret 更新成 Firebase service account 的完整 JSON 内容，不是填 `json` 这个字。
   - 必须包含这些字段：`project_id`, `private_key_id`, `private_key`, `client_email`, `token_uri`。

Do I know what the issue is? 是的：当前推送失败的直接原因是 `FCM_SERVICE_ACCOUNT_JSON` secret 内容填错了，值现在是 `json`，导致后端函数无法解析 Firebase 凭证。

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>