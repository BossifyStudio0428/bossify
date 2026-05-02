import { existsSync, readFileSync, writeFileSync } from "node:fs";

const manifestPath = "android/app/src/main/AndroidManifest.xml";
const stylesPath = "android/app/src/main/res/values/styles.xml";

function patchManifest() {
  if (!existsSync(manifestPath)) {
    console.warn(`Skipped: ${manifestPath} not found. Run npx cap add android first.`);
    return;
  }

  let manifest = readFileSync(manifestPath, "utf8");
  if (!manifest.includes('android:name=".MainActivity"')) {
    console.warn("Skipped: MainActivity not found in AndroidManifest.xml.");
    return;
  }

  const activityMatch = manifest.match(/<activity\b[\s\S]*?android:name="\.MainActivity"[\s\S]*?>/);
  if (!activityMatch) {
    console.warn("Skipped: MainActivity activity tag could not be parsed.");
    return;
  }

  let activityTag = activityMatch[0].replace(/\sandroid:screenOrientation="[^"]*"/g, "");
  activityTag = activityTag.replace(
    /<activity\b/,
    '<activity\n            android:screenOrientation="portrait"',
  );
  manifest = manifest.replace(activityMatch[0], activityTag);
  writeFileSync(manifestPath, manifest);
}

function patchStyles() {
  if (!existsSync(stylesPath)) {
    console.warn(`Skipped: ${stylesPath} not found. Run npx cap add android first.`);
    return;
  }

  let styles = readFileSync(stylesPath, "utf8");
  styles = styles.replace(
    /<style name="AppTheme\.NoActionBarLaunch" parent="Theme\.SplashScreen">/g,
    '<style name="AppTheme.NoActionBarLaunch" parent="AppTheme.NoActionBar">',
  );
  styles = styles.replace(
    /<item name="windowSplashScreenAnimatedIcon">@drawable\/splash<\/item>\s*/g,
    "",
  );
  styles = styles.replace(
    /<item name="windowSplashScreenBackground">@color\/splash_background<\/item>\s*/g,
    "",
  );
  styles = styles.replace(
    /<item name="postSplashScreenTheme">@style\/AppTheme\.NoActionBar<\/item>\s*/g,
    "",
  );
  if (!styles.includes('<item name="android:background">@drawable/splash</item>')) {
    styles = styles.replace(
      /(<style name="AppTheme\.NoActionBarLaunch" parent="AppTheme\.NoActionBar">\s*)/,
      '$1\n        <item name="android:background">@drawable/splash</item>',
    );
  }
  writeFileSync(stylesPath, styles);
}

patchManifest();
patchStyles();
console.log("Bossify Android patch applied.");