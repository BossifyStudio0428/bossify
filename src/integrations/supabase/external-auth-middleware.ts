// Auth middleware for the EXTERNAL Supabase project (knouahqwazerjiyiqgmh).
// Validates the bearer token sent by the browser supabase client and
// injects { supabase, userId, claims } into server function context.
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const EXTERNAL_SUPABASE_URL = "https://knouahqwazerjiyiqgmh.supabase.co";
const EXTERNAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtub3VhaHF3YXplcmppeWlxZ21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNjgzNDEsImV4cCI6MjA5Mjk0NDM0MX0.VF6SsKKhnAZ9vbD1HeH3KoEpt_XYdjTJqITGBSg3yjs";

export const requireExternalSupabaseAuth = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const request = getRequest();

  if (!request?.headers) {
    throw new Response("Unauthorized: No request headers available", {
      status: 401,
    });
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    throw new Response("Unauthorized: No authorization header provided", {
      status: 401,
    });
  }
  if (!authHeader.startsWith("Bearer ")) {
    throw new Response("Unauthorized: Only Bearer tokens are supported", {
      status: 401,
    });
  }

  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    throw new Response("Unauthorized: No token provided", { status: 401 });
  }

  const supabase = createClient<Database>(
    EXTERNAL_SUPABASE_URL,
    EXTERNAL_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) {
    throw new Response("Unauthorized: Invalid token", { status: 401 });
  }
  if (!data.claims.sub) {
    throw new Response("Unauthorized: No user ID found in token", {
      status: 401,
    });
  }

  return next({
    context: {
      supabase,
      userId: data.claims.sub,
      claims: data.claims,
    },
  });
});