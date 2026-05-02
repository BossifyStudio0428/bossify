$ErrorActionPreference = "Stop"

$appId = "com.zhstudio.bossify"
$root = (Get-Location).Path
$logFile = Join-Path $root "android-crash-log.txt"
$summaryFile = Join-Path $root "android-crash-summary.txt"
$errFile = Join-Path $root "android-crash-log.err.txt"

function Resolve-Adb {
  # Build candidate list safely — never call Join-Path with a $null base.
  $bases = @()
  if ($env:LOCALAPPDATA)      { $bases += (Join-Path $env:LOCALAPPDATA "Android\Sdk") }
  if ($env:USERPROFILE)       { $bases += (Join-Path $env:USERPROFILE "AppData\Local\Android\Sdk") }
  if ($env:ANDROID_HOME)      { $bases += $env:ANDROID_HOME }
  if ($env:ANDROID_SDK_ROOT)  { $bases += $env:ANDROID_SDK_ROOT }
  $bases += "C:\Android\Sdk"
  $bases += "C:\Program Files\Android\Android Studio\sdk"

  # 1) Try `adb` already on PATH.
  $cmd = Get-Command "adb" -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  # 2) Try each known SDK location.
  $tried = @()
  foreach ($base in ($bases | Select-Object -Unique)) {
    if (-not $base) { continue }
    $candidate = Join-Path $base "platform-tools\adb.exe"
    $tried += $candidate
    if (Test-Path $candidate) { return $candidate }
  }

  Write-Host ""
  Write-Host "Could not find adb.exe. Tried these locations:" -ForegroundColor Red
  foreach ($p in $tried) { Write-Host "  - $p" -ForegroundColor DarkGray }
  Write-Host ""
  Write-Host "Fix: open Android Studio -> SDK Manager -> copy 'Android SDK Location'." -ForegroundColor Yellow
  Write-Host "Then either:" -ForegroundColor Yellow
  Write-Host "  a) Add '<that path>\platform-tools' to your Windows PATH, OR" -ForegroundColor Yellow
  Write-Host "  b) Run in PowerShell:  setx ANDROID_HOME `"<that path>`"  (then open a new terminal)" -ForegroundColor Yellow
  throw "ADB not found."
}

$adb = Resolve-Adb
Write-Host "Using ADB: $adb" -ForegroundColor Cyan

$devices = & $adb devices
Write-Host ($devices -join "`n")
$connected = @($devices | Select-String -Pattern "\tdevice\s*$")
if ($connected.Count -le 0) {
  Write-Host ""
  Write-Host "No authorized Android device found." -ForegroundColor Red
  Write-Host "Checklist:" -ForegroundColor Yellow
  Write-Host "  1. Connect phone with USB cable (not just charging cable)." -ForegroundColor Yellow
  Write-Host "  2. On phone: Settings -> About -> tap Build Number 7 times to enable Developer options." -ForegroundColor Yellow
  Write-Host "  3. On phone: Developer options -> enable 'USB debugging'." -ForegroundColor Yellow
  Write-Host "  4. Re-plug USB. When phone shows 'Allow USB debugging?' popup, tap ALLOW." -ForegroundColor Yellow
  Write-Host "  5. Run this script again." -ForegroundColor Yellow
  throw "No device."
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
  'FATAL EXCEPTION',
  'AndroidRuntime',
  [regex]::Escape($appId),
  'Capacitor',
  'Bridge',
  'chromium',
  'WebView',
  'ClassNotFoundException',
  'RuntimeException',
  'Resources\$NotFoundException',
  'UnsatisfiedLinkError',
  'ActivityThread',
  'beginning of crash',
  'died',
  'force-finishing'
)

$summaryParts = @()
try {
  $found = Select-String -Path $logFile -Pattern $patterns -Context 8, 35 -ErrorAction Stop
  if ($found) {
    $summaryParts += "=== MATCHED CRASH/RUNTIME LINES ==="
    $summaryParts += ($found | Out-String -Width 260)
  } else {
    $summaryParts += "=== NO CRASH PATTERN MATCHED ==="
  }
} catch {
  $summaryParts += "=== Select-String FAILED: $($_.Exception.Message) ==="
}

# Always include head + tail of raw log as a safety net so the user gets SOMETHING.
if (Test-Path $logFile) {
  $all = Get-Content -Path $logFile -ErrorAction SilentlyContinue
  if ($all) {
    $summaryParts += ""
    $summaryParts += "=== FIRST 200 LINES OF RAW LOG ==="
    $summaryParts += ($all | Select-Object -First 200 | Out-String -Width 260)
    $summaryParts += ""
    $summaryParts += "=== LAST 400 LINES OF RAW LOG ==="
    $summaryParts += ($all | Select-Object -Last 400 | Out-String -Width 260)
  }
}

$summaryParts -join "`r`n" | Set-Content -Path $summaryFile -Encoding UTF8

Write-Host "Done." -ForegroundColor Green
Write-Host "Send back this file content: $summaryFile" -ForegroundColor Green
Write-Host "Full raw log saved at: $logFile" -ForegroundColor DarkGray