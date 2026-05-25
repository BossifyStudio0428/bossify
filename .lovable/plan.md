
## 问题诊断

客户在 `/order/<code>` 表单点 Submit 时显示 `Failed to save order. Failed to fetch`。

我直接打了一下 production 的 server function（`/_serverFn/<submitPublicOrder id>`），返回：

```
HTTP/2 500
content-type: application/json
x-tss-serialized: true

{"t":25,"i":0,"s":{"message":{"t":1,"s":"Seroval Error (step: 3)"}},"c":"$TSR/Error"}
```

意思是：
1. `submitPublicOrder` 的 handler 在服务器抛出了一个异常（不是正常 `return { ok:false, ... }`）。
2. TanStack 在把这个 Error 序列化回浏览器时也失败了（Seroval 解不开里面某个对象，比如 Supabase 客户端实例 / 循环引用 / 函数）。
3. 浏览器拿到一个 corrupt 的 500 响应，`fetch()` 直接 reject → toast 显示 `Failed to fetch`。

最可能的根因（按概率排序）：

1. `getPublicOrderClient()` 在 Worker 里抛错 —— 比如 `APP_SUPABASE_SERVICE_ROLE_KEY` 在生产 runtime 里读不到 / 值不对，或外部 Supabase（`knouahqwazerjiyiqgmh`）不可达。这个 throw 发生在 `createClient(...)` 调用栈里，错误对象带着 Supabase 的内部状态，seroval 序列化失败。
2. `inputValidator(SubmitSchema.parse)` 抛 ZodError —— ZodError 带 `issues` 数组，理论上能序列化，但 seroval 有时对它会报 step 3 错误。
3. handler 后面 `sb.from("orders").insert(...)` / `sb.from("customers")...` / `fetch(send-push)` 之中某一步抛了带循环引用的对象。

## 修复计划

### 1. 把 handler 包成"永远只 return 普通对象"，绝不让异常逃出去

修改 `src/lib/public-order.functions.ts` 里的 `submitPublicOrder` 和 `getPublicOrderForm`：

- 整个 handler 主体用 `try { ... } catch (e) { return { ok:false, reason:"insert_failed", error: String(e?.message ?? e) } }` 包起来。
- 每个 Supabase 调用（profiles / inventory / orders / customers）的 `error` 都明确返回字符串 `error.message`，不要把整个 `error` 对象返回。
- `inputValidator` 也包一层 try/catch，把 ZodError 转成 `{ ok:false, reason:"invalid_input", error: issues.map(...).join(", ") }` 而不是 throw。

这样无论后端发生什么，浏览器都会拿到合法 JSON，不会再出现 `Failed to fetch`，客户至少能看到真实错误信息（比如 "Unknown product: Cendol" 或 "Missing APP_SUPABASE_SERVICE_ROLE_KEY"）。

### 2. 加 server-side 日志

在 catch 里 `console.error("[submitPublicOrder]", e)`，配合 `supabase--edge_function_logs` / Cloudflare Worker logs 才好查到底是哪一步炸。

### 3. 拿到真实错误后再修底层

包好之后我重新 POST 一次 `/_serverFn/...`，就能从 JSON `error` 字段直接读到根因，然后对症修：
- 如果是 `Missing APP_SUPABASE_SERVICE_ROLE_KEY` → 检查 / 重新设置 secret。
- 如果是 `Unknown product: Cendol` → 客户选的产品名字在 `inventory.name` 找不到（大小写 / trim 不一致），调整 `lookupPrice` 的匹配规则。
- 如果是 orders insert RLS / column 错误 → 修 schema / payload。
- 如果是外部 Supabase URL 错 → 改 `APP_SUPABASE_URL` 常量。

### 4. （可选）顺手把客户端 alert 改成显示 `error` 字段

`src/routes/order.$code.tsx` 第 217 行已经在做 `(res as any).error || (res as any).reason`，不用动。修完后台后客户会自动看到清晰错误。

## 不动什么

- 不动 webPush / Firebase 配置 —— 那块跟这个表单无关，customer 也没登录所以不会注册 SW。
- 不动 `/order/$code.tsx` 的 UI 逻辑。
- 不动 RLS policies（先确认是哪一步出错再说）。

## 技术细节

`submitPublicOrder` 当前的 return 类型是 union：
```ts
{ ok:true, code, business_name } | { ok:false, reason:"not_found"|"disabled"|"insert_failed", error?:string }
```

会新增一个 reason `"server_error"`（catch-all）和 `"invalid_input"`（zod 失败），保持 union 形态不变，前端逻辑无需改动。
