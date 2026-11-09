import { createContext, useContext, useEffect, type ReactNode } from "react";

// Bossify is dark-theme only. This context is kept (rather than removed) so
// existing call sites (`useTheme()`, `<ThemeProvider>`) don't need to change,
// but there is no more light/dark toggle: the whole app always renders the
// premium dark palette defined in src/styles.css.
export type Theme = "dark";

type Ctx = { theme: Theme };
const ThemeCtx = createContext<Ctx>({ theme: "dark" });

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light");
    root.classList.add("dark");
    root.style.colorScheme = "dark";
  }, []);

  return <ThemeCtx.Provider value={{ theme: "dark" }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
