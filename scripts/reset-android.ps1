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

if (-not (Test-Path ".\dist")) {
  New-Item -ItemType Directory -Path ".\dist" | Out-Null
}

Set-Content -Path ".\dist\index.html" -Value "<!doctype html><html><head><meta charset='utf-8'><title>Bossify</title></head><body>Bossify</body></html>" -Encoding UTF8

Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

Write-Host "Creating fresh Capacitor Android project..." -ForegroundColor Yellow
npx cap add android

Write-Host "Syncing Capacitor config..." -ForegroundColor Yellow
npx cap sync android

Write-Host "Done. Opening Android Studio..." -ForegroundColor Green
npx cap open android

Write-Host "NEXT: In Android Studio build a NEW APK/AAB, then uninstall the old Bossify app from your phone before installing." -ForegroundColor Green
