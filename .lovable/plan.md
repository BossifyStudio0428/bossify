## 目标

让 Language（选语言）页面只在以下场景显示一次：
- 新用户第一次打开 app
- 用户删除并重新安装 app
- 用户清除浏览器存储

之后再打开 app（包括冷启动、从后台返回、刷新）都**不再**显示 Language 页面，直接进入正常的 splash → auth/home 流程。

---

## 当前问题

`AppShell.tsx` 里的冷启动流程**强制**每次都跳转到 `/language`（第 184 行 `navigate({ to: "/language", replace: true })`），完全没有判断用户是否已经选过语言。所以每次冷启动用户都被甩回 language 页。

另外现在用的是 `sessionStorage` (`bossify_lang_picked_session`)，这个一关 app 就丢，也不符合"永久记住"的需求。

---

## 修改方案

### 1. `src/lib/safeStorage` 中已有 `safeLocalStorage`（永久存储，删 app 才会清）— 用它来记录"语言已选"

### 2. `src/routes/language.tsx`
- 把 `safeSessionStorage.setItem("bossify_lang_picked_session", "1")` 改为 `safeLocalStorage.setItem("bossify_lang_picked", "1")`
- 这样选过语言的标记会一直保留，直到 app 被删除/重装

### 3. `src/components/AppShell.tsx`
- 新增常量 `LANG_PICKED_PERSISTENT_KEY = "bossify_lang_picked"`
- 新增辅助函数 `hasPickedLanguageEver()` —— 读 `safeLocalStorage`
- 修改冷启动 splash 完成后的跳转逻辑（约第 178–187 行）：
  - 如果 `hasPickedLanguageEver()` 为 `true` → 跳过 language，直接走正常流程（已登录去 `/`，未登录去 `/auth`）
  - 如果为 `false`（新用户/重装） → 跳到 `/language`（保持现在的行为）
- 删除已废弃的 `LANG_PICKED_KEY` / `hasPickedLangThisSession` 相关代码（已经没用了）

### 4. `src/routes/splash.tsx`
- 同样在 splash 计时结束时判断 `hasPickedLanguageEver()`：
  - 已选过 → `navigate({ to: "/auth" })`（让 AppShell 后续根据登录状态再决定去 `/` 还是 `/auth`）
  - 没选过 → `navigate({ to: "/language" })`

---

## 行为验证清单

| 场景 | 期望 |
|---|---|
| 全新用户第一次打开 | splash → **language** → auth |
| 选完语言进 app 后再次冷启动 | splash → auth/home（**跳过 language**） |
| 切到后台再回来 | 保持当前页面，不重置 |
| 刷新浏览器 | splash → auth/home（跳过 language） |
| 删除并重新安装 app | splash → **language** → auth |
| 清除浏览器存储 | splash → **language** → auth |

---

## 需要改动的文件

- `src/routes/language.tsx`（改存储 key，从 session 换成 local）
- `src/components/AppShell.tsx`（冷启动跳转判断）
- `src/routes/splash.tsx`（splash 结束跳转判断）
