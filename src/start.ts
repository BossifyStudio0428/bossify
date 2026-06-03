import { createStart } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

export const startInstance = createStart(() => ({
  defaultSsr: false,
  functionMiddleware: [attachSupabaseAuth],
}));