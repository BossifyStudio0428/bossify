// Supabase Edge Function: send-push
// Sends FCM push notifications. Auth: caller bearer token OR x-cron-secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FCM_SERVICE_ACCOUNT_JSON = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
const PUSH_WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-cron-secret",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------- FCM HTTP v1 ----------
type ServiceAccount = {
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  token_uri: string;
};
let cachedAccount: ServiceAccount | null = null;
let cachedToken: { token: string; exp: number } | null = null;

function getAccount(): ServiceAccount {
  if (cachedAccount) return cachedAccount;
  if (!FCM_SERVICE_ACCOUNT_JSON) throw new Error("FCM_SERVICE_ACCOUNT_JSON not set");
  cachedAccount = JSON.parse(FCM_SERVICE_ACCOUNT_JSON) as ServiceAccount;
  return cachedAccount;
}

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") bytes = new TextEncoder().encode(input);
  else if (input instanceof Uint8Array) bytes = input;
  else bytes = new Uint8Array(input);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const acc = getAccount();
  const header = { alg: "RS256", typ: "JWT", kid: acc.private_key_id };
  const claims = {
    iss: acc.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: acc.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(acc.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;
  const res = await fetch(acc.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`FCM token error ${res.status}: ${await res.text()}`);
  const j = await res.json() as { access_token: string; expires_in: number };
  cachedToken = { token: j.access_token, exp: now + j.expires_in };
  return j.access_token;
}

type SendResult = { token: string; ok: boolean; invalid?: boolean; error?: string };

async function sendToTokens(
  tokens: string[],
  payload: { title: string; body: string; link?: string },
): Promise<SendResult[]> {
  if (tokens.length === 0) return [];
  const acc = getAccount();
  const at = await getAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${acc.project_id}/messages:send`;
  return await Promise.all(tokens.map(async (token) => {
    const message = {
      message: {
        token,
        notification: { title: payload.title, body: payload.body },
        data: { link: payload.link ?? "/" },
        android: {
          priority: "HIGH",
          notification: { sound: "default", channel_id: "bossify_default" },
        },
      },
    };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      if (res.ok) return { token, ok: true };
      const text = await res.text();
      const invalid = res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(text);
      return { token, ok: false, error: text.slice(0, 200), invalid };
    } catch (e) {
      return { token, ok: false, error: (e as Error).message };
    }
  }));
}

// ---------- Content resolution ----------
type Kind =
  | "new_order" | "low_stock" | "milestone" | "morning_summary"
  | "unpaid_reminder" | "closing_report" | "custom";

async function resolveContent(
  userId: string,
  kind: Kind,
  override: { title?: string; body?: string; link?: string },
) {
  const { data: prefs } = await admin
    .from("profiles")
    .select("notif_new_order,notif_unpaid,notif_inventory,notif_morning,notif_evening,notif_milestone")
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
      const { count } = await admin.from("orders").select("id", { count: "exact", head: true })
        .eq("user_id", userId).gte("created_at", since);
      title = "Good morning, Boss! ☀️";
      body = `You had ${count ?? 0} orders yesterday. Let's smash today!`;
      link = "/";
    } else if (kind === "unpaid_reminder") {
      const { count } = await admin.from("orders").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("status", "Unpaid");
      title = "Payment Reminder ⚠️";
      body = `You have ${count ?? 0} unpaid orders to follow up.`;
      link = "/orders";
    } else if (kind === "closing_report") {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data: rows } = await admin.from("orders").select("amount")
        .eq("user_id", userId).gte("created_at", today.toISOString());
      const total = (rows ?? []).reduce((s: number, r: { amount?: number | null }) => s + Number(r.amount ?? 0), 0);
      title = "Closing Report 🌙";
      body = `Today: ${rows?.length ?? 0} orders · RM ${total.toFixed(2)}`;
      link = "/reports";
    }
  }
  return { title, body, link, allowed };
}

async function dispatch(userId: string, content: { title: string; body: string; link: string }) {
  const { data: rows } = await admin.from("device_tokens").select("token").eq("user_id", userId);
  const tokens = (rows ?? []).map((r: { token: string }) => r.token);
  if (tokens.length === 0) return { sent: 0, removed: 0 };
  const results = await sendToTokens(tokens, content);
  const dead = results.filter((r) => r.invalid).map((r) => r.token);
  if (dead.length > 0) {
    await admin.from("device_tokens").delete().in("token", dead);
  }
  return { sent: results.filter((r) => r.ok).length, removed: dead.length };
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let parsed: {
    targetUserId?: string;
    broadcast?: boolean;
    kind: Kind;
    title?: string;
    body?: string;
    link?: string;
  };
  try {
    parsed = await req.json();
    if (!parsed?.kind) return json(400, { error: "Missing kind" });
  } catch (e) {
    return json(400, { error: "Invalid JSON", detail: (e as Error).message });
  }

  const cronSecret = req.headers.get("x-cron-secret");
  const apiKey = req.headers.get("apikey");
  const isCron =
    (!!PUSH_WEBHOOK_SECRET && cronSecret === PUSH_WEBHOOK_SECRET) ||
    (!!ANON_KEY && apiKey === ANON_KEY);

  let callerId: string | null = null;
  if (!isCron) {
    const auth = req.headers.get("Authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return json(401, { error: "Unauthorized" });
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return json(401, { error: "Invalid token" });
    callerId = data.user.id;
  }

  try {
    if (parsed.broadcast) {
      if (!isCron) return json(403, { error: "Broadcast requires cron secret" });
      const { data: users } = await admin.from("device_tokens").select("user_id");
      const uniq = Array.from(new Set((users ?? []).map((r: { user_id: string }) => r.user_id))) as string[];
      let totalSent = 0, totalRemoved = 0, skipped = 0;
      for (const uid of uniq) {
        const c = await resolveContent(uid, parsed.kind, parsed);
        if (!c.allowed) { skipped++; continue; }
        const r = await dispatch(uid, c);
        totalSent += r.sent; totalRemoved += r.removed;
      }
      return json(200, { ok: true, users: uniq.length, sent: totalSent, removed: totalRemoved, skipped });
    }

    const userId = parsed.targetUserId ?? callerId!;
    if (!isCron && userId !== callerId) return json(403, { error: "Can only target self" });
    const c = await resolveContent(userId, parsed.kind, parsed);
    if (!c.allowed) return json(200, { ok: true, skipped: true });
    const r = await dispatch(userId, c);
    return json(200, { ok: true, ...r });
  } catch (e) {
    console.error("send-push failed", e);
    return json(500, { error: (e as Error).message });
  }
});