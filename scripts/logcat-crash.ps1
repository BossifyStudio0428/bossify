$ErrorActionPreference = "Stop"

$appId = "com.zhstudio.bossify"
$root = (Get-Location).Path
$logFile = Join-Path $root "android-crash-log.txt"
$summaryFile = Join-Path $root "android-crash-summary.txt"
$errFile = Join-Path $root "android-crash-log.err.txt"

function Resolve-Adb {
  $candidates = @(
    "adb",
    (Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"),
    (Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"),
    (Join-Path $env:ANDROID_SDK_ROOT "platform-tools\adb.exe")
  ) | Where-Object { $_ -and $_.Trim() -ne "" }

  foreach ($candidate in $candidates) {
    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }

  throw "ADB not found. Install Android Studio platform-tools or add adb.exe to PATH."
}

$adb = Resolve-Adb
Write-Host "Using ADB: $adb" -ForegroundColor Cyan

$devices = & $adb devices
Write-Host ($devices -join "`n")
if (-not (($devices | Select-String -Pattern "\tdevice$").Count -gt 0)) {
  throw "No authorized Android device found. Enable USB debugging, accept the phone prompt, then run again."
}

Remove-Item $logFile, $summaryFile, $errFile -Force -ErrorAction SilentlyContinue

Write-Host "Clearing old Logcat..." -ForegroundColor Yellow
& $adb logcat -c

Write-Host "Capturing Logcat, launching Bossify, then waiting for crash..." -ForegroundColor Yellow
$logcat = Start-Process -FilePath $adb -ArgumentList @("logcat", "-v", "time") -RedirectStandardOutput $logFile -RedirectStandardError $errFile -NoNewWindow -PassThru
Start-Sleep -Seconds 1
& $adb shell monkey -p $appId -c android.intent.category.LAUNCHER 1 | Out-Null
Start-Sleep -Seconds 25

if ($logcat -and -not $logcat.HasExited) {
  Stop-Process -Id $logcat.Id -Force -ErrorAction SilentlyContinue
}

$patterns = @(
  "FATAL EXCEPTION",
  "AndroidRuntime",
  $appId,
  "Capacitor",
  "Bridge",
  "chromium",
  "WebView",
  "ClassNotFoundException",
  "RuntimeException",
  "Resources\\\$NotFoundException",
  "UnsatisfiedLinkError",
  "ActivityThread"
)

$matches = Select-String -Path $logFile -Pattern $patterns -Context 8, 35 -ErrorAction SilentlyContinue
if ($matches) {
  $matches | Out-String -Width 260 | Set-Content -Path $summaryFile -Encoding UTF8
} else {
  "No crash pattern found. Full log is in android-crash-log.txt." | Set-Content -Path $summaryFile -Encoding UTF8
}

Write-Host "Done." -ForegroundColor Green
Write-Host "Send back this file content: $summaryFile" -ForegroundColor Green
Write-Host "Full raw log saved at: $logFile" -ForegroundColor DarkGray