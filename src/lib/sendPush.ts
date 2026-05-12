import { supabase } from "@/integrations/supabase/client";

type Kind = "new_order" | "low_stock" | "milestone" | "custom";
const PUSH_FUNCTION_URL = "https://utqlrdbhvnugqvemjegi.supabase.co/functions/v1/send-push";
const PUSH_PUBLIC_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cWxyZGJodm51Z3F2ZW1qZWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NTY3NDcsImV4cCI6MjA5NDAzMjc0N30.Y9T5utLkjgJoDybFDqhKMDlEAX87W5cTlCUPyWkeVd4";

async function callPushFunction(body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const token = session?.access_token;
  if (!token) return { data: null, error: new Error("Not signed in") };
  const requestBody = body.kind === "register_device" || body.targetUserId
    ? body
    : { ...body, targetUserId: session.user.id };

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(PUSH_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: PUSH_PUBLIC_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    const responseBody = await res.json().catch(() => ({})) as { error?: string; [key: string]: unknown };
    if (!res.ok || responseBody.error) {
      return { data: responseBody, error: new Error(responseBody.error || `Push request failed (${res.status})`) };
    }
    return { data: responseBody, error: null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  } finally {
    window.clearTimeout(timeout);
  }
}

/**
 * Triggers an FCM push for the currently signed-in user via the
 * `send-push` edge function. Silently no-ops on failure.
 */
export async function sendPushToSelf(params: {
  kind: Kind;
  title: string;
  body: string;
  link?: string;
}) {
  const res = await callPushFunction(params);
  if (res.error) console.warn("sendPushToSelf failed", res.error);
  return res;
}

export async function registerDeviceForPush(params: {
  userId: string;
  token: string;
  platform?: "android" | "ios";
}) {
  const res = await callPushFunction({ kind: "register_device", ...params });
  if (res.error) console.warn("registerDeviceForPush failed", res.error);
  return res;
}