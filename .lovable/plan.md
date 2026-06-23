# Distance-Based Delivery Fees

## What you'll get

1. **Store address in Settings** — add your shop/restaurant address with Google Places autocomplete; lat/lng saved automatically.
2. **Delivery Zones editor in Settings** — toggle delivery on/off, add/remove distance tiers (e.g. `0–2 km → RM3`, `2–5 km → RM6`, `5–10 km → RM10`, `>10 km → unavailable`).
3. **Public order form** — customer types their delivery address (Google Places autocomplete), we measure driving distance via Distance Matrix, look up the matching tier, and add the delivery fee to the cart total in real time. If the address is outside the farthest tier, we show "Sorry, outside delivery area" and block checkout for delivery (pickup still allowed if you have it).

## Prerequisite (one-click)

I need to link the **Google Maps Platform** connector to this project. After the plan is approved I'll open the connect dialog; pick the managed connection and confirm — no API key needed from you. The connector provides both the browser key (for Places autocomplete) and the server key (for Distance Matrix through Lovable's gateway).

## Technical details

### Database (single migration)
- `profiles` — add `store_address text`, `store_lat numeric`, `store_lng numeric`, `delivery_enabled boolean default false`, `delivery_zones jsonb default '[]'` (shape: `[{ max_km: number, fee: number }]`, sorted ascending; "beyond last tier = unavailable").
- No new tables; reuses existing `profiles` row.

### Frontend
- `src/components/PlacesAutocomplete.tsx` — reusable input loading the Maps JS API once via `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`, using the New Places `PlaceAutocompleteElement` (returns address + lat/lng).
- `src/lib/maps.ts` — `loadGoogleMaps()` singleton loader.
- `src/lib/delivery.functions.ts` — `computeDeliveryFee({ storeLat, storeLng, destLat, destLng, ownerId })` server function. Calls Distance Matrix via the connector gateway and matches against the owner's `delivery_zones`. Returns `{ km, fee, available }`.
- `src/routes/profile.tsx` — new "Store Address" + "Delivery Zones" section (FnB + Retail business types).
- `src/routes/order.$code.tsx` — when delivery is selected, render PlacesAutocomplete, call `computeDeliveryFee`, show "Distance: X km · Fee: RMY", add fee into the order total; block submit if `available === false`.

### Safety
- Server function validates input (Zod), checks `delivery_enabled` for the owner, returns `available:false` instead of throwing when address is unreachable.
- Browser key is referrer-restricted; server-side Distance Matrix goes through the gateway (no key in browser).
- Existing order flow unchanged when delivery is disabled or business type isn't FnB/Retail.

## Default tiers I'll seed
`0–2 km → RM3`, `2–5 km → RM6`, `5–10 km → RM10`, `>10 km → unavailable` — editable in Settings after creation.
