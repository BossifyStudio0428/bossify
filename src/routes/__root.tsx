import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouter } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function RootErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  console.error(error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please try again.</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" },
      { name: "theme-color", content: "#F4F3F8" },
      { name: "google", content: "notranslate" },
      { title: "Bossify" },
      { name: "description", content: "Bossify — order & payment app for Malaysian WhatsApp sellers. Track orders, payments, inventory & customers. English, BM & Chinese." },
      { name: "author", content: "Lovable" },
      { property: "og:site_name", content: "Bossify" },
      { property: "og:title", content: "Bossify" },
      { property: "og:description", content: "Order & payment app for Malaysian WhatsApp sellers" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bossify-malaysia.lovable.app" },
      { property: "og:image", content: "https://bossify-malaysia.lovable.app/og-image.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:locale", content: "en_MY" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Bossify" },
      { name: "twitter:description", content: "Order & payment app for Malaysian WhatsApp sellers" },
      { name: "twitter:image", content: "https://bossify-malaysia.lovable.app/og-image.jpg" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "canonical",
        href: "https://bossify-malaysia.lovable.app",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  errorComponent: RootErrorComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {/* Pre-paint splash background + centered logo so the user never sees
            a white flash before React mounts. The real <BossifySplash />
            renders on top of this once the bundle is ready. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
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
              #bossify-prepaint .col {
                display: flex; flex-direction: column; align-items: center;
              }
              body.bossify-mounted #bossify-prepaint { display: none; }
            `,
          }}
        />
      </head>
      <body style={{ backgroundColor: "#F4F3F8" }}>
        <div id="bossify-prepaint" aria-hidden="true">
          <div className="col">
            <p>Bossify</p>
          </div>
        </div>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return <AppShell />;
}
