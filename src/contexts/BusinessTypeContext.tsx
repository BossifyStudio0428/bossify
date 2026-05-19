import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { BizType } from "@/lib/businessType";

type Ctx = {
  type: BizType | null;
  loading: boolean;
  setType: (t: BizType) => Promise<void>;
  refresh: () => Promise<void>;
};

const BusinessTypeContext = createContext<Ctx | null>(null);

export function BusinessTypeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [type, setTypeState] = useState<BizType | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) {
      setTypeState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("business_category")
      .eq("id", user.id)
      .maybeSingle();
    setTypeState(((data as any)?.business_category ?? null) as BizType | null);
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  const setType = async (t: BizType) => {
    if (!user) return;
    setTypeState(t);
    const { error } = await supabase
      .from("profiles")
      .upsert(
        { id: user.id, business_category: t } as any,
        { onConflict: "id" },
      );
    if (error) {
      console.error("setType upsert failed", error);
      throw error;
    }
    await refresh();
  };

  return (
    <BusinessTypeContext.Provider value={{ type, loading, setType, refresh }}>
      {children}
    </BusinessTypeContext.Provider>
  );
}

export function useBusinessType() {
  const ctx = useContext(BusinessTypeContext);
  if (!ctx) throw new Error("useBusinessType must be used within BusinessTypeProvider");
  return ctx;
}