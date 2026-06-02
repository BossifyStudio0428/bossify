import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { safeLocalStorage } from "@/lib/safeStorage";
import { registerDeviceSession } from "@/lib/deviceSession";

const DEVICE_LIMIT_BLOCK_KEY = "bossify_device_limit_block";

function setDeviceLimitBlock(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) sessionStorage.setItem(DEVICE_LIMIT_BLOCK_KEY, "1");
    else sessionStorage.removeItem(DEVICE_LIMIT_BLOCK_KEY);
  } catch {}
}

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{
    error: string | null;
    code?: "device_limit_reached";
    used?: number;
    limit?: number;
    plan?: string;
  }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fallback = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 3000);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        // Best-effort touch — keeps last_active fresh and (re)registers if missing.
        registerDeviceSession()
          .then((reg) => {
            if (reg.ok) setDeviceLimitBlock(false);
          })
          .catch(() => {});
      }
    });
    supabase.auth.getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
      })
      .catch((error) => {
        console.error("auth session check failed", error);
      })
      .finally(() => {
        if (cancelled) return;
        window.clearTimeout(fallback);
        setLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn: AuthCtx["signIn"] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    const reg = await registerDeviceSession();
    if (!reg.ok && reg.error === "limit_reached") {
      // Keep the session alive so the user can open /devices and remove
      // one. The login screen renders a blocking device-limit panel.
      setDeviceLimitBlock(true);
      let plan = "free";
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user?.id;
        if (uid) {
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("plan")
            .eq("user_id", uid)
            .eq("status", "active")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (sub?.plan) plan = sub.plan;
        }
      } catch {}
      return {
        error: "device_limit_reached",
        code: "device_limit_reached",
        used: reg.used,
        limit: reg.limit,
        plan,
      };
    }
    setDeviceLimitBlock(false);
    return { error: null };
  };

  const signUp: AuthCtx["signUp"] = async (email, password) => {
    const redirect = typeof window !== "undefined" ? window.location.origin : undefined;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirect },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    setDeviceLimitBlock(false);
    // Reset theme to light so the auth screen never flashes a dark background
    if (typeof window !== "undefined") {
      try {
        safeLocalStorage.setItem("bossify_theme", "light");
        const root = document.documentElement;
        root.classList.remove("dark");
        root.classList.add("light");
        root.style.colorScheme = "light";
      } catch {
        // Ignore theme reset errors.
      }
    }
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider
      value={{ session, user: session?.user ?? null, loading, signIn, signUp, signOut }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
