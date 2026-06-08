## Goal
WhatsApp share message on the Order Form page (and the Orders page share button) should vary by business type — not always the generic "Hi! Place your order here".

## Per-biz messages (en / ms / zh)

| biz | en | ms | zh |
|---|---|---|---|
| retail | Hi! Place your order with us here: {link} | Hai! Buat pesanan dengan kami di sini: {link} | 您好！点此向我们下单：{link} |
| fnb | Hi! Place your order with us here 🍱: {link} | Hai! Pesan makanan dengan kami di sini 🍱: {link} | 您好！点此订餐：{link} |
| education | Hi! Enquire about our courses & programs here: {link} | Hai! Tanya tentang kursus & program kami di sini: {link} | 您好！点此咨询课程与升学：{link} |
| beauty | Hi! Book your appointment with us here: {link} | Hai! Tempah temujanji dengan kami di sini: {link} | 您好！点此预约美容服务：{link} |
| property | Hi! View our property listings and enquire here: {link} | Hai! Sila lihat senarai hartanah kami dan hubungi kami: {link} | 你好！欢迎浏览我们的房源，请点击链接询问：{link} |
| freelance | Hi! Book my services here: {link} | Hai! Tempah perkhidmatan saya di sini: {link} | 您好！点此预约我的服务：{link} |

(Emoji stays in source; `stripEmoji` removes it for the WhatsApp URL — same as today.)

## Changes

### 1. `src/lib/businessType.ts`
Add helper:
```ts
export function pofWaShareKey(type: BizType | null | undefined): TKey {
  switch (type) {
    case "fnb": return "pof_wa_share_msg_fnb";
    case "education": return "pof_wa_share_msg_education";
    case "beauty": return "pof_wa_share_msg_beauty";
    case "property": return "pof_wa_share_msg_property";
    case "freelance": return "pof_wa_share_msg_freelance";
    case "retail":
    default: return "pof_wa_share_msg";   // retail keeps the existing key
  }
}
```

### 2. `src/contexts/I18nContext.tsx`
Add the four new keys (`_fnb`, `_education`, `_beauty`, `_freelance`) to all three locale blocks (en/ms/zh) plus the `TKey` union. Keep existing `pof_wa_share_msg` (retail default) and `pof_wa_share_msg_property` unchanged.

### 3. `src/routes/order-form.tsx`
Replace the inline ternary with `t(pofWaShareKey(businessType as BizType | null))`.

### 4. `src/routes/orders.tsx`
Read `business_type` from the profile (it's already loaded elsewhere on this page — verify) and use `pofWaShareKey(...)` for the share button at line 587. If `business_type` isn't loaded there yet, fetch it once in the same effect that loads `ofCode`.

### Out of scope
- `src/routes/listings.tsx` — hardcoded property message, already correct.
- In-app notification / push wording (separate system).
