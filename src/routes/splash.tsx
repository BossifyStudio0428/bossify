import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BossifySplash } from "@/components/BossifySplash";

export const Route = createFileRoute("/splash")({ component: Splash });

function Splash() {
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => {
      navigate({ to: "/language", replace: true });
    }, 3000);
    return () => clearTimeout(t);
  }, [navigate]);

  return <BossifySplash />;
}
