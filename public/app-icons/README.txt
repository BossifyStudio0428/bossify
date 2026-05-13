Bossify App Icons — Capacitor source images
============================================

These are the SOURCE images. Use them to generate Android launcher icons
and splash screens with @capacitor/assets.

How to use (run in C:\dev\bossify):

  1. Pull this folder to your local repo (git pull).
  2. Copy the contents of public/app-icons/  to  assets/  (project root):
        mkdir assets
        copy public\app-icons\icon.png             assets\icon.png
        copy public\app-icons\icon-foreground.png  assets\icon-foreground.png
        copy public\app-icons\icon-background.png  assets\icon-background.png
        copy public\app-icons\splash.png           assets\splash.png
        copy public\app-icons\splash-dark.png      assets\splash-dark.png

  3. Generate native Android assets:
        npm install -D @capacitor/assets
        npx capacitor-assets generate --android
        npx cap sync android

  4. In Android Studio: Build > Clean Project > Rebuild > Build APK.

  5. UNINSTALL the old Bossify app from your phone first, then install
     the new APK. Android caches launcher icons on overwrite installs.

Files:
  icon.png             1024x1024  full icon (background + logo)
  icon-foreground.png  1024x1024  logo only, transparent (Adaptive Icon FG)
  icon-background.png  1024x1024  solid #7C3AED   (Adaptive Icon BG)
  splash.png           2732x2732  dark/brand splash
  splash-dark.png      2732x2732  alt splash