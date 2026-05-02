export function BossifySplash() {
  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: "#F4F3F8" }}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{
          width: 280,
          height: 280,
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
        <p className="mt-4 text-[28px] font-extrabold tracking-tight" style={{ color: "#1E1333" }}>
          Bossify
        </p>
        <p className="mt-1 text-[13px] italic" style={{ color: "#6B7280" }}>
          Manage your shop like a boss.
        </p>
      </div>
    </div>
  );
}