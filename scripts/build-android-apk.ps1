$ErrorActionPreference = "Stop"

Write-Host "Bossify clean Android APK build starting..." -ForegroundColor Cyan

$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repo

Write-Host "Stopping Android/Gradle processes that may cache old files..." -ForegroundColor Yellow
foreach ($name in @("studio64", "studio", "java", "javaw", "gradle", "adb")) {
  Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

Write-Host "Removing old web build and copied Android web assets..." -ForegroundColor Yellow
foreach ($path in @("dist", "android\app\src\main\assets\public", "android\app\build", "android\.gradle")) {
  if (Test-Path $path) {
    Remove-Item -LiteralPath $path -Recurse -Force
  }
}

Write-Host "Installing dependencies..." -ForegroundColor Yellow
bun install

Write-Host "Building fresh web bundle..." -ForegroundColor Yellow
bun run build

Write-Host "Generating dist/client/index.html SPA shell for Capacitor..." -ForegroundColor Yellow
node scripts/generate-spa-html.mjs

Write-Host "Copying fresh bundle into Android..." -ForegroundColor Yellow
npx cap sync android

Write-Host "Applying Bossify Android patch..." -ForegroundColor Yellow
bun run android:patch

Write-Host "Building debug APK from command line..." -ForegroundColor Yellow
Push-Location android
try {
  if ($IsWindows -or $env:OS -eq "Windows_NT") {
    .\gradlew.bat clean assembleDebug --no-build-cache
  } else {
    ./gradlew clean assembleDebug --no-build-cache
  }
} finally {
  Pop-Location
}

Write-Host "DONE: android\app\build\outputs\apk\debug\app-debug.apk" -ForegroundColor Green
Write-Host "Install this exact APK after uninstalling the old Bossify app from the phone." -ForegroundColor Green