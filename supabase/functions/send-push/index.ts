// Supabase Edge Function: send-push
// Sends FCM push notifications. Auth: caller bearer token OR x-cron-secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FCM_SERVICE_ACCOUNT_JSON = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
const PUSH_WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET");
// Bossify app data/auth lives in the external production project. The Edge
// Function may be hosted by the Lovable project, but user JWT validation and
// device_tokens reads/writes must use the same project the website logs into.
const APP_SUPABASE_URL = "https://knouahqwazerjiyiqgmh.supabase.co";
const APP_SUPABASE_ANON_KEY =
  Deno.env.get("APP_SUPABASE_ANON_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtub3VhaHF3YXplcmppeWlxZ21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjgzNDEsImV4cCI6MjA5Mjk0NDM0MX0.VF6SsKKhnAZ9vbD1HeH3KoEpt_XYdjTJqITGBSg3yjs";
const APP_SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("APP_SUPABASE_SERVICE_ROLE_KEY") ?? SERVICE_ROLE_KEY;
// CRON access must use a high-entropy server-side secret. The public anon key
// MUST NOT be accepted here — it is exposed to every browser client and would
// let any visitor broadcast push notifications.
const CRON_KEYS = new Set([PUSH_WEBHOOK_SECRET].filter(Boolean));

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-cron-secret",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// App notification data lives in the external Bossify backend.
const appAdmin = createClient(APP_SUPABASE_URL, APP_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function supabaseUrlFromIssuer(issuer: unknown): string | null {
  if (typeof issuer !== "string") return null;
  const match = issuer.match(/^(https:\/\/[a-z0-9-]+\.supabase\.co)\/auth\/v1\/?$/i);
  return match?.[1] ?? null;
}

async function getCallerIdFromBearer(token: string): Promise<string | null> {
  const issuerUrl = supabaseUrlFromIssuer(decodeJwtPayload(token)?.iss);
  let issuerAnonKey: string | null = null;
  if (issuerUrl === APP_SUPABASE_URL) issuerAnonKey = APP_SUPABASE_ANON_KEY ?? null;
  if (!issuerUrl || !issuerAnonKey) return null;

  const authClient = createClient(issuerUrl, issuerAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

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
  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(FCM_SERVICE_ACCOUNT_JSON) as ServiceAccount;
  } catch {
    throw new Error(
      "FCM_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the full Firebase service account JSON file contents (starts with '{' and includes project_id, private_key, client_email).",
    );
  }
  if (!parsed || typeof parsed !== "object" || !parsed.project_id || !parsed.private_key || !parsed.client_email) {
    throw new Error(
      "FCM_SERVICE_ACCOUNT_JSON is missing required fields (project_id, private_key, client_email). Paste the complete Firebase service account JSON.",
    );
  }
  cachedAccount = parsed;
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
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
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
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
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
  const j = (await res.json()) as { access_token: string; expires_in: number };
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
  return await Promise.all(
    tokens.map(async (token) => {
      const message = {
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data: { link: payload.link ?? "/" },
          android: {
            priority: "HIGH",
            notification: { sound: "default" },
          },
          webpush: {
            headers: { Urgency: "high" },
            notification: {
              title: payload.title,
              body: payload.body,
              icon: "/favicon.ico",
              badge: "/favicon.ico",
            },
            fcm_options: { link: payload.link ?? "/" },
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
    }),
  );
}

// ---------- Content resolution ----------
type Kind =
  | "new_order"
  | "low_stock"
  | "milestone"
  | "morning_summary"
  | "unpaid_reminder"
  | "closing_report"
  | "follow_up_reminder"
  | "custom"
  | "register_device";

type Lang = "en" | "ms" | "zh";
type Biz = "retail" | "fnb" | "education" | "beauty" | "property" | "freelance";

function fill(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

// ---- Localized templates (must mirror src/lib/notifMessages.ts) ----
const T_MORNING: Record<string, Record<Lang, { title: string; body: string }>> = {
  default: {
    en: { title: "Good morning, Boss! ☀️", body: "☀️ Yesterday: {count} orders, RM {revenue}" },
    ms: { title: "Selamat pagi, Boss! ☀️", body: "☀️ Semalam: {count} pesanan, RM {revenue}" },
    zh: { title: "早安，老板！☀️", body: "☀️ 昨日：{count} 个订单，RM {revenue}" },
  },
  education: {
    en: { title: "Good morning, Boss! ☀️", body: "☀️ Yesterday: {count} cases, RM {revenue}" },
    ms: { title: "Selamat pagi, Boss! ☀️", body: "☀️ Semalam: {count} kes, RM {revenue}" },
    zh: { title: "早安，老板！☀️", body: "☀️ 昨日：{count} 个案例，RM {revenue}" },
  },
  beauty: {
    en: { title: "Good morning, Boss! ☀️", body: "☀️ Yesterday: {count} appointments, RM {revenue}" },
    ms: { title: "Selamat pagi, Boss! ☀️", body: "☀️ Semalam: {count} temujanji, RM {revenue}" },
    zh: { title: "早安，老板！☀️", body: "☀️ 昨日：{count} 个预约，RM {revenue}" },
  },
  freelance: {
    en: { title: "Good morning, Boss! ☀️", body: "☀️ Yesterday: {count} projects, RM {revenue}" },
    ms: { title: "Selamat pagi, Boss! ☀️", body: "☀️ Semalam: {count} projek, RM {revenue}" },
    zh: { title: "早安，老板！☀️", body: "☀️ 昨日：{count} 个项目，RM {revenue}" },
  },
};
const T_CLOSING: Record<string, Record<Lang, { title: string; body: string }>> = {
  default: {
    en: { title: "Closing Report 🌙", body: "🌙 Today: {count} orders, RM {revenue}" },
    ms: { title: "Laporan Penutup 🌙", body: "🌙 Hari ini: {count} pesanan, RM {revenue}" },
    zh: { title: "今日总结 🌙", body: "🌙 今日：{count} 个订单，RM {revenue}" },
  },
  education: {
    en: { title: "Closing Report 🌙", body: "🌙 Today: {count} new cases, RM {revenue}" },
    ms: { title: "Laporan Penutup 🌙", body: "🌙 Hari ini: {count} kes baru, RM {revenue}" },
    zh: { title: "今日总结 🌙", body: "🌙 今日：{count} 个新案例，RM {revenue}" },
  },
  beauty: {
    en: { title: "Closing Report 🌙", body: "🌙 Today: {count} appointments, RM {revenue}" },
    ms: { title: "Laporan Penutup 🌙", body: "🌙 Hari ini: {count} temujanji, RM {revenue}" },
    zh: { title: "今日总结 🌙", body: "🌙 今日：{count} 个预约，RM {revenue}" },
  },
  freelance: {
    en: { title: "Closing Report 🌙", body: "🌙 Today: {count} active projects, RM {revenue}" },
    ms: { title: "Laporan Penutup 🌙", body: "🌙 Hari ini: {count} projek aktif, RM {revenue}" },
    zh: { title: "今日总结 🌙", body: "🌙 今日：{count} 个活跃项目，RM {revenue}" },
  },
};
const T_UNPAID_GENERIC: Record<Lang, { title: string; body: string }> = {
  en: { title: "Payment Reminder ⚠️", body: "⚠️ You have {count} unpaid orders to follow up." },
  ms: { title: "Peringatan Pembayaran ⚠️", body: "⚠️ Anda ada {count} pesanan belum dibayar." },
  zh: { title: "付款提醒 ⚠️", body: "⚠️ 您有 {count} 个未付订单需要跟进。" },
};
const T_FOLLOWUP: Record<Lang, { title: string; body: string }> = {
  en: { title: "📅 Follow-up Reminder", body: "📅 You have {count} follow-up(s) due today." },
  ms: { title: "📅 Peringatan Susulan", body: "📅 Anda ada {count} susulan hari ini." },
  zh: { title: "📅 跟进提醒", body: "📅 您今天有 {count} 个跟进事项。" },
};

function pickBiz<T>(pack: Record<string, T>, biz: string | null): T {
  const b = (biz ?? "retail") as Biz;
  return pack[b] ?? (b === "fnb" ? pack["retail"] : undefined) ?? pack["default"];
}

async function resolveContent(
  userId: string,
  kind: Kind,
  override: { title?: string; body?: string; link?: string },
) {
  const { data: prefs } = await appAdmin
    .from("profiles")
    .select(
      "notif_new_order,notif_unpaid,notif_inventory,notif_morning,notif_evening,notif_milestone,business_category,language",
    )
    .eq("id", userId)
    .maybeSingle();
  const p = (prefs ?? {}) as Record<string, any>;
  const biz = (p.business_category ?? null) as string | null;
  const lang = (["en", "ms", "zh"].includes(p.language) ? p.language : "en") as Lang;
  const allowed = (() => {
    switch (kind) {
      case "new_order":
        return p.notif_new_order !== false;
      case "unpaid_reminder":
        return p.notif_unpaid !== false;
      case "low_stock":
        return p.notif_inventory !== false;
      case "morning_summary":
        return p.notif_morning !== false;
      case "closing_report":
        return p.notif_evening !== false;
      case "milestone":
        return p.notif_milestone !== false;
      default:
        return true;
    }
  })();

  let title = override.title ?? "Bossify";
  let body = override.body ?? "";
  let link = override.link ?? "/";

  if (!override.title || !override.body) {
    if (kind === "morning_summary") {
      const since = new Date(Date.now() - 86400000).toISOString();
      const { data: rows } = await appAdmin
        .from("orders")
        .select("amount")
        .eq("user_id", userId)
        .gte("created_at", since);
      const revenue = (rows ?? []).reduce(
        (s: number, r: { amount?: number | null }) => s + Number(r.amount ?? 0),
        0,
      );
      const tpl = pickBiz(T_MORNING, biz)[lang];
      title = tpl.title;
      body = fill(tpl.body, { count: rows?.length ?? 0, revenue: revenue.toFixed(2) });
      link = "/";
    } else if (kind === "unpaid_reminder") {
      const { count } = await appAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "Unpaid");
      const tpl = T_UNPAID_GENERIC[lang];
      title = tpl.title;
      body = fill(tpl.body, { count: count ?? 0 });
      link = "/orders";
    } else if (kind === "closing_report") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: rows } = await appAdmin
        .from("orders")
        .select("amount")
        .eq("user_id", userId)
        .gte("created_at", today.toISOString());
      const total = (rows ?? []).reduce(
        (s: number, r: { amount?: number | null }) => s + Number(r.amount ?? 0),
        0,
      );
      const tpl = pickBiz(T_CLOSING, biz)[lang];
      title = tpl.title;
      body = fill(tpl.body, { count: rows?.length ?? 0, revenue: total.toFixed(2) });
      link = "/reports";
    } else if (kind === "follow_up_reminder") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count } = await appAdmin
        .from("follow_ups")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_done", false)
        .lte("follow_up_date", today.toISOString().slice(0, 10));
      const tpl = T_FOLLOWUP[lang];
      title = tpl.title;
      body = fill(tpl.body, { count: count ?? 0 });
      link = "/customers";
    }
  }
  return { title, body, link, allowed };
}

async function dispatch(userId: string, content: { title: string; body: string; link: string }) {
  // Read from device_sessions (external Supabase). Fallback to legacy
  // device_tokens for any device that hasn't migrated yet.
  const { data: sessions } = await appAdmin
    .from("device_sessions")
    .select("id, device_type, fcm_token, push_subscription")
    .eq("user_id", userId);

  const fcmTokens: string[] = [];
  const webSubs: { id: string; sub: any }[] = [];
  for (const row of (sessions ?? []) as Array<{
    id: string;
    device_type: string | null;
    fcm_token: string | null;
    push_subscription: string | Record<string, unknown> | null;
  }>) {
    if (row.fcm_token) {
      fcmTokens.push(row.fcm_token);
    } else if (row.push_subscription) {
      let sub: any = row.push_subscription;
      if (typeof sub === "string") {
        try {
          sub = JSON.parse(sub);
        } catch {
          sub = null;
        }
      }
      if (sub && sub.endpoint) webSubs.push({ id: row.id, sub });
    }
  }

  // Legacy fallback: also include any tokens stored in device_tokens that
  // are not already accounted for by device_sessions.fcm_token.
  try {
    const { data: legacy } = await appAdmin
      .from("device_tokens")
      .select("token")
      .eq("user_id", userId);
    for (const r of (legacy ?? []) as Array<{ token: string }>) {
      if (r.token && !fcmTokens.includes(r.token)) fcmTokens.push(r.token);
    }
  } catch {
    // device_tokens may not exist in some environments
  }

  console.log("dispatch push", {
    userId,
    fcm: fcmTokens.length,
    web: webSubs.length,
    title: content.title,
  });

  if (fcmTokens.length === 0 && webSubs.length === 0) {
    return { sent: 0, removed: 0, details: [] };
  }

  const details: Array<{ kind: string; ok: boolean; invalid?: boolean; error?: string }> = [];
  let sent = 0;
  let removed = 0;

  if (fcmTokens.length > 0) {
    const results = await sendToTokens(fcmTokens, content);
    for (const r of results) {
      details.push({ kind: "fcm", ok: r.ok, invalid: r.invalid, error: r.error });
      if (r.ok) sent++;
    }
    const dead = results.filter((r) => r.invalid).map((r) => r.token);
    if (dead.length > 0) {
      // Clear from device_sessions.fcm_token and remove legacy device_tokens rows.
      await appAdmin
        .from("device_sessions")
        .update({ fcm_token: null })
        .in("fcm_token", dead);
      await appAdmin.from("device_tokens").delete().in("token", dead).then(
        () => null,
        () => null,
      );
      removed += dead.length;
    }
  }

  if (webSubs.length > 0) {
    const webResults = await sendWebPush(webSubs, content);
    for (const r of webResults) {
      details.push({ kind: "webpush", ok: r.ok, invalid: r.invalid, error: r.error });
      if (r.ok) sent++;
    }
    const deadIds = webResults.filter((r) => r.invalid).map((r) => r.id);
    if (deadIds.length > 0) {
      await appAdmin
        .from("device_sessions")
        .update({ push_subscription: null })
        .in("id", deadIds);
      removed += deadIds.length;
    }
  }

  console.log("dispatch results", details);
  return { sent, removed, details };
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
    userId?: string;
    token?: string;
    platform?: string;
  };
  try {
    parsed = await req.json();
    if (!parsed?.kind) return json(400, { error: "Missing kind" });
  } catch (e) {
    return json(400, { error: "Invalid JSON", detail: (e as Error).message });
  }

  const cronSecret = req.headers.get("x-cron-secret");
  const apiKey = req.headers.get("apikey");
  const auth = req.headers.get("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const hasUserBearer = !!token && !CRON_KEYS.has(token);
  const hasPublicKey = !!apiKey && CRON_KEYS.has(apiKey);
  const isCron =
    (!!PUSH_WEBHOOK_SECRET && cronSecret === PUSH_WEBHOOK_SECRET) ||
    (!!apiKey && CRON_KEYS.has(apiKey) && !hasUserBearer);

  let callerId: string | null = null;
  if (!isCron && hasUserBearer) {
    if (!token) return json(401, { error: "Unauthorized" });
    callerId = await getCallerIdFromBearer(token);
    if (!callerId) return json(401, { error: "Invalid token" });
  } else if (!isCron && !hasPublicKey) {
    return json(401, { error: "Unauthorized" });
  }

  try {
    if (parsed.kind === "register_device") {
      const ownerId = callerId ?? parsed.userId;
      if (!ownerId) return json(401, { error: "Unauthorized" });
      if (callerId && parsed.userId !== callerId)
        return json(403, { error: "Can only register own device" });
      const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
      if (!token || token.length > 4096) return json(400, { error: "Invalid device token" });
      const platform =
        parsed.platform === "ios"
          ? "ios"
          : parsed.platform === "web"
            ? "web"
            : "android";
      const { error } = await appAdmin
        .from("device_tokens")
        .upsert(
          { user_id: ownerId, token, platform, updated_at: new Date().toISOString() },
          { onConflict: "user_id,token" },
        );
      if (error) {
        console.error("register_device failed", error);
        return json(409, { error: error.message || "Could not save this device token" });
      }
      return json(200, { ok: true, registered: true });
    }

    if (parsed.broadcast) {
      if (!isCron) return json(403, { error: "Broadcast requires cron secret" });
      const { data: users } = await appAdmin.from("device_tokens").select("user_id");
      const uniq = Array.from(
        new Set((users ?? []).map((r: { user_id: string }) => r.user_id)),
      ) as string[];
      let totalSent = 0,
        totalRemoved = 0,
        skipped = 0;
      for (const uid of uniq) {
        const c = await resolveContent(uid, parsed.kind, parsed);
        if (!c.allowed) {
          skipped++;
          continue;
        }
        const r = await dispatch(uid, c);
        totalSent += r.sent;
        totalRemoved += r.removed;
      }
      return json(200, {
        ok: true,
        users: uniq.length,
        sent: totalSent,
        removed: totalRemoved,
        skipped,
      });
    }

    const userId = parsed.targetUserId ?? callerId!;
    if (!isCron && userId !== callerId) return json(403, { error: "Can only target self" });
    const c = await resolveContent(userId, parsed.kind, parsed);
    if (!c.allowed) return json(200, { ok: true, skipped: true });
    const r = await dispatch(userId, c);
    return json(200, { ok: true, ...r });
  } catch (e) {
    console.error("send-push failed", e);
    const message = e instanceof Error ? e.message : "An unexpected error occurred.";
    return json(500, { error: message });
  }
});
