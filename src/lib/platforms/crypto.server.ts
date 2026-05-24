import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// AES-256-GCM token encryption for OAuth tokens at rest.
// Key: base64-encoded 32 bytes in PLATFORM_TOKEN_ENCRYPTION_KEY.
// Output format: base64( iv(12) || tag(16) || ciphertext )

function getKey(): Buffer {
  const raw = process.env.PLATFORM_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("PLATFORM_TOKEN_ENCRYPTION_KEY is not configured");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `PLATFORM_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). ` +
        "Generate with: openssl rand -base64 32"
    );
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptToken(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  if (buf.length < 12 + 16 + 1) throw new Error("Invalid encrypted token");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}