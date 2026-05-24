我会直接修复这两个仍然硬编码 `/20` 的位置：

1. **翻译文案改成动态 limit**
   - `src/contexts/I18nContext.tsx`
   - 把英文、马来文、中文的 `orders_used` 从固定 `20` 改成 `{limit}`。
   - 结果会显示 `23 / 40`，不是 `23 / 20`。

2. **Profile 页面传入真实 Starter limit**
   - `src/routes/profile.tsx`
   - 现在只替换 `{x}`，没有替换 `{limit}`，所以会继续显示旧的固定 20。
   - 我会从 `useSubscription()` 取 `ordersLimit`，并显示 `ordersUsed / ordersLimit`。

3. **New Order 页面也同步修复**
   - `src/routes/new-order.tsx`
   - 同样传入 `ordersLimit`，避免创建订单页也显示错。

4. **验证**
   - 搜索确认 `orders_used` 不再硬编码 `/20`。
   - 确认 Starter 的 limit 使用 `SubscriptionContext` 里的 `STARTER_LIMITS.ordersPerMonth = 40`。