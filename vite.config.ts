// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig as defineLovableConfig } from "@lovable.dev/vite-tanstack-config";

export default (env: { command: "build" | "serve"; mode: string }) =>
  defineLovableConfig({
    vite: {
      base: "./",
      ...(env.command === "build"
        ? {
            environments: {
              ssr: {
                resolve: {
                  // Bundle EVERYTHING into the Worker for production. The
                  // Cloudflare Worker has no runtime module resolution, so
                  // any externalized dep (e.g. `assets/react`) becomes a
                  // 500 at request time. Applying this in dev breaks SSR.
                  noExternal: true,
                },
              },
            },
          }
        : {}),
    },
    tanstackStart: {
      spa: {
        enabled: true,
        prerender: {
          outputPath: "/index",
        },
      },
    },
  })(env);
