## Problem

The language picker hero says "WELCOME / Bossify". For a customer opening an order link, this is confusing — they expect to land on the seller's store, not see the platform name front-and-center.

## Change

In the language picker hero card in `src/routes/order.$code.tsx`:

- Show the **seller's store name** (from `state.business_name`, with safe fallback) as the big title instead of "Bossify".
- Replace the small "WELCOME" eyebrow with an order-context label, localized via the three-language pattern already used on this screen:
  - EN: `ORDER FORM`
  - MS: `BORANG PESANAN`
  - ZH: `订单表格`
- Keep the Bossify logo tile (it's the platform mark, fine as a small icon).
- Keep the trilingual "Choose your language / Pilih bahasa anda / 选择您的语言" line below.
- Keep the small `Powered by Bossify 💜` footer so the platform attribution still appears, just not as the headline.

## Edge cases

- If `state.business_name` is empty/missing, fall back to a neutral label (e.g. "Store") so the card never renders blank.
- Long store names: title already uses `leading-tight`; add `break-words` so two-line names don't overflow the card.

No other screens are affected.