## Problem
Public order form cart submissions fail with:
`product: too_small, minimum 1 character`

Because `SubmitSchema` in `src/lib/public-order.functions.ts` requires `product` to be at least 1 character, but cart-style submissions (retail/fnb multi-item) send `product: ""` and use the `items[]` array instead.

## Fix
In `src/lib/public-order.functions.ts`, remove `.min(1)` from the legacy `product` field:

```ts
// Before
product: z.string().trim().min(1).max(200).optional().default(""),
// After
product: z.string().trim().max(200).optional().default(""),
```

The handler already builds `productText` from either `items[]` or the legacy `product` field and returns a clear `insert_failed` error if both are empty — so this is safe and preserves backward compatibility.

One-line change, no other files affected.