import { supabase } from "@/integrations/supabase/client";

type Kind = "new_order" | "low_stock" | "milestone" | "custom";

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
  try {
    await supabase.functions.invoke("send-push", { body: params });
  } catch (e) {
    console.warn("sendPushToSelf failed", e);
  }
}