import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { appSupabase as supabase } from "@/lib/appSupabase";
import { safeLocalStorage } from "@/lib/safeStorage";

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
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
    return { error: error?.message ?? null };
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
