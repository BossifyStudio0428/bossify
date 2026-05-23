import { supabase } from "@/integrations/supabase/client";

export type PushKind = "new_order" | "low_stock" | "milestone" | "custom";
const PUSH_FUNCTION_URL = "https://knouahqwazerjiyiqgmh.supabase.co/functions/v1/send-push";

async function callPushFunction(body: Record<string, unknown>, didRefresh = false): Promise<{
  data: Record<string, unknown> | null;
  error: Error | null;
}> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const token = session?.access_token;
  if (!token) return { data: null, error: new Error("Not signed in") };
  const requestBody =
    body.kind === "register_device" || body.targetUserId
      ? body
      : { ...body, targetUserId: session.user.id };

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(PUSH_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    const rawText = await res.text().catch(() => "");
    let responseBody: { error?: string; [key: string]: unknown } = {};
    try {
      responseBody = rawText ? JSON.parse(rawText) : {};
    } catch {
      responseBody = { error: rawText.slice(0, 200) || `HTTP ${res.status}` };
    }
    if (
      !didRefresh &&
      res.status === 401 &&
      typeof responseBody.error === "string" &&
      /invalid token|unauthorized/i.test(responseBody.error)
    ) {
      await supabase.auth.refreshSession().catch(() => null);
      return callPushFunction(body, true);
    }
    if (!res.ok || responseBody.error) {
      return {
        data: responseBody,
        error: new Error(responseBody.error || `Push request failed (${res.status})`),
      };
    }
    return { data: responseBody, error: null };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    if (error.name === "AbortError") {
      return { data: null, error: new Error("Push request timed out. Please try again.") };
    }
    return { data: null, error };
  } finally {
    window.clearTimeout(timeout);
  }
}

/**
 * Triggers an FCM push for the currently signed-in user via the
 * `send-push` edge function. Silently no-ops on failure.
 */
export async function sendPushToSelf(params: {
  kind: PushKind;
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
