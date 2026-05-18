// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig as defineLovableConfig } from "@lovable.dev/vite-tanstack-config";

const workerNoExternal = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom/server",
  "react-dom/client",
  "scheduler",
  "@tanstack/history",
  "@tanstack/react-router",
  "@tanstack/react-start",
  "@tanstack/react-start-client",
  "@tanstack/react-start-server",
  "@tanstack/react-store",
  "@tanstack/router-core",
  "@tanstack/router-utils",
  "@tanstack/start-client-core",
  "@tanstack/start-fn-stubs",
  "@tanstack/start-server-core",
  "@tanstack/start-storage-context",
  "@tanstack/store",
  "cookie-es",
  "h3-v2",
  "h3",
  "isbot",
  "pathe",
  "rou3",
  "seroval",
  "seroval-plugins",
  "srvx",
];

export default (env: { command: "build" | "serve"; mode: string }) =>
  defineLovableConfig({
    vite: {
      base: "./",
      ...(env.command === "build"
        ? {
            environments: {
              ssr: {
                resolve: {
                  // Bundle Worker runtime deps only for production builds.
                  // Applying this in dev makes Vite evaluate React's CJS entry
                  // directly and crashes SSR with `module is not defined`.
                  noExternal: workerNoExternal,
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
