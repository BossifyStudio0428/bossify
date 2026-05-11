import { createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";

const getAdmin = createServerOnlyFn(async () =>
  (await import("@/integrations/supabase/client.server")).supabaseAdmin,
);
const getSendToTokens = createServerOnlyFn(async () =>
  (await import("@/lib/fcm.server")).sendToTokens,
);

export const Schema = z.object({
  targetUserId: z.string().uuid().optional(),
  broadcast: z.boolean().optional(),
  kind: z.enum([
    "new_order",
    "low_stock",
    "milestone",
    "morning_summary",
    "unpaid_reminder",
    "closing_report",
    "custom",
  ]),
  title: z.string().min(1).max(120).optional(),
  body: z.string().min(1).max(300).optional(),
  link: z.string().min(1).max(200).optional(),
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-cron-secret",
} as const;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function resolveContent(
  userId: string,
  kind: z.infer<typeof Schema>["kind"],
  override: { title?: string; body?: string; link?: string },
): Promise<{ title: string; body: string; link: string; allowed: boolean }> {
  const supabaseAdmin = await getAdmin();
  const { data: prefs } = await supabaseAdmin
    .from("profiles")
    .select(
      "notif_new_order,notif_unpaid,notif_inventory,notif_morning,notif_evening,notif_milestone",
    )
    .eq("id", userId)
    .maybeSingle();

  const p = (prefs ?? {}) as Record<string, boolean | null>;
  const allowed = (() => {
    switch (kind) {
      case "new_order": return p.notif_new_order !== false;
      case "unpaid_reminder": return p.notif_unpaid !== false;
      case "low_stock": return p.notif_inventory !== false;
      case "morning_summary": return p.notif_morning !== false;
      case "closing_report": return p.notif_evening !== false;
      case "milestone": return p.notif_milestone !== false;
      default: return true;
    }
  })();

  let title = override.title ?? "Bossify";
  let body = override.body ?? "";
  let link = override.link ?? "/";

  if (!override.title || !override.body) {
    if (kind === "morning_summary") {
      const since = new Date(Date.now() - 86400000).toISOString();
      const { count } = await supabaseAdmin
        .from("orders").select("id", { count: "exact", head: true })
        .eq("user_id", userId).gte("created_at", since);
      title = "Good morning, Boss! ☀️";
      body = `You had ${count ?? 0} orders yesterday. Let's smash today!`;
      link = "/";
    } else if (kind === "unpaid_reminder") {
      const { count } = await supabaseAdmin
        .from("orders").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("status", "Unpaid");
      title = "Payment Reminder ⚠️";
      body = `You have ${count ?? 0} unpaid orders to follow up.`;
      link = "/orders";
    } else if (kind === "closing_report") {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data: rows } = await supabaseAdmin
        .from("orders").select("amount")
        .eq("user_id", userId).gte("created_at", today.toISOString());
      const total = (rows ?? []).reduce(
        (s: number, r: { amount?: number | null }) => s + Number(r.amount ?? 0),
        0,
      );
      title = "Closing Report 🌙";
      body = `Today: ${rows?.length ?? 0} orders · RM ${total.toFixed(2)}`;
      link = "/reports";
    }
  }

  return { title, body, link, allowed };
}

async function dispatch(userId: string, content: { title: string; body: string; link: string }) {
  const supabaseAdmin = await getAdmin();
  const sendToTokens = await getSendToTokens();
  const { data: rows } = await supabaseAdmin
    .from("device_tokens").select("token").eq("user_id", userId);
  const tokens = (rows ?? []).map((r: { token: string }) => r.token);
  if (tokens.length === 0) return { sent: 0, removed: 0 };
  const results = await sendToTokens(tokens, content);
  const dead = results.filter((r) => r.invalid).map((r) => r.token);
  if (dead.length > 0) {
    await supabaseAdmin.from("device_tokens").delete().in("token", dead);
  }
  return { sent: results.filter((r) => r.ok).length, removed: dead.length };
}

export const handleSendPush = createServerOnlyFn(async (request: Request): Promise<Response> => {
  const supabaseAdmin = await getAdmin();
  let parsed: z.infer<typeof Schema>;
  try {
    parsed = Schema.parse(await request.json());
  } catch (e) {
    return json(400, { error: "Invalid request", detail: (e as Error).message });
  }

  const cronSecret = request.headers.get("x-cron-secret");
  const expected = process.env.PUSH_WEBHOOK_SECRET;
  const isCron = !!expected && cronSecret === expected;

  let callerId: string | null = null;
  if (!isCron) {
    const auth = request.headers.get("Authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return json(401, { error: "Unauthorized" });
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return json(401, { error: "Invalid token" });
    callerId = data.user.id;
  }

  try {
    if (parsed.broadcast) {
      if (!isCron) return json(403, { error: "Broadcast requires cron secret" });
      const { data: users } = await supabaseAdmin
        .from("device_tokens").select("user_id");
      const uniq = Array.from(
        new Set((users ?? []).map((r: { user_id: string }) => r.user_id)),
      ) as string[];
      let totalSent = 0, totalRemoved = 0, skipped = 0;
      for (const uid of uniq) {
        const c = await resolveContent(uid, parsed.kind, parsed);
        if (!c.allowed) { skipped++; continue; }
        const r = await dispatch(uid, c);
        totalSent += r.sent;
        totalRemoved += r.removed;
      }
      return json(200, { ok: true, users: uniq.length, sent: totalSent, removed: totalRemoved, skipped });
    }

    const userId = parsed.targetUserId ?? callerId!;
    if (!isCron && userId !== callerId) {
      return json(403, { error: "Can only target self" });
    }
    const c = await resolveContent(userId, parsed.kind, parsed);
    if (!c.allowed) return json(200, { ok: true, skipped: true });
    const r = await dispatch(userId, c);
    return json(200, { ok: true, ...r });
  } catch (e) {
    console.error("send-push failed", e);
    return json(500, { error: (e as Error).message });
  }
});

export const CORS_HEADERS = CORS;