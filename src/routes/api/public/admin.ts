import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const EXTERNAL_SUPABASE_URL = "https://knouahqwazerjiyiqgmh.supabase.co";
const EXTERNAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtub3VhaHF3YXplcmppeWlxZ21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjgzNDEsImV4cCI6MjA5Mjk0NDM0MX0.VF6SsKKhnAZ9vbD1HeH3KoEpt_XYdjTJqITGBSg3yjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("overview") }),
  z.object({ action: z.literal("ai_usage") }),
  z.object({
    action: z.literal("set_plan"),
    userId: z.string().uuid(),
    months: z.union([z.number().int().min(1).max(120), z.literal("lifetime")]),
    plan: z.enum(["pro", "team_starter", "team_pro", "team_business"]).optional(),
  }),
  z.object({ action: z.literal("revoke_plan"), userId: z.string().uuid() }),
]);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...CORS,
    },
  });
}

async function getUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;

  const sb = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

export const Route = createFileRoute("/api/public/admin")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const userId = await getUserId(request);
        if (!userId) return json(401, { error: "Unauthorized" });

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: "Invalid JSON" });
        }

        const parsed = Schema.safeParse(body);
        if (!parsed.success) return json(400, { error: "Invalid request" });

        try {
          const {
            getAiUsageStatsForAdmin,
            loadAdminOverviewForUser,
            revokeAdminSubscriptionPlanForUser,
            setAdminSubscriptionPlanForUser,
          } = await import("@/lib/admin.server");

          if (parsed.data.action === "overview") {
            return json(200, await loadAdminOverviewForUser(userId));
          }
          if (parsed.data.action === "ai_usage") {
            return json(200, await getAiUsageStatsForAdmin(userId));
          }
          if (parsed.data.action === "set_plan") {
            return json(
              200,
              await setAdminSubscriptionPlanForUser(
                userId,
                parsed.data.userId,
                parsed.data.months,
                parsed.data.plan ?? "pro",
              ),
            );
          }
          return json(200, await revokeAdminSubscriptionPlanForUser(userId, parsed.data.userId));
        } catch (error) {
          if (error instanceof Response) {
            return json(error.status, { error: await error.text() });
          }
          console.error("[api/public/admin]", error);
          return json(500, { error: "Unable to load admin data" });
        }
      },
    },
  },
});
