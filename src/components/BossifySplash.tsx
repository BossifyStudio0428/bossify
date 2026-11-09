import bossifyLogo from "@/assets/bossify-logo.png";

export function BossifySplash() {
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: "#FCFBFE" }}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{
          width: 280,
          height: 280,
          background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, rgba(139,92,246,0) 70%)",
        }}
      />
      <div className="relative flex flex-col items-center">
        <img
          src={bossifyLogo}
          alt="Bossify"
          width={160}
          height={undefined}
          style={{ width: 160, height: "auto" }}
          className="object-contain bossify-logo-anim"
        />
        <p className="mt-4 text-[28px] font-extrabold tracking-tight" style={{ color: "#1A1225" }}>
          Bossify
        </p>
        <p className="mt-1 text-[13px] italic" style={{ color: "#5B5270" }}>
          Manage your shop like a boss.
        </p>
        <div className="mt-6 bossify-line-wrap" aria-hidden="true">
          <span className="bossify-line" />
        </div>
      </div>
    </div>
  );
}
