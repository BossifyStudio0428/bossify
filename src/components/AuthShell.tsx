import { Check } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { TiltCard } from "@/components/MotionFx";

/**
 * Shared left-side brand panel for the auth experience (Login, Sign Up,
 * Forgot Password). Desktop only - hidden below the `lg` breakpoint so
 * mobile keeps its existing single-column layout untouched.
 *
 * Colors/typography are the exact tokens already used throughout
 * auth.tsx (#8B5CF6 primary, #1A1225 ink, #5B5270 soft text, #F7F5FA
 * surface, #E4DEF0 border, DM Sans) so this reads as part of the same
 * product, not a bolted-on marketing panel.
 */
export function AuthBrandPanel() {
  const { lang } = useI18n();

  const headline =
    lang === "zh" ? "\u6e05\u695a\u77e5\u9053\uff0c\u4f60\u771f\u6b63\u8d5a\u4e86\u591a\u5c11\u3002" : lang === "ms" ? "Tahu apa yang anda benar-benar untung." : "Know what you actually keep.";
  const sub =
    lang === "zh"
      ? "\u8ffd\u8e2a\u771f\u5b9e\u5229\u6da6\u3001\u7ba1\u7406\u5e93\u5b58\uff0c\u4e00\u4e2a\u5730\u65b9\u770b\u61c2\u4f60\u7684\u751f\u610f\u3002"
      : lang === "ms"
        ? "Jejak untung sebenar, urus stok, dan fahami perniagaan anda di satu tempat."
        : "Track real profit, manage stock, and understand your business in one place.";

  const bullets =
    lang === "zh"
      ? ["\u771f\u5b9e\u5229\u6da6\u8ffd\u8e2a", "\u5e93\u5b58\u7ba1\u7406", "\u8425\u4e1a\u62a5\u8868", "TikTok Shop \u6574\u5408"]
      : lang === "ms"
        ? ["Jejak untung sebenar", "Pengurusan inventori", "Laporan perniagaan", "Integrasi TikTok Shop"]
        : ["Real profit tracking", "Inventory management", "Business reports", "TikTok Shop integration"];

  return (
    <div className="hidden lg:flex lg:flex-col lg:justify-center lg:w-[420px] lg:pr-10 shrink-0">
      <img src="/assets/bossify-logo.png" alt="Bossify" style={{ width: 44, height: 44, objectFit: "contain" }} />
      <h2 className="mt-6 text-[28px] font-bold leading-tight" style={{ color: "#1A1225" }}>
        {headline}
      </h2>
      <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "#5B5270" }}>
        {sub}
      </p>

      <DashboardPreview />

      <ul className="mt-6 space-y-2.5">
        {bullets.map((b) => (
          <li key={b} className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "#1A1225" }}>
            <span className="h-5 w-5 rounded-full flex items-center justify-center shrink-0" style={{ background: "#EFEAFA" }}>
              <Check className="h-3 w-3" style={{ color: "#8B5CF6" }} />
            </span>
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Small, static preview of what the real Profit page looks like once
 *  logged in - illustrative numbers (this screen exists before anyone
 *  signs in, so there is no real data yet), not a live chart. */
function DashboardPreview() {
  const { lang } = useI18n();
  const labels =
    lang === "zh"
      ? { profit: "\u771f\u5b9e\u5229\u6da6", revenue: "\u6536\u5165", costs: "\u6210\u672c" }
      : lang === "ms"
        ? { profit: "Untung Sebenar", revenue: "Hasil", costs: "Kos" }
        : { profit: "Real Profit", revenue: "Revenue", costs: "Costs" };

  return (
    <TiltCard max={4}>
    <div
      className="bf-shine bossify-animate-float-sm mt-7 rounded-2xl p-4"
      style={{ background: "#FFFFFF", border: "1px solid #E4DEF0", boxShadow: "0 12px 32px rgba(139,92,246,0.12)" }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#5B5270" }}>
        {labels.profit}
      </p>
      <p className="mt-0.5 text-[26px] font-bold font-mono" style={{ color: "#1A1225" }}>
        RM 6,170
      </p>

      <svg viewBox="0 0 200 48" className="mt-2 w-full h-12" preserveAspectRatio="none" aria-hidden="true">
        <polyline
          points="0,36 25,32 50,34 75,24 100,26 125,16 150,18 175,8 200,10"
          fill="none"
          stroke="#8B5CF6"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl px-3 py-2" style={{ background: "#F7F5FA" }}>
          <p className="text-[10px]" style={{ color: "#5B5270" }}>{labels.revenue}</p>
          <p className="text-[13px] font-bold" style={{ color: "#1A1225" }}>RM 18,450</p>
        </div>
        <div className="rounded-xl px-3 py-2" style={{ background: "#F7F5FA" }}>
          <p className="text-[10px]" style={{ color: "#5B5270" }}>{labels.costs}</p>
          <p className="text-[13px] font-bold" style={{ color: "#1A1225" }}>RM 12,280</p>
        </div>
      </div>
    </div>
    </TiltCard>
  );
}

/**
 * Outer auth-page shell: brand panel + content side by side on desktop
 * (two columns), stacked on mobile (brand panel hidden there - mobile
 * keeps its existing single-column flow untouched). `footer` renders
 * full-width below everything, same spot the Terms/Privacy links held
 * before this shell existed.
 */
export function AuthShell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div
      data-auth-surface
      className="min-h-screen px-5 pt-10 pb-8 flex flex-col lg:px-10 lg:py-12"
      style={{ background: "#FCFBFE", fontFamily: "DM Sans, system-ui, sans-serif" }}
    >
      <div className="flex-1 flex flex-col lg:flex-row lg:items-center lg:justify-center lg:gap-10">
        <AuthBrandPanel />
        {children}
      </div>
      {footer}
    </div>
  );
}
