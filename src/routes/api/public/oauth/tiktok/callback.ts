import { createFileRoute } from "@tanstack/react-router";
import { externalSupabaseAdmin as supabaseAdmin } from "@/integrations/supabase/external-admin.server";
import { verifyOAuthState } from "@/lib/platforms/oauth-state.server";
import { exchangeTikTokCode, getTikTokAuthorizedShops } from "@/lib/platforms/tiktok.server";
import { encryptToken } from "@/lib/platforms/crypto.server";

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlResponse(title: string, body: string, status = 200, backHref = "/profile", autoRedirect?: string): Response {
  const safeTitle = escHtml(title);
  const safeBody = escHtml(body);
  const meta = autoRedirect ? `<meta http-equiv="refresh" content="0;url=${escHtml(autoRedirect)}">` : "";
  return new Response(
    `<!doctype html><meta charset=utf-8><title>${safeTitle}</title>${meta}` +
      `<meta name=viewport content="width=device-width,initial-scale=1">` +
      `<style>body{font-family:system-ui;padding:40px 24px;max-width:480px;margin:auto;text-align:center;font-size:19px;line-height:1.5}` +
      `h1{font-size:26px;margin-bottom:16px}` +
      `p{margin:16px 0}` +
      `a{display:inline-block;margin-top:20px;font-size:20px;font-weight:700;color:#7C3AED;text-decoration:none}</style>` +
      `<h1>${safeTitle}</h1><p>${safeBody}</p>` +
      `<p><a href="${escHtml(backHref)}">Back to Bossify</a></p>`,
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

        let userId: string | undefined;
        let mode: "connect" | "login" = "connect";
        try {
          const payload = verifyOAuthState(state);
          if (payload.platform !== "tiktok") throw new Error("Platform mismatch");
          mode = payload.mode ?? "connect";
          if (mode === "connect") {
            if (!payload.userId) throw new Error("Missing userId for connect flow");
            userId = payload.userId;
          }
        } catch (e) {
          return htmlResponse(
            "Connect failed",
            `Invalid or expired authorization. Please try connecting again.`,
            400
          );
        }

        let loginEmail: string | null = null;
        let loginCode: string | null = null;

        try {
          const tok = await exchangeTikTokCode(code);
          const expiresAt = new Date(Date.now() + tok.access_token_expire_in * 1000).toISOString();

          // App Review is approved (confirmed 2026-09-07), so the
          // "seller.shop.info" scope is active — we can resolve the real
          // shop_id + shop_cipher right here instead of waiting for the
          // webhook to backfill it. shop_cipher is required for every
          // subsequent Order/Finance API call.
          let shopId: string | null = null;
          let shopCipher: string | null = null;
          let shopName = tok.seller_name ?? null;
          let shopFetchError: string | null = null;
          try {
            const shops = await getTikTokAuthorizedShops(tok.access_token);
            const shop = shops[0]; // Bossify authorizes one shop per connection today.
            if (shop) {
              shopId = shop.id;
              shopCipher = shop.cipher ?? null;
              shopName = shop.name ?? shopName;
            } else {
              shopFetchError = "getTikTokAuthorizedShops returned an empty shop list";
            }
          } catch (e) {
            // Non-fatal: connection still works, webhook can backfill
            // shop_id (but not cipher) from the first inbound event as
            // a fallback if this call fails for some reason.
            shopFetchError = e instanceof Error ? e.message : String(e);
            console.error("[tiktok oauth callback] getTikTokAuthorizedShops failed", e);
          }

          if (mode === "login") {
            if (!shopId) {
              return htmlResponse(
                "Login failed",
                "Could not identify your TikTok Shop. Please try again.",
                500
              );
            }
            // Find an existing Bossify account already linked to this
            // exact shop_id (any user) — otherwise create a brand-new
            // account tied to this shop. The email is synthetic (TikTok
            // never gives us a real one); there is no password — the
            // seller authenticates by re-doing this TikTok authorization
            // each time, or later resetting a real password from Profile.
            const { data: existingConn } = await supabaseAdmin
              .from("platform_connections" as any)
              .select("user_id")
              .eq("platform", "tiktok")
              .eq("platform_shop_id", shopId)
              .maybeSingle();

            if ((existingConn as any)?.user_id) {
              userId = (existingConn as any).user_id;
              const { data: userRec } = await supabaseAdmin.auth.admin.getUserById(userId!);
              loginEmail = userRec?.user?.email ?? null;
            }
            if (!userId) {
              loginEmail = `shop-${shopId}@tiktok.bossifystudio.workers.dev`;
              const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
                email: loginEmail,
                email_confirm: true,
                user_metadata: { source: "tiktok_shop_login", tiktok_shop_id: shopId, tiktok_shop_name: shopName },
              });
              if (createErr || !created?.user) {
                throw new Error(createErr?.message || "Could not create account");
              }
              userId = created.user.id;
            }

            // One-time login code the seller types back into the app —
            // avoids needing native deep-link plumbing entirely, reusing
            // the exact same OTP-entry flow email login already uses.
            // NOTE: this relies on Supabase Admin's generateLink returning
            // `email_otp` — unverified against this project's live
            // Supabase version; if it's missing, login will need the
            // magic link fallback instead (flagged for real-device testing).
            const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
              type: "magiclink",
              email: loginEmail!,
            });
            if (linkErr) throw new Error(linkErr.message);
            loginCode = (linkData as any)?.properties?.email_otp ?? null;
          }

          const { error } = await supabaseAdmin
            .from("platform_connections" as any)
            .upsert(
              {
                user_id: userId,
                platform: "tiktok",
                platform_shop_id: shopId,
                platform_shop_cipher: shopCipher,
                platform_shop_name: shopName,
                access_token_encrypted: encryptToken(tok.access_token),
                refresh_token_encrypted: encryptToken(tok.refresh_token),
                token_expires_at: expiresAt,
                status: "active",
                last_error: shopFetchError,
              },
              { onConflict: "user_id,platform" }
            );
          if (error) throw new Error(error.message);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return htmlResponse(mode === "login" ? "Login failed" : "Connect failed", msg, 500);
        }

        if (mode === "login") {
          if (!loginCode) {
            return htmlResponse(
              "Almost there",
              `Your TikTok Shop is linked, but we couldn't generate a one-time code automatically. ` +
                `Go back to Bossify and use "Forgot password" with this email to sign in: ${loginEmail}`
            );
          }
          const webFallback = `/auth?tiktok_email=${encodeURIComponent(loginEmail!)}&tiktok_code=${encodeURIComponent(loginCode)}`;
          const appDeepLink = `bossify://tiktok-login?email=${encodeURIComponent(loginEmail!)}&code=${encodeURIComponent(loginCode)}`;
          return htmlResponse(
            "Logging you in…",
            `If this doesn't close automatically, tap "Back to Bossify" — your email and code will already be filled in.`,
            200,
            webFallback,
            appDeepLink
          );
        }

        return htmlResponse(
          "TikTok Shop connected!",
          "Your TikTok Shop is now linked to Bossify. Orders will sync automatically."
        );
      },
    },
  },
});