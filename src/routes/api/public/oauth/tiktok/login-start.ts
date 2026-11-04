import { createFileRoute } from "@tanstack/react-router";
import { signOAuthState } from "@/lib/platforms/oauth-state.server";
import { buildTikTokAuthUrl } from "@/lib/platforms/tiktok.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS },
  });
}

function getAppOrigin(): string {
  return (
    process.env.APP_PUBLIC_URL ||
    process.env.VITE_APP_PUBLIC_URL ||
    "https://tanstack-start-app.bossifystudio.workers.dev"
  );
}

/**
 * "Log in with TikTok Shop" — deliberately public (no existing session
 * required), unlike /api/platforms/connect which needs a logged-in user.
 * The callback will find-or-create a Bossify account tied to the TikTok
 * shop_id once the seller authorizes.
 */
export const Route = createFileRoute("/api/public/oauth/tiktok/login-start")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async () => {
        const state = signOAuthState({ platform: "tiktok", mode: "login" });
        const origin = getAppOrigin();
        const redirectUri = `${origin}/api/public/oauth/tiktok/callback`;
        const authUrl = buildTikTokAuthUrl({ state, redirectUri });
        return json(200, { ok: true, authUrl });
      },
    },
  },
});