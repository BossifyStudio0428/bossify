# Plans 页面 property 业务改 "房源 / 客户"

## 背景
- SubscriptionContext 已经有 `listingsLimit`（Free 10 / Starter 25 / Pro+ ∞）
- listings.tsx 已经按 listingsLimit 限制
- 客户页按钮已指向 /listings
- **只剩 plans.tsx 还在显示 "10 配套 / 25 配套 / 无限配套 / 20 潜在客户 / 40 潜在客户 / 无限潜在客户"**

## 改动

### 1. `src/contexts/I18nContext.tsx` — 新增 6 个 key（EN / BM / ZH）
| key | EN | BM | ZH |
|---|---|---|---|
| `pf_listings_10` | 10 listings | 10 hartanah | 10 个房源 |
| `ps_listings_25` | 25 listings | 25 hartanah | 25 个房源 |
| `pp_unlimited_listings` | Unlimited listings | Hartanah tanpa had | 无限房源 |
| `pf_clients_20` | 20 clients | 20 pelanggan | 20 个客户 |
| `ps_clients_40` | 40 clients | 40 pelanggan | 40 个客户 |
| `pp_unlimited_clients` | Unlimited clients | Pelanggan tanpa had | 无限客户 |

### 2. `src/routes/plans.tsx` — property 行替换（3 处）
```diff
- property: ["pf_leads_20",        "pf_packages_10",      "pf_basic_dashboard", "pf_followup_reminders"]
+ property: ["pf_clients_20",      "pf_listings_10",      "pf_basic_dashboard", "pf_followup_reminders"]

- property: ["ps_leads_40",        "ps_packages_25",      "ps_basic_lead_reports", "pf_followup_reminders"]
+ property: ["ps_clients_40",      "ps_listings_25",      "ps_basic_lead_reports", "pf_followup_reminders"]

- property: ["pp_unlimited_leads", "pp_unlimited_packages", "pp_full_lead_reports", ...]
+ property: ["pp_unlimited_clients","pp_unlimited_listings","pp_full_lead_reports", ...]
```

## 不在本次范围（已确认无需改）
- 数据库（listings 表已存在）
- listings.tsx 上限拦截（已做）
- customers.tsx 按钮指向（已改 /listings）
- new-order.tsx 客户/房源下拉（已加）
- 旧的 `pf_packages_10` / `ps_packages_25` / `pp_unlimited_packages` / `pf_leads_20` 等 key 不删，其他业务类型暂时不引用 property 的房源 key，互不影响

确认就开始改。
