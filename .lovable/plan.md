## 当前状态

- 无线 ADB 连接成功 ✅
- Bossify 已经被 `monkey` 命令启动 ✅
- 完整 logcat 已经写到 `C:\dev\bossify\android-crash-log.txt` ✅
- 但 `Select-String` 因为正则 `Resources\\\$NotFoundException` 转义错误抛错，导致 `android-crash-summary.txt` 没生成 ❌

## 要做的事

### 1. 修 `scripts/logcat-crash.ps1` 的正则 bug

把 patterns 数组里的
```
"Resources\\\$NotFoundException"
```
改成 PowerShell 单引号字面量 + 正确转义：
```
'Resources\$NotFoundException'
```
同时把所有 pattern 改成单引号字符串，避免 `$` 被 PowerShell 当变量插值。

顺便加一个保险：用 `try/catch` 包住 `Select-String`，即使正则再出问题，也至少把"前 200 行 + 最后 200 行原始日志"写进 summary，保证你永远拿得到东西看。

### 2. 不改任何 APK / Capacitor 配置

这一轮只修脚本。

## 你需要做的（修完之后）

在 PowerShell 里跑这一行就行（不用重新抓日志，直接从已有的 `android-crash-log.txt` 提取）：

```powershell
npm run android:logcat
```

然后把 `android-crash-summary.txt` 的内容贴给我，或者直接把 `android-crash-log.txt` 拖给我（文件可能有点大，但里面一定有 `FATAL EXCEPTION`）。

拿到那段红字，我就能告诉你**为什么闪退**，然后精准修。
