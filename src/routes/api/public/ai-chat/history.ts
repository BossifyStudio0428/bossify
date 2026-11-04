import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Plain HTTP route (not createServerFn) — see send.ts for why. Same
// bearer-token pattern as api/public/stripe/checkout.ts.

const EXTERNAL_SUPABASE_URL = "https://knouahqwazerjiyiqgmh.supabase.co";
const EXTERNAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtub3VhaHF3YXplcmppeWlxZ21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjgzNDEsImV4cCI6MjA5Mjk0NDM0MX0.VF6SsKKhnAZ9vbD1HeH3KoEpt_XYdjTJqITGBSg3yjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function authFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;
  const sb = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return { supabase: sb, userId: data.user.id };
}

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; created_at: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchHistory(supabase: any, userId: string): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from("ai_chat_messages")
    .select("id,role,content,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []) as ChatMessage[];
}

export const Route = createFileRoute("/api/public/ai-chat/history")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { headers: CORS }),
      GET: async ({ request }) => {
        const auth = await authFromRequest(request);
        if (!auth) return json(401, { error: "Unauthorized" });
        const history = await fetchHistory(auth.supabase, auth.userId);
        return json(200, { history });
      },
      DELETE: async ({ request }) => {
        const auth = await authFromRequest(request);
        if (!auth) return json(401, { error: "Unauthorized" });
        const { error } = await auth.supabase.from("ai_chat_messages").delete().eq("user_id", auth.userId);
        if (error) return json(500, { error: error.message });
        return json(200, { ok: true });
      },
    },
  },
});