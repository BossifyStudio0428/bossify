import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://knouahqwazerjiyiqgmh.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  // Throwing at runtime keeps this file safe to import; missing key surfaces
  // as a clear server-side error instead of a silent failure.
  console.warn("SUPABASE_SERVICE_ROLE_KEY is not set — admin client will fail");
}

export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});