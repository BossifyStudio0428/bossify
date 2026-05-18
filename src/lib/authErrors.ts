import type { TKey } from "@/contexts/I18nContext";

export function mapAuthError(message: string | undefined | null): TKey {
  const m = (message || "").toLowerCase();
  if (!m) return "err_network";
  if (m.includes("invalid login") || m.includes("invalid_credentials") || m.includes("invalid email or password")) return "err_invalid_creds";
  if (m.includes("email not confirmed") || m.includes("not confirmed")) return "err_email_not_confirmed";
  if (m.includes("already registered") || m.includes("user already") || m.includes("already exists")) return "err_user_exists";
  if (m.includes("password") && (m.includes("weak") || m.includes("short") || m.includes("least"))) return "err_weak_pw";
  if (m.includes("network") || m.includes("fetch")) return "err_network";
  if (m.includes("otp") || m.includes("token")) return "invalid_code";
  return "err_invalid_creds";
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
