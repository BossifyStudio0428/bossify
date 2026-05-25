import { createFileRoute } from "@tanstack/react-router";
import { externalSupabaseAdmin as supabaseAdmin } from "@/integrations/supabase/external-admin.server";
import { verifyOAuthState } from "@/lib/platforms/oauth-state.server";
import { exchangeTikTokCode } from "@/lib/platforms/tiktok.server";
import { encryptToken } from "@/lib/platforms/crypto.server";

function htmlResponse(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><meta charset=utf-8><title>${title}</title>` +
      `<style>body{font-family:system-ui;padding:32px;max-width:480px;margin:auto;text-align:center}</style>` +
      `<h1>${title}</h1><p>${body}</p>` +
      `<p><a href="/profile">Back to Bossify</a></p>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export const Route = createFileRoute("/api/public/oauth/tiktok/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (!code || !state) {
          return htmlResponse("Connect failed", "Missing code or state from TikTok.", 400);
        }

        let userId: string;
        try {
          const payload = verifyOAuthState(state);
          if (payload.platform !== "tiktok") throw new Error("Platform mismatch");
          userId = payload.userId;
        } catch (e) {
          return htmlResponse(
            "Connect failed",
            `Invalid or expired authorization. Please try connecting again.`,
            400
          );
        }

        try {
          const tok = await exchangeTikTokCode(code);
          const expiresAt = new Date(Date.now() + tok.access_token_expire_in * 1000).toISOString();

          const { error } = await supabaseAdmin
            .from("platform_connections" as any)
            .upsert(
              {
                user_id: userId,
                platform: "tiktok",
                platform_shop_id: tok.open_id,
                platform_shop_name: tok.seller_name ?? null,
                access_token_encrypted: encryptToken(tok.access_token),
                refresh_token_encrypted: encryptToken(tok.refresh_token),
                token_expires_at: expiresAt,
                status: "active",
                last_error: null,
              },
              { onConflict: "user_id,platform" }
            );
          if (error) throw new Error(error.message);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return htmlResponse("Connect failed", msg, 500);
        }

        return htmlResponse(
          "TikTok Shop connected!",
          "Your TikTok Shop is now linked to Bossify. Orders will sync automatically."
        );
      },
    },
  },
});