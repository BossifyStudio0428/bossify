// Server-side Supabase admin client for the EXTERNAL Supabase project
// (knouahqwazerjiyiqgmh). Bypasses RLS. Use in server functions and
// server route handlers only. Never import from client code.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const EXTERNAL_SUPABASE_URL = "https://knouahqwazerjiyiqgmh.supabase.co";

function createExternalSupabaseAdminClient() {
  const serviceRoleKey = process.env.APP_SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    const message =
      "Missing APP_SUPABASE_SERVICE_ROLE_KEY. Add it as a project secret.";
    console.error(`[ExternalSupabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(EXTERNAL_SUPABASE_URL, serviceRoleKey, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _client: ReturnType<typeof createExternalSupabaseAdminClient> | undefined;

export const externalSupabaseAdmin = new Proxy(
  {} as ReturnType<typeof createExternalSupabaseAdminClient>,
  {
    get(_, prop, receiver) {
      if (!_client) _client = createExternalSupabaseAdminClient();
      return Reflect.get(_client, prop, receiver);
    },
  },
);

export const EXTERNAL_SUPABASE_URL_VALUE = EXTERNAL_SUPABASE_URL;