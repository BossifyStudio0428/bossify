## 现状

- **前端 client.ts** ✅ 已指向外部 Supabase (`knouahqwazerjiyiqgmh`) — auth、登录、所有读写已经走外部
- **server functions** ❌ 仍连 Lovable Cloud (用 `process.env.SUPABASE_URL` = Lovable Cloud)
- **auth-middleware** ❌ 用 Lovable Cloud 的 JWKS 验证 token,而 token 实际来自外部 — 现在已经坏的
- **edge functions** (send-push, stripe-webhook, activate-stripe-session, create-stripe-checkout) ❌ 部署在 Lovable Cloud
- **数据库 migrations / cron / triggers** ❌ 在 Lovable Cloud,触发的 webhook URL 写死指向 Lovable Cloud

## 目标

所有运行时代码 100% 走外部 Supabase (`knouahqwazerjiyiqgmh`)。Lovable Cloud 只保留为残留(无法删除)。

## 改动

### 1. 创建外部 Supabase 服务端客户端
新文件 `src/integrations/supabase/external-admin.server.ts`:
- 用 `APP_SUPABASE_SERVICE_ROLE_KEY` (已存在) + 硬编码的外部 URL
- 导出 `externalSupabaseAdmin`

### 2. 创建外部 auth middleware
新文件 `src/integrations/supabase/external-auth-middleware.ts`:
- 用外部 URL + 外部 anon key 验证 bearer token
- 导出 `requireExternalSupabaseAuth`

### 3. 迁移所有 server functions
把以下文件里的 `supabaseAdmin` → `externalSupabaseAdmin`,`requireSupabaseAuth` → `requireExternalSupabaseAuth`:
- `src/lib/admin.functions.ts`
- `src/lib/platformConnect.functions.ts`
- `src/lib/public-order.server.ts` (合并它现有的外部 client)
- `src/routes/api/public/webhooks/tiktok.ts`
- `src/routes/api/public/oauth/tiktok/callback.ts`

### 4. Edge Functions / Stripe
Edge functions 部署在 Lovable Cloud 无法自动迁移到外部 Supabase。两个选择:
- **A**: 把 Stripe 流程改成 TanStack server routes (`src/routes/api/public/stripe/*`),完全脱离 edge functions
- **B**: 暂时保留 edge functions 在 Lovable Cloud(它们用 service role 调用外部 DB)

推荐 A — 真正"什么都不在 Lovable Cloud"。Push notification 的 cron 也要改:把 `trigger_push_kind` / `send_followup_reminders` 数据库函数的 webhook URL 从 `https://utqlrdbhvnugqvemjegi.supabase.co/...` 改成外部项目的 URL 或 app 的 `/api/public/cron/*` 路由。这需要在**外部 Supabase** 上跑 migration。

### 5. 外部 Supabase 上的 schema
所有 migrations 历史只跑在 Lovable Cloud。外部 Supabase 的 schema 已存在但版本未知。需要确认外部已有相同 schema,否则需要手动同步。

## 需要你确认的两个关键决定

1. **Edge functions 怎么办?** A (改成 server routes,彻底脱离) 还是 B (暂留)?
2. **外部 Supabase 上有没有完整 schema?** Migrations 历史在 Lovable Cloud,你需要确认外部已有这些表/函数/triggers,或者授权我把所有 migration SQL 在外部 Supabase 上重跑一遍。

确认后我开始改。
