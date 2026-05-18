// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig as defineLovableConfig } from "@lovable.dev/vite-tanstack-config";

const isBuildCommand = process.argv.slice(2).includes("build");

export default defineLovableConfig({
  tanstackStart: {
    spa: {
      enabled: true,
      prerender: {
        outputPath: "/index.html",
      },
    },
  },
  vite: {
    ssr: {
      // Cloudflare Worker has no runtime npm resolution — bundle all
      // SSR deps into the worker. The package.json uses npm: aliases
      // (h3-v2, rou3, etc.) that the default externalizer can't resolve
      // at runtime, so we must inline everything.
      // Do this only for builds: Vite's live preview SSR runner must keep
      // React externalized, otherwise React's CommonJS entry crashes with
      // `ReferenceError: module is not defined` before the app can render.
      noExternal: isBuildCommand ? true : undefined,
    },
    environments: {
      server: {
        build: {
          rollupOptions: {
            output: {
              inlineDynamicImports: true,
            },
          },
        },
      },
    },
  },
});
