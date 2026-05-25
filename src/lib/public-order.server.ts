import "@tanstack/react-start/server-only";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function getPublicOrderClient() {
  return supabaseAdmin;
}