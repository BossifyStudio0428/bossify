import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeBizType, normalizeFnbSubType, type BizType, type FnbSubType } from "@/lib/businessType";

type Ctx = {
  type: BizType | null;
  subType: FnbSubType | null;
  loading: boolean;
  setType: (t: BizType, sub?: FnbSubType | null) => Promise<void>;
  refresh: () => Promise<void>;
};

const BusinessTypeContext = createContext<Ctx | null>(null);

export function BusinessTypeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [type, setTypeState] = useState<BizType | null>(null);
  const [subType, setSubTypeState] = useState<FnbSubType | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) {
      setTypeState(null);
      setSubTypeState(null);
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
    setTypeState(normBt);
    setSubTypeState(normBt === "fnb" ? (normalizeFnbSubType(sub) ?? "general") : null);
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  const setType = async (t: BizType, sub: FnbSubType | null = null) => {
    if (!user) return;
    const effectiveSub = t === "fnb" ? (sub ?? "general") : null;
    setTypeState(t);
    setSubTypeState(effectiveSub);
    let { error } = await supabase
      .from("profiles")
      .upsert(
        { id: user.id, business_category: t, business_type: t, business_sub_type: effectiveSub } as any,
        { onConflict: "id" },
      );
    if (error) {
      // Retry without business_sub_type (column may not exist yet on
      // the external Supabase project). The sub-type will be applied
      // automatically once the manual migration is run.
      const fb = await supabase
        .from("profiles")
        .upsert(
          { id: user.id, business_category: t, business_type: t } as any,
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
    <BusinessTypeContext.Provider value={{ type, subType, loading, setType, refresh }}>
      {children}
    </BusinessTypeContext.Provider>
  );
}

export function useBusinessType() {
  const ctx = useContext(BusinessTypeContext);
  if (!ctx) throw new Error("useBusinessType must be used within BusinessTypeProvider");
  return ctx;
}