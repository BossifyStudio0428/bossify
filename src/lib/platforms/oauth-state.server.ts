import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// Signed OAuth `state` parameter for CSRF protection.
// Format: base64url( payloadJson ) + "." + base64url( hmacSha256(payload) )
// Payload: { userId, platform, nonce, exp }

const TTL_SECONDS = 10 * 60; // 10 minutes

function getSecret(): string {
  const s = process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error("OAUTH_STATE_SECRET is not configured");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export type OAuthStatePayload = {
  userId: string;
  platform: string;
  nonce: string;
  exp: number; // unix seconds
};

export function signOAuthState(input: { userId: string; platform: string }): string {
  const payload: OAuthStatePayload = {
    userId: input.userId,
    platform: input.platform,
    nonce: randomBytes(8).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = createHmac("sha256", getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${b64url(sig)}`;
}

export function verifyOAuthState(state: string): OAuthStatePayload {
  const [payloadB64, sigB64] = state.split(".");
  if (!payloadB64 || !sigB64) throw new Error("Malformed state");
  const expected = createHmac("sha256", getSecret()).update(payloadB64).digest();
  const got = b64urlDecode(sigB64);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    throw new Error("Invalid state signature");
  }
  const payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8")) as OAuthStatePayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("State expired");
  }
  return payload;
}