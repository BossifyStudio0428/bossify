@echo off
REM Bossify - one-click Android icon + splash regenerator
REM Run this from C:\dev\bossify (the project root) after `git pull`.

cd /d "%~dp0\..\.."

echo === Copying source images to assets\ ===
if not exist assets mkdir assets
copy /Y public\app-icons\icon.png             assets\icon.png
copy /Y public\app-icons\icon-foreground.png  assets\icon-foreground.png
copy /Y public\app-icons\icon-background.png  assets\icon-background.png
copy /Y public\app-icons\splash.png           assets\splash.png
copy /Y public\app-icons\splash-dark.png      assets\splash-dark.png

echo === Installing @capacitor/assets ===
call npm install -D @capacitor/assets

echo === Generating Android icons + splash ===
call npx capacitor-assets generate --android

echo === Syncing Capacitor ===
call npx cap sync android

echo.
echo DONE. Now in Android Studio:
echo   Build  ^>  Clean Project
echo   Build  ^>  Rebuild Project
echo   Build  ^>  Build APK
echo.
echo IMPORTANT: UNINSTALL old Bossify on phone before installing new APK,
echo            otherwise Android may keep the cached old icon.
echo.
pause