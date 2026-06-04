/**
 * Generate a static dist/client/index.html shell for Capacitor (offline
 * Android APK). The TanStack Start build does NOT emit an index.html when
 * SPA prerender is disabled — but `npx cap sync android` requires one,
 * otherwise it errors with "Could not find the web assets directory:
 * ./dist/client" and the APK never updates with new web changes.
 *
 * This script:
 *   1. Ensures dist/client exists. If the builder placed static files in
 *      .output/public instead, copy them into dist/client for Capacitor.
 *   2. Finds the client entry chunk via the TanStack Start manifest in
 *      dist/server/_tanstack-start-manifest_v-*.mjs (the __root__ route's
 *      first preload).
 *   3. Finds the built stylesheet under dist/client/assets/*.css.
 *   4. Writes dist/client/index.html — a minimal shell that loads both,
 *      mirroring the prepaint splash from src/routes/__root.tsx so the
 *      Android app shows the Bossify splash instead of a white flash.
 *
 * Run it AFTER `npm run build` and BEFORE `npx cap sync android`.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const clientDir = "dist/client";
const serverDir = "dist/server";
const fallbackPublicDir = ".output/public";

if (!existsSync(clientDir)) {
  if (existsSync(fallbackPublicDir)) {
    mkdirSync(clientDir, { recursive: true });
    cpSync(fallbackPublicDir, clientDir, { recursive: true });
    console.log(`[generate-spa-html] Copied ${fallbackPublicDir} -> ${clientDir}`);
  } else {
    console.error(`[generate-spa-html] Missing ${clientDir}. Run 'npm run build' first.`);
    process.exit(1);
  }
}

// 1. Find the client entry chunk via the start manifest.
const manifestFile = readdirSync(serverDir).find((f) =>
  /^_tanstack-start-manifest_v-.*\.mjs$/.test(f),
);
if (!manifestFile) {
  console.error(`[generate-spa-html] Could not find tanstack start manifest in ${serverDir}.`);
  process.exit(1);
}
const manifestSrc = readFileSync(join(serverDir, manifestFile), "utf8");
const rootPreloadMatch = manifestSrc.match(/__root__:\s*\{[^}]*preloads:\s*\[\s*"([^"]+\.js)"/);
if (!rootPreloadMatch) {
  console.error("[generate-spa-html] Could not parse __root__ preloads from manifest.");
  process.exit(1);
}
const entryHref = rootPreloadMatch[1]; // e.g. /assets/index-XXXX.js

// 2. Find the stylesheet.
const assetsDir = join(clientDir, "assets");
const cssFile = readdirSync(assetsDir).find((f) => f.endsWith(".css"));
if (!cssFile) {
  console.error(`[generate-spa-html] No CSS file found in ${assetsDir}.`);
  process.exit(1);
}
const cssHref = `/assets/${cssFile}`;

// 3. Compose the shell. The prepaint markup mirrors src/routes/__root.tsx so
//    the Android app shows the Bossify splash background before React mounts.
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
    <meta name="theme-color" content="#F4F3F8" />
    <meta name="google" content="notranslate" />
    <title>Bossify</title>
    <meta name="description" content="Bossify — order & payment app for Malaysian WhatsApp sellers." />
    <link rel="stylesheet" href="${cssHref}" />
    <link rel="modulepreload" href="${entryHref}" />
    <style>
      html, body { background-color: #F4F3F8 !important; margin: 0; }
      #bossify-prepaint {
        position: fixed; inset: 0; z-index: 0;
        background-color: #F4F3F8;
        display: flex; align-items: center; justify-content: center;
        pointer-events: none;
      }
      #bossify-prepaint p {
        margin: 16px 0 0; font-weight: 800; font-size: 28px;
        color: #1E1333; letter-spacing: -0.02em;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      #bossify-prepaint .col { display: flex; flex-direction: column; align-items: center; }
      body.bossify-mounted #bossify-prepaint { display: none; }
    </style>
  </head>
  <body style="background-color:#F4F3F8">
    <div id="bossify-prepaint" aria-hidden="true">
      <div class="col"><p>Bossify</p></div>
    </div>
    <script type="module" src="${entryHref}"></script>
  </body>
</html>
`;

writeFileSync(join(clientDir, "index.html"), html);
console.log(`[generate-spa-html] Wrote ${clientDir}/index.html`);
console.log(`  entry: ${entryHref}`);
console.log(`  css:   ${cssHref}`);