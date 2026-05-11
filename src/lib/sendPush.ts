import { supabase } from "@/integrations/supabase/client";

type Kind = "new_order" | "low_stock" | "milestone" | "custom";

/**
 * Triggers an FCM push for the currently signed-in user.
 * Calls the public server route /api/public/send-push with the user's JWT.
 * Silently no-ops on failure so it never blocks the UI flow.
 */
export async function sendPushToSelf(params: {
  kind: Kind;
  title: string;
  body: string;
  link?: string;
}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch("/api/public/send-push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(params),
    });
  } catch (e) {
    console.warn("sendPushToSelf failed", e);
  }
}