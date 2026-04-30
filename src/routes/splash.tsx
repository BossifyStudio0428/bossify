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
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-white relative overflow-hidden">
      {/* soft purple radial glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{
          width: 280, height: 280,
          background: "radial-gradient(circle, rgba(124,58,237,0.10) 0%, rgba(124,58,237,0) 70%)",
          animation: "fade-in 0.8s ease-out both",
        }}
      />
      <div className="relative flex flex-col items-center">
        <img
          src="/assets/bossify-logo.png"
          alt="Bossify"
          width={140}
          height={140}
          className="object-contain"
          style={{
            animation: "splashLogo 0.8s cubic-bezier(0.34,1.56,0.64,1) 0.3s both",
          }}
        />
        <p
          className="mt-4 text-[28px] font-extrabold tracking-tight"
          style={{ color: "#1E1333", animation: "splashText 0.5s ease-out 0.9s both" }}
        >
          Bossify
        </p>
        <p
          className="mt-1 text-[13px] italic"
          style={{ color: "#6B7280", animation: "fade-in 0.5s ease-out 1.3s both" }}
        >
          Manage your shop like a boss.
        </p>
      </div>

      {/* loading bar */}
      <div
        className="absolute bottom-20 flex flex-col items-center"
        style={{ animation: "fade-in 0.4s ease-out 1.7s both" }}
      >
        <div style={{ width: 160, height: 3, background: "#E0DCF0", borderRadius: 2, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              background: "#7C3AED",
              borderRadius: 2,
              animation: "splashBar 2s ease-out 1.7s both",
            }}
          />
        </div>
        <div className="mt-3 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: 5, height: 5, borderRadius: 999, background: "#A78BFA",
                animation: `splashDot 1s ease-in-out ${1.7 + i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes splashLogo {
          0% { transform: scale(0.2) rotate(-10deg); opacity: 0; }
          70% { transform: scale(1.08) rotate(0deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes splashText {
          from { transform: translateY(16px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes splashBar {
          from { width: 0%; }
          to { width: 100%; }
        }
        @keyframes splashDot {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
