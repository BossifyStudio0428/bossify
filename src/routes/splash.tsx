import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BossifySplash } from "@/components/BossifySplash";
import { getBossifySplashRemainingMs } from "@/lib/splashTiming";
import { safeLocalStorage } from "@/lib/safeStorage";

export const Route = createFileRoute("/splash")({ component: Splash });

function Splash() {
  const navigate = useNavigate();
  useEffect(() => {
    // Hard guard: if the user has never tapped Continue on the language
    // page, ALWAYS send them there immediately. Do not wait for the splash
    // timer and never fall through to /auth.
    const pickedLang =
      typeof window !== "undefined" &&
      safeLocalStorage.getItem("bossify_lang_picked") === "1";
    if (!pickedLang) {
      navigate({ to: "/language", replace: true });
      return;
    }
    const remainingMs = getBossifySplashRemainingMs();
    const t = setTimeout(() => {
      navigate({ to: "/auth", replace: true });
    }, remainingMs);
    return () => clearTimeout(t);
  }, [navigate]);

  return <BossifySplash />;
}
