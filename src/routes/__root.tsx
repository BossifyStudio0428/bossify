import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
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

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#F4F3F8" },
      { name: "google", content: "notranslate" },
      { title: "Bossify" },
      { name: "description", content: "Bossify — order & payment app for Malaysian WhatsApp sellers. Track orders, payments, inventory & customers. React + Supabase. English, BM & Chinese." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Bossify" },
      { property: "og:description", content: "Bossify — order & payment app for Malaysian WhatsApp sellers. Track orders, payments, inventory & customers. React + Supabase. English, BM & Chinese." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Bossify" },
      { name: "twitter:description", content: "Bossify — order & payment app for Malaysian WhatsApp sellers. Track orders, payments, inventory & customers. React + Supabase. English, BM & Chinese." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9734b75e-f861-4dba-b5c6-dc7c548a69d7/id-preview-38e0a08e--db91ee30-ba9c-4741-9a03-2d8ed9ec2d81.lovable.app-1777450424073.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9734b75e-f861-4dba-b5c6-dc7c548a69d7/id-preview-38e0a08e--db91ee30-ba9c-4741-9a03-2d8ed9ec2d81.lovable.app-1777450424073.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body style={{ backgroundColor: "#F4F3F8" }}>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return <AppShell />;
}
