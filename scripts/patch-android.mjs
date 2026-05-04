import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { join, dirname } from "node:path";

const APP_ID = "com.zhstudio.bossify";
const javaRoot = "android/app/src/main/java";
const manifestPath = "android/app/src/main/AndroidManifest.xml";
const stylesPath = "android/app/src/main/res/values/styles.xml";
const autofillHintsXmlPath = "android/app/src/main/res/xml/autofill_hints.xml";

/**
 * Find every MainActivity.java under android/app/src/main/java, regardless of
 * which package folder Capacitor / Android Studio happened to put it in.
 */
function findMainActivities(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...findMainActivities(full));
    else if (entry === "MainActivity.java") out.push(full);
  }
  return out;
}

function removeEmptyDirsUp(dir, stopAt) {
  let cur = dir;
  while (cur && cur.startsWith(stopAt) && cur !== stopAt) {
    try {
      if (existsSync(cur) && readdirSync(cur).length === 0) {
        rmdirSync(cur);
        cur = dirname(cur);
      } else break;
    } catch {
      break;
    }
  }
}

/**
 * Make sure MainActivity.java sits at the package path that matches
 * build.gradle's `namespace` / `applicationId` (= com.zhstudio.bossify).
 * If it's at a different package path (e.g. com/bossify/app/), move it and
 * rewrite its `package` declaration. This is the root cause of the
 * "ClassNotFoundException: com.zhstudio.bossify.MainActivity" crash.
 */
function patchMainActivityPackage() {
  if (!existsSync(javaRoot)) {
    console.warn(`Skipped: ${javaRoot} not found. Run 'npx cap add android' first.`);
    return;
  }

  const expectedDir = join(javaRoot, ...APP_ID.split("."));
  const expectedFile = join(expectedDir, "MainActivity.java");

  const found = findMainActivities(javaRoot);
  if (found.length === 0) {
    console.warn("Skipped: no MainActivity.java found anywhere under android/app/src/main/java.");
    return;
  }

  // Pick the first one (there is normally only one).
  const current = found[0];

  // Rewrite the package declaration regardless of location.
  let src = readFileSync(current, "utf8");
  const newPackageLine = `package ${APP_ID};`;
  if (/^\s*package\s+[^;]+;/m.test(src)) {
    src = src.replace(/^\s*package\s+[^;]+;/m, newPackageLine);
  } else {
    src = `${newPackageLine}\n\n${src}`;
  }

  if (current === expectedFile) {
    writeFileSync(current, src);
    console.log(`MainActivity already at correct package path: ${current}`);
    return;
  }

  // Move it.
  mkdirSync(expectedDir, { recursive: true });
  writeFileSync(expectedFile, src);

  // Delete the old file and clean up empty parent dirs up to javaRoot.
  try {
    const oldDir = dirname(current);
    unlinkSync(current);
    removeEmptyDirsUp(oldDir, javaRoot);
  } catch (e) {
    console.warn(`Warning: could not fully clean up old MainActivity location: ${e.message}`);
  }

  console.log(`Moved MainActivity:\n  from ${current}\n  to   ${expectedFile}`);
  console.log(`Rewrote package declaration to: ${APP_ID}`);
}

/**
 * Force-enable autofill on the Capacitor WebView so Google Password Manager
 * can detect and fill <input type="email"> / <input type="password"> fields
 * inside the bundled web app.
 */
function patchMainActivityAutofill() {
  const expectedDir = join(javaRoot, ...APP_ID.split("."));
  const expectedFile = join(expectedDir, "MainActivity.java");
  if (!existsSync(expectedFile)) {
    console.warn(`Skipped autofill patch: ${expectedFile} not found.`);
    return;
  }
  let src = readFileSync(expectedFile, "utf8");

  if (src.includes("setImportantForAutofill")) {
    console.log("Autofill already patched in MainActivity.java");
    return;
  }

  const imports = [
    "import android.os.Build;",
    "import android.os.Bundle;",
    "import android.view.View;",
    "import android.webkit.WebView;",
  ];
  for (const imp of imports) {
    if (!src.includes(imp)) {
      src = src.replace(/(package\s+[^;]+;\s*)/, `$1\n${imp}\n`);
    }
  }

  const overrideBlock = `
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Enable Android Autofill / Google Password Manager inside the WebView.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WebView webView = this.bridge != null ? this.bridge.getWebView() : null;
      if (webView != null) {
        webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
      }
    }
  }
`;

  src = src.replace(/public class MainActivity extends BridgeActivity\s*\{\s*/, (m) => m + overrideBlock);
  writeFileSync(expectedFile, src);
  console.log("Patched MainActivity.java to enable WebView autofill.");
}

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

  const activityTag = activityMatch[0].replace(/\sandroid:screenOrientation="[^"]*"/g, "");
  manifest = manifest.replace(activityMatch[0], activityTag);

  // Ensure <application> has android:allowBackup="true" so Google Password
  // Manager / Android Autofill can persist saved credentials.
  manifest = manifest.replace(
    /<application\b([^>]*)>/,
    (_full, attrs) => {
      let a = attrs;
      if (!/android:allowBackup=/.test(a)) a += ' android:allowBackup="true"';
      else a = a.replace(/android:allowBackup="[^"]*"/, 'android:allowBackup="true"');
      return `<application${a}>`;
    },
  );

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
    /<item name="windowSplashScreenAnimatedIcon">[^<]*<\/item>\s*/g,
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

/**
 * Marker resource that signals to Android that this app participates in the
 * Autofill framework. Required so Google Password Manager can attach to the
 * Capacitor WebView's input fields on first launch.
 */
function writeAutofillHintsXml() {
  if (!existsSync("android/app/src/main/res")) {
    console.warn("Skipped autofill_hints.xml: android/app/src/main/res not found.");
    return;
  }
  const xmlDir = dirname(autofillHintsXmlPath);
  if (!existsSync(xmlDir)) mkdirSync(xmlDir, { recursive: true });
  const contents =
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<autofill-service xmlns:android="http://schemas.android.com/apk/res/android"/>\n';
  writeFileSync(autofillHintsXmlPath, contents);
  console.log(`Wrote ${autofillHintsXmlPath}`);
}

patchManifest();
patchStyles();
patchMainActivityPackage();
patchMainActivityAutofill();
writeAutofillHintsXml();
console.log("Bossify Android patch applied.");