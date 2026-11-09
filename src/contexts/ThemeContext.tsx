import { createContext, useContext, useEffect, type ReactNode } from "react";

// Bossify is light-theme only. This context is kept (rather than removed) so
// existing call sites (`useTheme()`, `<ThemeProvider>`) don't need to change,
// but there is no more light/dark toggle: the whole app always renders the
// light palette defined in src/styles.css.
export type Theme = "light";

type Ctx = { theme: Theme };
const ThemeCtx = createContext<Ctx>({ theme: "light" });

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark");
    root.classList.add("light");
    root.style.colorScheme = "light";
  }, []);

  return <ThemeCtx.Provider value={{ theme: "light" }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
