import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { signOAuthState } from "@/lib/platforms/oauth-state.server";
import { buildTikTokAuthUrl } from "@/lib/platforms/tiktok.server";

const SUPPORTED = ["tiktok", "shopee", "lazada", "facebook", "instagram"] as const;

function getAppOrigin(): string {
  // Prefer explicit env, otherwise fall back to the stable preview/prod URL.
  return (
    process.env.APP_PUBLIC_URL ||
    process.env.VITE_APP_PUBLIC_URL ||
    "https://bossify-malaysia.lovable.app"
  );
}

/**
 * Build a signed OAuth authorize URL for the requested platform.
 * Client opens this URL; platform redirects back to our callback route.
 */
export const startPlatformConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ platform: z.enum(SUPPORTED) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const state = signOAuthState({ userId, platform: data.platform });
    const origin = getAppOrigin();

    if (data.platform === "tiktok") {
      const redirectUri = `${origin}/api/public/oauth/tiktok/callback`;
      return { authUrl: buildTikTokAuthUrl({ state, redirectUri }) };
    }

    throw new Error(
      `${data.platform} OAuth is not wired up yet. Once we have the developer ` +
        "credentials we will enable the connect flow."
    );
  });

/**
 * Disconnect a platform: mark as revoked and clear tokens.
 * The DB trigger will sync profiles.connected_platforms automatically.
 */
export const disconnectPlatform = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ platform: z.enum(SUPPORTED) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { error } = await supabaseAdmin
      .from("platform_connections" as any)
      .delete()
      .eq("user_id", userId)
      .eq("platform", data.platform);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Read the seller's current connection status for one platform.
 */
export const getPlatformConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ platform: z.enum(SUPPORTED) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("platform_connections" as any)
      .select("platform, platform_shop_name, status, last_synced_at, last_error, connected_at")
      .eq("platform", data.platform)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { connection: row };
  });