import { supabase } from "@/integrations/supabase/client";

export async function createNotification(params: {
  user_id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}) {
  await supabase.from("notifications").insert(params);
}
