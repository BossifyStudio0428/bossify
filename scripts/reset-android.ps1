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

Write-Host "Applying Bossify Android safety patch..." -ForegroundColor Yellow
node scripts/patch-android.mjs

Write-Host "Done. Opening Android Studio..." -ForegroundColor Green
npx cap open android

Write-Host "NEXT: In Android Studio build a NEW APK/AAB, then uninstall the old Bossify app from your phone before installing." -ForegroundColor Green
