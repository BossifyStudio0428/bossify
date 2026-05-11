import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
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
  route?: string;
  targetId?: string;
  titleKey: string;
  bodyKey: string;
  pulse?: boolean;
  padding?: number;
};

const TOTAL = 20;

const STEPS: Step[] = [
  { titleKey: "tour_t_1",  bodyKey: "tour_b_1" },
  { route: "/",            targetId: "tour-tab-profile",     titleKey: "tour_t_2",  bodyKey: "tour_b_2",  pulse: true, padding: 6 },
  { route: "/profile",     targetId: "tour-menu-biz",        titleKey: "tour_t_3",  bodyKey: "tour_b_3" },
  { route: "/profile",     targetId: "tour-payment-card",    titleKey: "tour_t_4",  bodyKey: "tour_b_4" },
  { route: "/profile",     targetId: "tour-menu-lang",       titleKey: "tour_t_5",  bodyKey: "tour_b_5" },
  { route: "/profile",     targetId: "tour-tab-inventory",   titleKey: "tour_t_6",  bodyKey: "tour_b_6",  pulse: true, padding: 6 },
  { route: "/inventory",   targetId: "tour-inv-add",         titleKey: "tour_t_7",  bodyKey: "tour_b_7",  pulse: true, padding: 8 },
  { route: "/inventory",   targetId: "tour-inv-card",        titleKey: "tour_t_8",  bodyKey: "tour_b_8" },
  { route: "/inventory",   targetId: "tour-new-order",       titleKey: "tour_t_9",  bodyKey: "tour_b_9",  pulse: true, padding: 12 },
  { route: "/new-order",   targetId: "tour-no-product",      titleKey: "tour_t_10", bodyKey: "tour_b_10" },
  { route: "/new-order",   targetId: "tour-no-status",       titleKey: "tour_t_11", bodyKey: "tour_b_11" },
  { route: "/new-order",   targetId: "tour-no-wa",           titleKey: "tour_t_12", bodyKey: "tour_b_12" },
  { route: "/new-order",   targetId: "tour-tab-orders",      titleKey: "tour_t_13", bodyKey: "tour_b_13", pulse: true, padding: 6 },
  { route: "/orders",      targetId: "tour-orders-filters",  titleKey: "tour_t_14", bodyKey: "tour_b_14" },
  { route: "/orders",      targetId: "tour-orders-remind",   titleKey: "tour_t_15", bodyKey: "tour_b_15" },
  { route: "/orders",      targetId: "tour-tab-customers",   titleKey: "tour_t_16", bodyKey: "tour_b_16", pulse: true, padding: 6 },
  { route: "/customers",   targetId: "tour-cust-wa",         titleKey: "tour_t_17", bodyKey: "tour_b_17" },
  { route: "/",            targetId: "tour-stats",           titleKey: "tour_t_18", bodyKey: "tour_b_18" },
  { route: "/",            targetId: "tour-analytics",       titleKey: "tour_t_19", bodyKey: "tour_b_19", pulse: true, padding: 6 },
  { route: "/",            titleKey: "tour_t_20", bodyKey: "tour_b_20" },
];

export function AppTour({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const pollRef = useRef<number | null>(null);
  const step = STEPS[stepIdx];

  // Navigate to step's route (if needed)
  useEffect(() => {
    if (step.route && location.pathname !== step.route) {
      navigate({ to: step.route, replace: true });
    }
  }, [stepIdx]);

  // Poll for the target element until found or timeout (~3s)
  useLayoutEffect(() => {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    setRect(null);
    if (!step.targetId) return;
    const start = Date.now();
    const tick = () => {
      const el = document.getElementById(step.targetId!);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          // Try to scroll the element into view if off-screen
          const vh = window.innerHeight;
          if (r.top < 80 || r.bottom > vh - 100) {
            try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch {}
          }
          setRect(el.getBoundingClientRect());
          if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
          return;
        }
      }
      if (Date.now() - start > 3000) {
        if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
        // give up, render centered
        setRect(null);
      }
    };
    tick();
    pollRef.current = window.setInterval(tick, 120);
    return () => {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [stepIdx, location.pathname]);

  // Re-measure on resize / scroll
  useEffect(() => {
    const onMove = () => {
      if (!step.targetId) return;
      const el = document.getElementById(step.targetId);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [stepIdx]);

  const finish = () => {
    markTourDone();
    navigate({ to: "/", replace: true });
    onClose();
  };
  const next = () => stepIdx >= STEPS.length - 1 ? finish() : setStepIdx(stepIdx + 1);
  const skip = () => { markTourDone(); onClose(); };

  const pad = step.padding ?? 8;
  const spotlight = rect ? {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  } : null;

  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const tooltipMaxW = Math.min(340, vw - 32);
  let tooltipStyle: React.CSSProperties;
  let arrow: "up" | "down" | "none" = "none";
  if (spotlight) {
    const spaceBelow = vh - (spotlight.top + spotlight.height);
    const spaceAbove = spotlight.top;
    const placeBelow = spaceBelow > 220 || spaceBelow >= spaceAbove;
    if (placeBelow) {
      tooltipStyle = { top: spotlight.top + spotlight.height + 14, left: 16, right: 16 };
      arrow = "up";
    } else {
      tooltipStyle = { bottom: vh - spotlight.top + 14, left: 16, right: 16 };
      arrow = "down";
    }
  } else {
    tooltipStyle = { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: tooltipMaxW };
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
        key={stepIdx}
        className="fixed bg-white text-slate-900 rounded-2xl shadow-2xl p-5 animate-scale-in"
        style={tooltipStyle}
      >
        {arrow !== "none" && spotlight && (
          <div
            className="absolute h-3 w-3 bg-white rotate-45"
            style={{
              left: Math.max(
                20,
                Math.min(
                  (spotlight.left + spotlight.width / 2) - 16 - 6,
                  vw - 32 - 24
                )
              ),
              top: arrow === "up" ? -6 : undefined,
              bottom: arrow === "down" ? -6 : undefined,
            }}
          />
        )}
        <p className="text-[11px] font-semibold text-primary uppercase tracking-wider">
          {t("tour_step_of").replace("{x}", String(stepIdx + 1))}
        </p>
        <h3 className="mt-1 text-lg font-bold leading-tight">{t(step.titleKey as any)}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-700">{t(step.bodyKey as any)}</p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button onClick={skip} className="text-xs text-slate-500 underline">
            {t("tour_skip")}
          </button>
          <button
            onClick={next}
            className="px-5 h-10 rounded-full bg-primary text-primary-foreground text-sm font-bold active:scale-95 transition-transform shadow-[var(--shadow-soft)]"
          >
            {isLast ? t("tour_finish") : `${t("tour_next")} →`}
          </button>
        </div>
        <div
          className="absolute -top-1 left-0 right-0 h-1 rounded-t-2xl bg-slate-100 overflow-hidden"
          aria-hidden
        >
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((stepIdx + 1) / TOTAL) * 100}%` }}
          />
        </div>
      </div>

      <style>{`
        @keyframes tour-pulse {
          0%, 100% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.72), 0 0 0 0 hsl(var(--primary) / 0.6); }
          50% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.72), 0 0 0 14px hsl(var(--primary) / 0); }
        }
      `}</style>
    </div>
  );
}
