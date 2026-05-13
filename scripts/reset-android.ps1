$ErrorActionPreference = "Stop"

Write-Host "Bossify Android fresh reset starting..." -ForegroundColor Cyan
Write-Host "Closing processes that may lock the android folder..." -ForegroundColor Yellow

$processNames = @(
  "studio64",
  "studio",
  "java",
  "javaw",
  "gradle",
  "adb"
)

foreach ($name in $processNames) {
  Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

if (Test-Path ".\android") {
  Write-Host "Removing old android folder..." -ForegroundColor Yellow
  Remove-Item -LiteralPath ".\android" -Recurse -Force
}

Write-Host "Installing dependencies..." -ForegroundColor Yellow
bun install

Write-Host "Building Bossify web bundle..." -ForegroundColor Yellow
bun run build

Write-Host "Creating fresh Capacitor Android project..." -ForegroundColor Yellow
npx cap add android

Write-Host "Syncing Capacitor config..." -ForegroundColor Yellow
npx cap sync android

Write-Host "Preparing Bossify icon/splash source images..." -ForegroundColor Yellow
if (-not (Test-Path ".\assets")) {
  New-Item -ItemType Directory -Path ".\assets" | Out-Null
}
$iconSources = @(
  @{ src = "public\app-icons\icon.png";            dst = "assets\icon.png" },
  @{ src = "public\app-icons\icon-foreground.png"; dst = "assets\icon-foreground.png" },
  @{ src = "public\app-icons\icon-background.png"; dst = "assets\icon-background.png" },
  @{ src = "public\app-icons\splash.png";          dst = "assets\splash.png" },
  @{ src = "public\app-icons\splash-dark.png";     dst = "assets\splash-dark.png" }
)
foreach ($pair in $iconSources) {
  if (Test-Path $pair.src) {
    Copy-Item -Path $pair.src -Destination $pair.dst -Force
  }
}

Write-Host "Generating native Android icons via @capacitor/assets..." -ForegroundColor Yellow
try {
  npx --yes @capacitor/assets generate --android
} catch {
  Write-Host "capacitor-assets generation failed: $_" -ForegroundColor Red
  Write-Host "Continuing — patch step will still dedupe duplicate launcher resources." -ForegroundColor Yellow
}

Write-Host "Re-syncing Capacitor after icon generation..." -ForegroundColor Yellow
npx cap sync android

Write-Host "Applying Bossify Android safety patch..." -ForegroundColor Yellow
node scripts/patch-android.mjs

Write-Host "Done. Opening Android Studio..." -ForegroundColor Green
npx cap open android

Write-Host "NEXT: In Android Studio build a NEW APK/AAB, then uninstall the old Bossify app from your phone before installing." -ForegroundColor Green
