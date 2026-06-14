# Project Memory

## Core
Trilingual app (EN / MS / ZH). Every user-visible string MUST go through `t()` with keys added to all 3 language blocks in `src/contexts/I18nContext.tsx`. Never hardcode English or Chinese strings in UI/toasts.
Inventory units/categories must be localized and consistent everywhere, including public order forms.

## Memories
- [Label consistency](mem://features/labels) — Inventory units/categories must display via localized helpers everywhere