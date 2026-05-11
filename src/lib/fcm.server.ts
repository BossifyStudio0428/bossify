/**
 * Server-only FCM HTTP v1 helper.
 *
 * Reads FCM_SERVICE_ACCOUNT_JSON (a Firebase service account key) and uses it
 * to mint an OAuth2 access token, then sends messages through
 * https://fcm.googleapis.com/v1/projects/{project_id}/messages:send
 *
 * Runs inside a Cloudflare Worker — uses Web Crypto for RS256 JWT signing.
 */

type ServiceAccount = {
  type: string;
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
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FCM_SERVICE_ACCOUNT_JSON not set");
  cachedAccount = JSON.parse(raw) as ServiceAccount;
  return cachedAccount;
}

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new Uint8Array(input);
  }
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

async function signJwt(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: account.private_key_id };
  const claims = {
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: account.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(sig)}`;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const account = getAccount();
  const jwt = await signJwt(account);
  const res = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`FCM token error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: json.access_token, exp: now + json.expires_in };
  return json.access_token;
}

export type FcmSendResult = {
  token: string;
  ok: boolean;
  error?: string;
  invalid?: boolean; // true if FCM says token is dead
};

export async function sendToTokens(
  tokens: string[],
  payload: { title: string; body: string; link?: string; data?: Record<string, string> },
): Promise<FcmSendResult[]> {
  if (tokens.length === 0) return [];
  const account = getAccount();
  const accessToken = await getAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`;

  // FCM HTTP v1 sends one message per call. Fan out in parallel.
  return await Promise.all(
    tokens.map(async (token) => {
      const message = {
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data: { ...(payload.data ?? {}), link: payload.link ?? "/" },
          android: {
            priority: "HIGH" as const,
            notification: { sound: "default", channel_id: "bossify_default" },
          },
        },
      };
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
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