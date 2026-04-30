import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/splash")({ component: Splash });

function Splash() {
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => {
      const lang = typeof window !== "undefined" ? localStorage.getItem("bossify_lang") : null;
      if (!lang) navigate({ to: "/language" });
      else navigate({ to: "/auth" });
    }, 3500);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden" style={{ backgroundColor: "#F4F3F8" }}>
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{
          width: 280, height: 280,
          background: "radial-gradient(circle, rgba(124,58,237,0.10) 0%, rgba(124,58,237,0) 70%)",
        }}
      />
      <div className="relative flex flex-col items-center">
        <img
          src="/assets/bossify-logo.png"
          alt="Bossify"
          width={180}
          height={180}
          className="object-contain"
        />
        <p
          className="mt-4 text-[28px] font-extrabold tracking-tight"
          style={{ color: "#1E1333" }}
        >
          Bossify
        </p>
        <p
          className="mt-1 text-[13px] italic"
          style={{ color: "#6B7280" }}
        >
          Manage your shop like a boss.
        </p>
      </div>

      <div className="absolute bottom-20 flex flex-col items-center">
        <div style={{ width: 160, height: 3, background: "#E0DCF0", borderRadius: 2, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: "100%",
              background: "#7C3AED",
              borderRadius: 2,
            }}
          />
        </div>
        <div className="mt-3 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 5, height: 5, borderRadius: 999, background: "#A78BFA",
              }}
            />
          ))}
        </div>
      </div>

    </div>
  );
}
