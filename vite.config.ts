// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig as defineLovableConfig } from "@lovable.dev/vite-tanstack-config";

export default defineLovableConfig({
  tanstackStart: {
    spa: {
      enabled: true,
      prerender: {
        outputPath: "/",
      },
    },
  },
  vite: {
    ssr: {
      noExternal: ["h3-v2", "h3"],
    },
    environments: {
      server: {
        build: {
          rollupOptions: {
            output: {
              // Cloudflare Worker has no runtime module resolution — keep
              // the worker as a single file by disabling code-splitting.
              inlineDynamicImports: true,
            },
          },
        },
        resolve: {
          // h3-v2 is an npm alias (npm:h3@...) that the default SSR
          // externalizer doesn't bundle into the worker. Force it inline.
          noExternal: ["h3-v2", "h3"],
        },
      },
    },
  },
});
