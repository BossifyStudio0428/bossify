/**
 * Generate a static dist/client/index.html shell for Capacitor (offline
 * Android APK). The TanStack Start build does NOT emit an index.html when
 * SPA prerender is disabled — but `npx cap sync android` requires one,
 * otherwise it errors with "Could not find the web assets directory:
 * ./dist/client" and the APK never updates with new web changes.
 *
 * This script:
 *   1. Recreates dist/client from .output/public when that build output is
 *      available. This is the static folder TanStack Start/Nitro emits locally.
 *   2. Finds the built client entry under dist/client/assets/index-*.js.
 *   3. Finds the built stylesheet under dist/client/assets/*.css.
 *   4. Writes dist/client/index.html — a minimal shell that loads both,
 *      mirroring the prepaint splash from src/routes/__root.tsx so the
 *      Android app shows the Bossify splash instead of a white flash.
 *
 * Run it AFTER `npm run build` and BEFORE `npx cap sync android`.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const clientDir = "dist/client";
const fallbackPublicDir = ".output/public";

if (existsSync(fallbackPublicDir)) {
  rmSync(clientDir, { recursive: true, force: true });
  mkdirSync(clientDir, { recursive: true });
  cpSync(fallbackPublicDir, clientDir, { recursive: true });
  console.log(`[generate-spa-html] Copied ${fallbackPublicDir} -> ${clientDir}`);
} else if (!existsSync(clientDir)) {
  console.error(`[generate-spa-html] Missing ${clientDir} and ${fallbackPublicDir}. Run 'npm run build' first.`);
  process.exit(1);
}

const assetsDir = join(clientDir, "assets");
if (!existsSync(assetsDir)) {
  console.error(`[generate-spa-html] Missing ${assetsDir}. Run 'npm run build' first.`);
  process.exit(1);
}

// 1. Find the client entry directly from built static assets. This avoids
// depending on dist/server, which is not emitted in the user's local build.
const newest = (files) => files.sort((a, b) => statSync(join(assetsDir, b)).mtimeMs - statSync(join(assetsDir, a)).mtimeMs)[0];
const assetFiles = readdirSync(assetsDir);
const indexJsFiles = assetFiles.filter((f) => /^index-[\w-]+\.js$/.test(f));
const appEntryFiles = indexJsFiles.filter((f) => {
  const src = readFileSync(join(assetsDir, f), "utf8");
  return src.includes("hydrateRoot") || src.includes("createRoot(") || src.includes("StartClient");
});
const entryFile = newest(appEntryFiles.length > 0 ? appEntryFiles : indexJsFiles);
if (!entryFile) {
  console.error(`[generate-spa-html] No client entry found in ${assetsDir}. Expected assets/index-*.js after 'npm run build'.`);
  process.exit(1);
}
const entryHref = `/assets/${entryFile}`;

// 2. Find the stylesheet.
const cssFile = readdirSync(assetsDir)
  .filter((f) => f.endsWith(".css"))
  .sort((a, b) => statSync(join(assetsDir, b)).mtimeMs - statSync(join(assetsDir, a)).mtimeMs)[0];
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
    <script>
      // TanStack Start client expects a bootstrap object on window.$_TSR
      // even in SPA mode (defaultSsr: false). Without it, hydrate() throws
      // "Expected to find bootstrap data on window.\$_TSR" and the entire
      // page renders blank inside the Android WebView. We seed a minimal
      // SPA-mode bootstrap so the router can take over client-side.
      (function () {
        if (typeof self === "undefined") return;
        if (self.$R == null) self.$R = {};
        self.$_TSR = {
          h: function () { this.hydrated = true; this.c(); },
          e: function () { this.streamEnded = true; this.c(); },
          c: function () {
            if (this.hydrated && this.streamEnded) {
              try { delete self.$_TSR; } catch (e) {}
              try { if (self.$R) delete self.$R["tsr"]; } catch (e) {}
            }
          },
          p: function (script) {
            if (!this.initialized) this.buffer.push(script);
            else script();
          },
          buffer: [],
          router: { manifest: undefined, matches: [] }
        };
      })();
      // Safety net: if the JS bundle never mounts after 12s, show a tap
      // hint instead of a silent blank page. Useful when an Android APK
      // ships a stale or broken bundle.
      setTimeout(function () {
        if (document.body.classList.contains("bossify-mounted")) return;
        var el = document.getElementById("bossify-prepaint");
        if (!el) return;
        var hint = document.createElement("p");
        hint.style.cssText =
          "margin-top:12px;font-size:13px;font-weight:500;color:#6B7280;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
        hint.textContent = "Loading… tap to retry";
        el.style.pointerEvents = "auto";
        el.onclick = function () { location.reload(); };
        el.querySelector(".col").appendChild(hint);
      }, 12000);
    </script>
    <script type="module" src="${entryHref}"></script>
  </body>
</html>
`;

writeFileSync(join(clientDir, "index.html"), html);
console.log(`[generate-spa-html] Wrote ${clientDir}/index.html`);
console.log(`  entry: ${entryHref}`);
console.log(`  css:   ${cssHref}`);