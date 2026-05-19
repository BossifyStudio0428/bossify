import type { TKey } from "@/contexts/I18nContext";

/**
 * Maps a Supabase auth error message to an i18n key.
 * Returns null if unrecognized — caller should fall back to showing the raw message
 * so users (and we) can actually see what went wrong instead of a misleading
 * "Incorrect email or password".
 */
export function mapAuthError(message: string | undefined | null): TKey | null {
  const m = (message || "").toLowerCase();
  if (!m) return "err_network";
  if (m.includes("invalid login") || m.includes("invalid_credentials") || m.includes("invalid email or password")) return "err_invalid_creds";
  if (m.includes("email not confirmed") || m.includes("not confirmed")) return "err_email_not_confirmed";
  if (m.includes("already registered") || m.includes("user already") || m.includes("already exists") || m.includes("email address is already")) return "err_user_exists";
  if (m.includes("password") && (m.includes("weak") || m.includes("short") || m.includes("least") || m.includes("characters"))) return "err_weak_pw";
  if (m.includes("network") || m.includes("fetch") || m.includes("failed to fetch")) return "err_network";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("over_email_send_rate") || m.includes("exceeded")) return "err_rate_limit";
  if (m.includes("signup") && (m.includes("disabled") || m.includes("not allowed") || m.includes("disallowed"))) return "err_signup_disabled";
  if (m.includes("signups not allowed")) return "err_signup_disabled";
  if (m.includes("token has expired") || m.includes("expired") && m.includes("otp")) return "err_otp_expired";
  if (m.includes("invalid otp") || m.includes("token") && m.includes("invalid")) return "invalid_code";
  return null;
}

/** Get a user-facing error string: try i18n key, else show raw message. */
export function authErrorText(
  message: string | undefined | null,
  t: (k: TKey) => string,
): string {
  const key = mapAuthError(message);
  if (key) return t(key);
  return message?.trim() || t("err_network");
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export type Strength = "weak" | "fair" | "strong";
export function pwStrength(pw: string): Strength {
  const hasNum = /\d/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  if (pw.length < 8 || !hasNum) return "weak";
  if (pw.length >= 8 && hasNum && hasSpecial) return "strong";
  return "fair";
}
