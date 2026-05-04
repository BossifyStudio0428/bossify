import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BossifySplash } from "@/components/BossifySplash";
import { getBossifySplashRemainingMs } from "@/lib/splashTiming";
import { safeLocalStorage } from "@/lib/safeStorage";

export const Route = createFileRoute("/splash")({ component: Splash });

function Splash() {
  const navigate = useNavigate();
  useEffect(() => {
    const remainingMs = getBossifySplashRemainingMs();
    const t = setTimeout(() => {
      const pickedLang =
        typeof window !== "undefined" &&
        safeLocalStorage.getItem("bossify_lang_picked") === "1";
      navigate({ to: pickedLang ? "/auth" : "/language", replace: true });
    }, remainingMs);
    return () => clearTimeout(t);
  }, [navigate]);

  return <BossifySplash />;
}
