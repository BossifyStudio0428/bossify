import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type BusinessProfileLite = { businessName: string | null; avatarUrl: string | null };

// One shared copy per page load so the dashboard and the top bar don't both
// query it. Cleared when the business profile page saves (see refreshBusinessProfile).
let cache: { userId: string; value: BusinessProfileLite } | null = null;
const listeners = new Set<(v: BusinessProfileLite) => void>();

export function refreshBusinessProfile(value: BusinessProfileLite, userId: string) {
  cache = { userId, value };
  listeners.forEach((l) => l(value));
}

/** The seller's business name and photo (profiles.business_name / avatar_url). */
export function useBusinessProfile(): BusinessProfileLite {
  const { user } = useAuth();
  const [value, setValue] = useState<BusinessProfileLite>(
    cache && user && cache.userId === user.id ? cache.value : { businessName: null, avatarUrl: null },
  );

  useEffect(() => {
    listeners.add(setValue);
    return () => { listeners.delete(setValue); };
  }, []);

  useEffect(() => {
    if (!user) return;
    if (cache && cache.userId === user.id) { setValue(cache.value); return; }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("business_name,avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const v = {
          businessName: (data as any)?.business_name ?? null,
          avatarUrl: (data as any)?.avatar_url || (user.user_metadata as any)?.avatar_url || null,
        };
        cache = { userId: user.id, value: v };
        setValue(v);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  return value;
}
