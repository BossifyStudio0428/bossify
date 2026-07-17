import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeBizType, normalizeFnbSubType, type BizType, type FnbSubType } from "@/lib/businessType";
import { RETAIL_ONLY_MODE } from "@/lib/featureFlags";

type Ctx = {
  type: BizType | null;
  subType: FnbSubType | null;
  /**
   * Raw business_type from the profile row (unfiltered by
   * RETAIL_ONLY_MODE). Used only to detect legacy non-Retail users so
   * we can show the one-time pivot notice. UI should read `type`.
   */
  storedType: BizType | null;
  loading: boolean;
  setType: (t: BizType, sub?: FnbSubType | null) => Promise<void>;
  refresh: () => Promise<void>;
};

const BusinessTypeContext = createContext<Ctx | null>(null);

export function BusinessTypeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [type, setTypeState] = useState<BizType | null>(null);
  const [subType, setSubTypeState] = useState<FnbSubType | null>(null);
  const [storedType, setStoredType] = useState<BizType | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) {
      setTypeState(null);
      setSubTypeState(null);
      setStoredType(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    let { data, error } = await supabase
      .from("profiles")
      .select("business_category,business_type,business_sub_type")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      // business_sub_type column may not exist on older external Supabase
      // projects yet — retry without it so the rest of the app keeps working.
      const fb = await supabase
        .from("profiles")
        .select("business_category,business_type")
        .eq("id", user.id)
        .maybeSingle();
      data = fb.data as any;
    }
    const cat = (data as any)?.business_category ?? null;
    const bt = (data as any)?.business_type ?? null;
    const sub = (data as any)?.business_sub_type ?? null;
    const normBt = normalizeBizType(bt) ?? normalizeBizType(cat);
    setStoredType(normBt);
    if (RETAIL_ONLY_MODE) {
      // Force Retail for everyone while the pivot is active. Their real
      // business_type stays in the DB untouched.
      setTypeState("retail");
      setSubTypeState(null);
    } else {
      setTypeState(normBt);
      setSubTypeState(normBt === "fnb" ? (normalizeFnbSubType(sub) ?? "general") : null);
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  const setType = async (t: BizType, sub: FnbSubType | null = null) => {
    if (!user) return;
    // While RETAIL_ONLY_MODE is on, any attempt to switch business type
    // is coerced to retail. This keeps legacy code paths safe.
    const effT: BizType = RETAIL_ONLY_MODE ? "retail" : t;
    const effectiveSub = RETAIL_ONLY_MODE ? null : (effT === "fnb" ? (sub ?? "general") : null);
    setTypeState(effT);
    setSubTypeState(effectiveSub);
    let { error } = await supabase
      .from("profiles")
      .upsert(
        { id: user.id, business_category: effT, business_type: effT, business_sub_type: effectiveSub } as any,
        { onConflict: "id" },
      );
    if (error) {
      // Retry without business_sub_type (column may not exist yet on
      // the external Supabase project). The sub-type will be applied
      // automatically once the manual migration is run.
      const fb = await supabase
        .from("profiles")
        .upsert(
          { id: user.id, business_category: effT, business_type: effT } as any,
          { onConflict: "id" },
        );
      error = fb.error;
      if (error) {
        console.error("setType upsert failed", error);
        throw error;
      }
    }
    await refresh();
  };

  return (
    <BusinessTypeContext.Provider value={{ type, subType, storedType, loading, setType, refresh }}>
      {children}
    </BusinessTypeContext.Provider>
  );
}

export function useBusinessType() {
  const ctx = useContext(BusinessTypeContext);
  if (!ctx) throw new Error("useBusinessType must be used within BusinessTypeProvider");
  return ctx;
}