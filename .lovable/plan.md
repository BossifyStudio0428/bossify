## 问题（用大白话）

你截图里看到的 `Join-Path : Cannot bind argument to parameter 'Path' because it is null`，**不是 APK 闪退**，是我之前写的 logcat 脚本本身崩了。

原因：脚本里有这一行
```powershell
(Join-Path $env:ANDROID_HOME "platform-tools\adb.exe")
```
当你电脑上没设 `ANDROID_HOME` 这个环境变量时，`$env:ANDROID_HOME` 是 `$null`，PowerShell 的 `Join-Path` 不接受 null，立刻抛错——后面用来过滤空值的 `Where-Object` 根本没机会执行。

所以现在我们连一行 APK 的崩溃日志都没拿到。先把脚本修健壮，才能看到真正的闪退原因。

## 要做的事

### 1. 重写 `scripts/logcat-crash.ps1` 的 adb 查找逻辑
- 用安全的方式拼路径：先判断环境变量是否为空，再调 `Join-Path`，避免 null 崩溃。
- 按顺序尝试以下位置，找到第一个存在的 `adb.exe` 就用：
  1. PATH 中的 `adb`（用 `Get-Command`）
  2. `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`（Android Studio 默认安装路径）
  3. `%USERPROFILE%\AppData\Local\Android\Sdk\platform-tools\adb.exe`（同上的另一种写法兜底）
  4. `%ANDROID_HOME%\platform-tools\adb.exe`（如果设了）
  5. `%ANDROID_SDK_ROOT%\platform-tools\adb.exe`（如果设了）
  6. `C:\Android\Sdk\platform-tools\adb.exe`（少数人手动装的位置）
- 都找不到时，给出友好提示：告诉你打开 Android Studio → SDK Manager → 复制 "Android SDK Location" 路径，并告诉你怎么把它加到 PATH。

### 2. 检查设备连接
- 调 `adb devices`，如果列表里没有 `device` 状态的手机，提示：
  - "请用 USB 线连手机"
  - "在手机上启用『开发者选项』→『USB 调试』"
  - "拔插一次 USB，看到弹窗时点『允许』"

### 3. 抓崩溃日志（这部分逻辑保持不变，已经够用）
- 清空旧日志 → 启动后台 logcat → 用 `monkey` 命令启动 APK → 等 25 秒 → 停止 logcat。
- 用关键字过滤：`FATAL EXCEPTION`、`AndroidRuntime`、`com.zhstudio.bossify`、`Capacitor`、`WebView`、`ClassNotFoundException`、`UnsatisfiedLinkError` 等。
- 把命中行 + 上下文写到 `android-crash-summary.txt`。

### 4. 不改任何 APK / Capacitor / Android 配置
- 这一轮**只修脚本**，不动 `capacitor.config.ts`、不动 `android/`、不动 `vite.config.ts`。
- 目的就是先拿到崩溃堆栈。拿到之后，下一轮我才会做精准修复，不会再瞎猜。

## 你需要做的

修好脚本后（大约 1 分钟），请你：

1. 手机用 USB 连上电脑，开启 USB 调试，弹窗点"允许"。
2. 在 PowerShell 跑：
   ```
   npm run android:logcat
   ```
3. 跑完后项目根目录会生成 `android-crash-summary.txt`，**把里面的内容整段贴给我**（或者直接拖文件给我也行）。

只要能看到那段红色的 `FATAL EXCEPTION ... Caused by: ...`，我就能 100% 告诉你闪退的真正原因，不会再让你白花 credit。

## 备选方案（如果脚本还有问题）

如果脚本仍然跑不起来（比如 adb 真的找不到），你可以改用 Android Studio 内置 Logcat：
- Android Studio → 底部 Logcat 标签
- 顶部过滤框输入：`package:com.zhstudio.bossify`
- 启动 APK，等它闪退
- 找到红色的 `FATAL EXCEPTION: main` 那一段，连同下面所有 `at ...` 和 `Caused by: ...` 一起复制给我

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>
