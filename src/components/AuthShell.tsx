import { useI18n } from "@/contexts/I18nContext";
import { LangSwitch } from "@/components/LangSwitch";

// Same "ledger" tokens as the landing page (LandingPage.tsx) so signing in
// feels like the next page of the same site, not a different product.
const NIGHT = "#1C0F38";
const PRIMARY = "#3B1E6D";
const PRIMARY_LIGHT = "#6C4AB6";
const LAVENDER = "#C9B8F3";
const ACCENT = "#FF3B5C";
const INK = "#1E1730";
const INK_SOFT = "#5B5270";
const RED = "#D92D4A";
const DISPLAY = '"Space Grotesk", system-ui, sans-serif';
const BODY = '"IBM Plex Sans", system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Consolas, monospace';

const ZIGZAG_MASK =
  "conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 14px 100%";

/**
 * Left-side brand panel for the auth pages (Login, Sign Up, Forgot
 * Password). Desktop only -- hidden below `lg`, so phones and the Android
 * app keep a single-column form. A deep-purple page with the Bossify
 * "real profit slip" receipt, matching the landing page hero.
 */
export function AuthBrandPanel() {
  const { lang } = useI18n();

  const copy =
    lang === "zh"
      ? {
          h1: "知道你",
          h2: "真正赚了多少。",
          sub: "追踪真实利润、管理库存,在一个地方看懂你的生意。",
          rows: ["销售额", "产品成本", "平台费用"],
          keep: "你真正赚到的",
          points: ["几分钟即可上手", "无需信用卡", "手机和网页都能用"],
        }
      : lang === "ms"
        ? {
            h1: "Ketahui apa yang",
            h2: "anda benar-benar untung.",
            sub: "Jejak untung sebenar, urus stok, dan fahami perniagaan anda di satu tempat.",
            rows: ["Jualan", "Kos produk", "Yuran platform"],
            keep: "Apa yang anda simpan",
            points: ["Sedia dalam beberapa minit", "Tidak perlu kad kredit", "Mudah alih & Web"],
          }
        : {
            h1: "Know what you",
            h2: "actually keep.",
            sub: "Track real profit, manage stock, and understand your business in one place.",
            rows: ["Sales", "Product cost", "Platform fee"],
            keep: "What you actually keep",
            points: ["Set up in minutes", "No credit card", "Mobile & Web"],
          };
  const values = ["RM 250.00", "− RM 180.00", "− RM 12.50"];

  return (
    <div
      className="hidden lg:flex lg:flex-col lg:justify-between relative lg:w-[46%] lg:max-w-[640px] shrink-0 overflow-hidden px-12 xl:px-16 py-12"
      style={{ background: `linear-gradient(160deg, ${NIGHT} 0%, ${PRIMARY} 120%)`, color: "#FFFFFF" }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,0.055) 0 1px, transparent 1px 34px)" }}
      />

      <a href="/welcome" className="relative inline-flex items-center gap-2.5 self-start">
        <img src="/assets/bossify-logo.png" alt="" className="h-9 w-9 rounded-lg object-contain bg-white" />
        <span className="text-[19px] font-bold tracking-tight" style={{ fontFamily: DISPLAY }}>Bossify</span>
      </a>

      <div className="relative">
        <h2 className="text-[40px] xl:text-[48px] font-bold tracking-[-0.03em] leading-[1.04]" style={{ fontFamily: DISPLAY }}>
          {copy.h1}
          <br />
          <span style={{ color: ACCENT }}>{copy.h2}</span>
        </h2>
        <p className="mt-4 text-[16px] leading-relaxed max-w-[26rem]" style={{ color: "rgba(255,255,255,0.76)" }}>
          {copy.sub}
        </p>

        {/* The signature receipt */}
        <div className="mt-9 w-[270px]" style={{ transform: "rotate(-3deg)", filter: "drop-shadow(0 22px 34px rgba(8,3,24,0.5))" }}>
          <div
            style={{
              background: "#FFFFFF",
              color: INK,
              fontFamily: MONO,
              borderRadius: "8px 8px 0 0",
              paddingBottom: 14,
              WebkitMask: ZIGZAG_MASK,
              mask: ZIGZAG_MASK,
            }}
          >
            <div className="px-5 pt-5 pb-2 text-[12px]">
              <p style={{ color: INK_SOFT }}>ORDER #A1042</p>
              <p className="font-semibold">Bossify · Real Profit Slip</p>
              <div className="my-2.5" style={{ borderTop: "1.5px dashed #CDC5DE" }} />
              <div className="space-y-1">
                {copy.rows.map((label, i) => (
                  <div key={label} className="flex items-baseline justify-between gap-2">
                    <span style={{ color: INK_SOFT }}>{label}</span>
                    <span className="tabular-nums" style={{ color: i === 0 ? INK : RED }}>{values[i]}</span>
                  </div>
                ))}
              </div>
              <div className="my-2.5" style={{ borderTop: "1.5px dashed #CDC5DE" }} />
              <p className="text-[10px] uppercase tracking-wider" style={{ color: INK_SOFT }}>{copy.keep}</p>
              <p className="text-[28px] font-semibold tabular-nums leading-tight" style={{ color: ACCENT }}>RM 57.50</p>
            </div>
          </div>
        </div>
      </div>

      <ul className="relative border-t" style={{ borderColor: "rgba(255,255,255,0.18)" }}>
        {copy.points.map((p) => (
          <li key={p} className="py-3 text-[15px] border-b" style={{ borderColor: "rgba(255,255,255,0.18)", color: LAVENDER }}>
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Outer auth-page shell: dark brand panel on the left and the form on a
 * white page on the right (desktop); a single white column on phones.
 * `footer` renders under the form.
 */
export function AuthShell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div data-auth-surface className="min-h-screen flex flex-col lg:flex-row" style={{ background: "#FFFFFF", fontFamily: BODY, color: INK }}>
      <AuthBrandPanel />
      <div className="flex-1 flex flex-col px-5 pt-5 pb-8 lg:px-12 lg:pt-8 lg:pb-12">
        <div className="flex justify-end mb-5">
          <LangSwitch />
        </div>
        <div className="flex-1 flex flex-col lg:items-center lg:justify-center">{children}</div>
        {footer}
      </div>
    </div>
  );
}

