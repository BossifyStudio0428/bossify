import { supabase } from "@/integrations/supabase/client";
import { safeLocalStorage } from "@/lib/safeStorage";

const DEVICE_ID_KEY = "bossify_device_id";

export function getDeviceId(): string {
  let id = safeLocalStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id =
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36));
    safeLocalStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceName(): string {
  if (typeof navigator === "undefined") return "Web Browser";
  const ua = navigator.userAgent || "";
  const platform = (navigator as any).userAgentData?.platform || navigator.platform || "";

  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua) || /Opera/.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let os = platform;
  if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";

  return `${browser} · ${os}`.trim();
}

export function getDeviceType(): "android" | "ios" | "web" {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent || "";
  if (/Android/.test(ua)) return "android";
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  return "web";
}

export type RegisterResult =
  | { ok: true; used: number; limit: number; currentDeviceId: string }
  | { ok: false; error: "limit_reached" | "unknown"; used?: number; limit?: number; message?: string };

export async function registerDeviceSession(): Promise<RegisterResult> {
  const device_id = getDeviceId();
  const device_name = getDeviceName();
  const device_type = getDeviceType();

  const { data, error } = await supabase.rpc("register_device_session", {
    _device_id: device_id,
    _device_name: device_name,
    _device_type: device_type,
  });

  if (error) {
    const msg = error.message || "";
    if (msg.includes("device_limit_reached")) {
      const m = msg.match(/(\d+)\/(\d+)/);
      return {
        ok: false,
        error: "limit_reached",
        used: m ? Number(m[1]) : undefined,
        limit: m ? Number(m[2]) : undefined,
        message: msg,
      };
    }
    return { ok: false, error: "unknown", message: msg };
  }

  const payload = (data ?? {}) as { used?: number; limit?: number; current_device_id?: string };
  return {
    ok: true,
    used: payload.used ?? 0,
    limit: payload.limit ?? 1,
    currentDeviceId: payload.current_device_id ?? device_id,
  };
}

export async function removeDeviceSession(sessionId: string) {
  const { error } = await supabase.from("device_sessions").delete().eq("id", sessionId);
  if (error) throw new Error(error.message);
}