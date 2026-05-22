import type { PlatformKey } from "@/lib/platforms";

type Props = { platform: PlatformKey; size?: number; className?: string };

export function PlatformIcon({ platform, size = 28, className = "" }: Props) {
  const s = size;
  const rounded = Math.round(s * 0.22);

  switch (platform) {
    case "tiktok":
      return (
        <div
          className={`flex items-center justify-center bg-black ${className}`}
          style={{ width: s, height: s, borderRadius: rounded }}
        >
          <svg viewBox="0 0 24 24" width={s * 0.6} height={s * 0.6} fill="none">
            <path d="M16.5 2c.3 1.9 1.4 3.4 3.5 3.7v2.6c-1.4.1-2.6-.3-3.9-1v6.4c0 4-3.5 6.8-7.3 5.9-3.4-.8-5.1-4.5-3.7-7.6 1.1-2.4 3.9-3.7 6.4-3v2.9c-.5-.1-1-.2-1.5-.1-1.6.2-2.6 1.6-2.3 3.2.3 1.5 1.8 2.4 3.3 2 1.3-.3 2.1-1.4 2.1-2.8V2h3.4z" fill="#fff"/>
            <path d="M16.5 2c.3 1.9 1.4 3.4 3.5 3.7v2.6c-1.4.1-2.6-.3-3.9-1v6.4c0 4-3.5 6.8-7.3 5.9-3.4-.8-5.1-4.5-3.7-7.6 1.1-2.4 3.9-3.7 6.4-3v2.9" stroke="#25F4EE" strokeWidth="0.4"/>
            <path d="M16.5 2h3.4" stroke="#FE2C55" strokeWidth="0.4"/>
          </svg>
        </div>
      );
    case "shopee":
      return (
        <div
          className={`flex items-center justify-center ${className}`}
          style={{ width: s, height: s, borderRadius: rounded, background: "#EE4D2D" }}
        >
          <svg viewBox="0 0 24 24" width={s * 0.62} height={s * 0.62} fill="none">
            <path d="M8 8V6.5C8 4.6 9.8 3 12 3s4 1.6 4 3.5V8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
            <path d="M5.5 8h13l-1 11.5a1.5 1.5 0 0 1-1.5 1.5H8a1.5 1.5 0 0 1-1.5-1.5L5.5 8z" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round"/>
            <path d="M10 12c0 1 .8 1.5 2 1.8 1.3.4 2 .9 2 1.8 0 1-1 1.6-2 1.6s-2-.4-2.4-1" stroke="#fff" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>
      );
    case "lazada":
      return (
        <div
          className={`flex items-center justify-center ${className}`}
          style={{
            width: s,
            height: s,
            borderRadius: rounded,
            background: "linear-gradient(135deg, #0F146E 0%, #F8147E 100%)",
          }}
        >
          <span
            style={{ fontSize: s * 0.5, fontWeight: 800, color: "#fff", lineHeight: 1, fontFamily: "system-ui, sans-serif" }}
          >
            L
          </span>
        </div>
      );
    case "instagram":
      return (
        <div
          className={`flex items-center justify-center ${className}`}
          style={{
            width: s,
            height: s,
            borderRadius: rounded,
            background:
              "linear-gradient(45deg, #F58529 0%, #DD2A7B 40%, #8134AF 70%, #515BD4 100%)",
          }}
        >
          <svg viewBox="0 0 24 24" width={s * 0.6} height={s * 0.6} fill="none" stroke="#fff" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="5"/>
            <circle cx="12" cy="12" r="4"/>
            <circle cx="17.5" cy="6.5" r="1" fill="#fff" stroke="none"/>
          </svg>
        </div>
      );
    case "facebook":
      return (
        <div
          className={`flex items-center justify-center ${className}`}
          style={{ width: s, height: s, borderRadius: rounded, background: "#1877F2" }}
        >
          <svg viewBox="0 0 24 24" width={s * 0.7} height={s * 0.7}>
            <path
              d="M14 8h2.5V5h-2.5c-1.9 0-3.5 1.6-3.5 3.5V11H8.5v3H10.5v7h3v-7H16l.5-3H13.5V8.5C13.5 8.2 13.7 8 14 8z"
              fill="#fff"
            />
          </svg>
        </div>
      );
  }
}
