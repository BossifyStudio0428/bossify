我会负责把这个构建问题修好，重点是切断客户端构建里错误引用 `client.server` 的导入链。

## 计划

1. **移除当前错误导入链**
   - 不再让 `/api/public/send-push` 路由在客户端路由树中间接导入 `src/integrations/supabase/client.server.ts` 或 `*.server.ts` 文件。
   - 不手动编辑 `src/routeTree.gen.ts`，让路由插件重新生成。

2. **重构推送发送端点**
   - 将推送 API 的服务端逻辑改成不会被客户端 import graph 扫到的实现方式。
   - 保留现有 `/api/public/send-push` 调用路径，避免破坏 `sendPushToSelf()` 和定时推送配置。

3. **整理服务端 helper**
   - 删除或停止使用当前 `sendPushHandler.ts` 里导致构建失败的 `createServerOnlyFn + dynamic import(client.server)` 组合。
   - 避免再从客户端可达模块导入 `.server` 文件。

4. **验证结果**
   - 检查代码里不再存在从客户端路由链可达的 `client.server` / `fcm.server` 导入。
   - 用构建/类型检查信号确认错误消失后再说完成。

## 技术细节

当前问题不是你操作错了，是我之前把服务端推送逻辑放进了一个会被 TanStack 路由树导入的链路里。即使逻辑“理论上只在 server handler 里跑”，构建器还是会扫描完整导入图，所以看到 `client.server` 就直接失败。

这次修复会把这个边界彻底拆干净，而不是继续在同一条导入链上打补丁。

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>