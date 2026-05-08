import { useEffect, useLayoutEffect, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { safeLocalStorage } from "@/lib/safeStorage";

export const TOUR_DONE_KEY = "bossify_tour_done";

export function hasCompletedTour(): boolean {
  return safeLocalStorage.getItem(TOUR_DONE_KEY) === "1";
}
export function markTourDone() {
  safeLocalStorage.setItem(TOUR_DONE_KEY, "1");
}
export function resetTour() {
  safeLocalStorage.removeItem(TOUR_DONE_KEY);
}

type Step = {
  targetId?: string;
  textKey: string;
  pulse?: boolean;
  padding?: number;
};

const STEPS: Step[] = [
  { targetId: "tour-stats", textKey: "tour_msg_1", padding: 8 },
  { targetId: "tour-new-order", textKey: "tour_msg_2", pulse: true, padding: 12 },
  { targetId: "tour-tab-orders", textKey: "tour_msg_3", padding: 8 },
  { targetId: "tour-tab-inventory", textKey: "tour_msg_4", padding: 8 },
  { targetId: "tour-tab-customers", textKey: "tour_msg_5", padding: 8 },
  { targetId: "tour-tab-profile", textKey: "tour_profile", padding: 8 },
  { textKey: "tour_msg_6" },
];

export function AppTour({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[stepIdx];

  const measure = () => {
    if (!step.targetId) { setRect(null); return; }
    const el = document.getElementById(step.targetId);
    if (!el) { setRect(null); return; }
    setRect(el.getBoundingClientRect());
  };

  useLayoutEffect(() => {
    measure();
    const id = window.setTimeout(measure, 60);
    return () => window.clearTimeout(id);
  }, [stepIdx]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [stepIdx]);

  const finish = () => { markTourDone(); onClose(); };
  const next = () => stepIdx >= STEPS.length - 1 ? finish() : setStepIdx(stepIdx + 1);
  const skip = () => finish();

  const pad = step.padding ?? 8;
  const spotlight = rect ? {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  } : null;

  // Tooltip positioning: below the spotlight if there's room, else above, else centered.
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const tooltipMaxW = Math.min(320, vw - 32);
  let tooltipStyle: React.CSSProperties;
  let arrow: "up" | "down" | "none" = "none";
  if (spotlight) {
    const spaceBelow = vh - (spotlight.top + spotlight.height);
    const spaceAbove = spotlight.top;
    const placeBelow = spaceBelow > 180 || spaceBelow >= spaceAbove;
    if (placeBelow) {
      tooltipStyle = { top: spotlight.top + spotlight.height + 14, left: 16, right: 16 };
      arrow = "up";
    } else {
      tooltipStyle = { bottom: vh - spotlight.top + 14, left: 16, right: 16 };
      arrow = "down";
    }
  } else {
    tooltipStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)", maxWidth: tooltipMaxW };
  }

  const isLast = stepIdx === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[100] animate-fade-in" role="dialog" aria-modal="true">
      {spotlight ? (
        <div
          className="fixed rounded-2xl pointer-events-none transition-all duration-300"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
            border: "2px solid hsl(var(--primary))",
            animation: step.pulse ? "tour-pulse 1.4s ease-in-out infinite" : undefined,
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/72" />
      )}

      <div
        className="fixed bg-card text-card-foreground rounded-2xl shadow-2xl p-4 animate-scale-in"
        style={tooltipStyle}
      >
        {arrow !== "none" && spotlight && (
          <div
            className="absolute h-3 w-3 bg-card rotate-45"
            style={{
              left: Math.max(20, Math.min((spotlight.left + spotlight.width / 2) - (typeof tooltipStyle.left === "number" ? tooltipStyle.left : 16) - 6, tooltipMaxW - 24)),
              top: arrow === "up" ? -6 : undefined,
              bottom: arrow === "down" ? -6 : undefined,
            }}
          />
        )}
        <p className="text-sm text-foreground leading-relaxed">{t(step.textKey as any)}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button onClick={skip} className="text-xs text-muted-foreground underline">
            {t("tour_skip")}
          </button>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-muted-foreground">
              {t("tour_step").replace("{x}", String(stepIdx + 1))}
            </span>
            <button
              onClick={next}
              className="px-4 h-9 rounded-full bg-primary text-primary-foreground text-sm font-semibold active:scale-95 transition-transform"
            >
              {isLast ? t("tour_finish") : `${t("tour_next")} →`}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes tour-pulse {
          0%, 100% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.72), 0 0 0 0 hsl(var(--primary) / 0.6); }
          50% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.72), 0 0 0 12px hsl(var(--primary) / 0); }
        }
      `}</style>
    </div>
  );
}
