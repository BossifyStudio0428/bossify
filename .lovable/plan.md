明白了，把这页改成纯展示 + 测试按钮只给 admin。

## 改动

**1. 移除所有开关**
- 删掉 6 个 `<Switch>`，改成纯展示卡片：图标 + 标题 + 描述。
- 顶部加一段说明：「通知开关请在手机系统设置里管理。这里只是列出 Bossify 会发送的通知类型。」
- 「允许通知」横幅 和 「打开系统通知设置」按钮 **保留**（这俩是真的有用，跳到系统设置）。
- 不再读写 `notif_prefs`、不再调用 `rescheduleAll`、`savePrefs`。

**2. 「发送测试推送」按钮 → 只 admin 看到**
- 在组件加载时查 `profiles.is_admin`（沿用 `src/routes/admin.tsx` 第 35 行的同款查询）。
- `is_admin === true` 才渲染按钮。普通用户完全看不到。

## 技术细节

文件只改 `src/routes/notification-settings.tsx`：
- 移除 `prefs` / `setPrefs` / `update()` / `loadPrefs` / `savePrefs` / `rescheduleAll` 的 import 和调用。
- `items` 数组保留，只用来渲染展示内容。
- 加 `const [isAdmin, setIsAdmin] = useState(false)` + 一个 `useEffect` 查 `is_admin`。
- 测试按钮包在 `{isAdmin && (...)}` 里。

后端的 `notif_*` 字段和 `notifPrefs.ts` 不动（edge function 还会读，默认全 true），万一以后想加回开关也容易。