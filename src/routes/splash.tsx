import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BossifySplash } from "@/components/BossifySplash";
import { getBossifySplashRemainingMs } from "@/lib/splashTiming";

export const Route = createFileRoute("/splash")({ component: Splash });

function Splash() {
  const navigate = useNavigate();
  useEffect(() => {
    const remainingMs = getBossifySplashRemainingMs();
    const t = setTimeout(() => {
      navigate({ to: "/language", replace: true });
    }, remainingMs);
    return () => clearTimeout(t);
  }, [navigate]);

  return <BossifySplash />;
}
