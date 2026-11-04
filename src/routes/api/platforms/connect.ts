import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { externalSupabaseAdmin as supabaseAdmin } from "@/integrations/supabase/external-admin.server";
import { signOAuthState } from "@/lib/platforms/oauth-state.server";
import { buildTikTokAuthUrl } from "@/lib/platforms/tiktok.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

const SUPPORTED = ["tiktok", "shopee", "lazada", "facebook", "instagram"] as const;

const ConnectSchema = z.object({
  platform: z.enum(SUPPORTED),
});

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

async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

export const Route = createFileRoute("/api/platforms/connect")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const userId = await getUserIdFromRequest(request);
        if (!userId) return json(401, { ok: false, reason: "unauthorized" });

        const url = new URL(request.url);
        const platformParam = url.searchParams.get("platform");
        const parsed = ConnectSchema.safeParse({ platform: platformParam });
        if (!parsed.success) return json(400, { ok: false, reason: "invalid_platform" });

        const { data: row, error } = await supabaseAdmin
          .from("platform_connections" as any)
          .select("platform, platform_shop_name, status, last_synced_at, last_error, connected_at")
          .eq("user_id", userId)
          .eq("platform", parsed.data.platform)
          .maybeSingle();

        if (error) return json(500, { ok: false, reason: "db_error", error: error.message });
        return json(200, { ok: true, connection: row });
      },

      POST: async ({ request }) => {
        const userId = await getUserIdFromRequest(request);
        if (!userId) return json(401, { ok: false, reason: "unauthorized" });

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, { ok: false, reason: "invalid_body" });
        }
        const parsed = ConnectSchema.safeParse(body);
        if (!parsed.success) return json(400, { ok: false, reason: "invalid_platform" });

        if (parsed.data.platform !== "tiktok") {
          return json(400, {
            ok: false,
            reason: "not_wired_up",
            message: `${parsed.data.platform} OAuth is not wired up yet.`,
          });
        }

        const state = signOAuthState({ userId, platform: parsed.data.platform });
        const origin = getAppOrigin();
        const redirectUri = `${origin}/api/public/oauth/tiktok/callback`;
        const authUrl = buildTikTokAuthUrl({ state, redirectUri });

        return json(200, { ok: true, authUrl });
      },

      DELETE: async ({ request }) => {
        const userId = await getUserIdFromRequest(request);
        if (!userId) return json(401, { ok: false, reason: "unauthorized" });

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, { ok: false, reason: "invalid_body" });
        }
        const parsed = ConnectSchema.safeParse(body);
        if (!parsed.success) return json(400, { ok: false, reason: "invalid_platform" });

        const { error } = await supabaseAdmin
          .from("platform_connections" as any)
          .delete()
          .eq("user_id", userId)
          .eq("platform", parsed.data.platform);

        if (error) return json(500, { ok: false, reason: "db_error", error: error.message });
        return json(200, { ok: true });
      },
    },
  },
});
