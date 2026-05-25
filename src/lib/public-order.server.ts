import "@tanstack/react-start/server-only";

import { createClient } from "@supabase/supabase-js";

const APP_SUPABASE_URL = "https://knouahqwazerjiyiqgmh.supabase.co";

function createPublicOrderClient() {
  const serviceRoleKey = process.env.APP_SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("Missing APP_SUPABASE_SERVICE_ROLE_KEY for public order form lookups.");
  }

  return createClient(APP_SUPABASE_URL, serviceRoleKey, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let publicOrderClient: ReturnType<typeof createPublicOrderClient> | undefined;

export function getPublicOrderClient() {
  if (!publicOrderClient) publicOrderClient = createPublicOrderClient();
  return publicOrderClient;
}