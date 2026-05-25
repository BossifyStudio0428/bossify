## 问题

按 Upgrade 后 `POST /api/public/stripe/checkout` 在服务端直接返回 status `0`（worker 没回应），所以浏览器拿不到 `url`，Stripe Checkout 自然弹不出来。

不是你改 webhook secret 的问题 —— webhook secret 只影响 `/stripe/webhook`，跟开 checkout 无关。

真正原因在 `src/lib/stripe.server.ts`：

```ts
return new Stripe(secret, { apiVersion: "..." });
```

Stripe Node SDK 默认使用 Node 的 `http` 模块发请求。Lovable 的服务端跑在 Cloudflare Worker（workerd）上，`http` 模块只是个空壳，调用就会抛错并让 worker 崩掉 → 客户端看到的就是没回应、什么都没发生。

之前的 Lovable Cloud edge function（Deno 跑的）没事，是因为 Deno 自带 fetch 当 transport；现在搬到 TanStack server route（Worker 跑）就踩坑了。

## 修复

只改一处：`src/lib/stripe.server.ts` 的 `getStripe()`，告诉 Stripe SDK 用 fetch 而不是 Node http，并在 Web Crypto 上做 webhook 验签：

```ts
return new Stripe(secret, {
  apiVersion: "2024-11-20.acacia" as any,
  httpClient: Stripe.createFetchHttpClient(),
});
```

并把 webhook 路由里的 `stripe.webhooks.constructEventAsync(...)` 加上第 4 个参数 `undefined` + 第 5 个参数 `Stripe.createSubtleCryptoProvider()`，否则在 Worker 上验签也会失败（没有 Node `crypto`）。

## 验证

1. 部署后再按一次 Upgrade，预期跳出 Stripe Checkout 页面。
2. 如果还是不行，看 worker 日志（不会再是 status 0，应该是 200/4xx 并带错误信息）继续排查。

## 不动的部分

- Stripe price IDs、checkout 业务逻辑、auth 验证、CORS、前端 `startStripeCheckout` 都保持原样。
- `send-push` edge function 不动。
- Webhook secret 你已经更新好了，不用再改。
