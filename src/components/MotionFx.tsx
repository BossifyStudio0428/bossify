import { useEffect, useRef, type ReactNode } from "react";

/**
 * Shared desktop-only micro-interaction primitives, used across the
 * authenticated app (AppShell), the public landing page, and the auth
 * screens — so "mouse-follow light" and "3D tilt" come from one place
 * instead of being reinvented per surface.
 *
 * Both are no-ops (and render inert/no listeners) on touch devices —
 * `pointer: fine` + `hover: hover` gate everything, matching the existing
 * TiltWrap pattern already used on the landing page.
 */

const FINE_POINTER = "(hover: hover) and (pointer: fine)";
const REDUCE_MOTION = "(prefers-reduced-motion: reduce)";

/** One ambient glow that follows the mouse, mounted once near the app
 * root. Pure decoration — fixed, pointer-events:none, low z-index — see
 * `.bf-mouse-glow` in styles.css for the actual visuals. */
export function MouseGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia(FINE_POINTER).matches) return;
    if (window.matchMedia(REDUCE_MOTION).matches) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const onMove = (e: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--mx", `${e.clientX}px`);
        el.style.setProperty("--my", `${e.clientY}px`);
        el.style.opacity = "1";
        raf = 0;
      });
      if (hideTimer) clearTimeout(hideTimer);
      // Fade out if the mouse stops moving for a while (e.g. user starts
      // typing) rather than leaving a static glow parked on screen.
      hideTimer = setTimeout(() => { el.style.opacity = "0"; }, 2200);
    };
    const onLeaveWindow = () => { el.style.opacity = "0"; };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseout", (e) => {
      if (!e.relatedTarget) onLeaveWindow();
    });

    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  return <div ref={ref} aria-hidden className="bf-mouse-glow" />;
}

/** Wraps `children` in a card that tilts toward the cursor (perspective
 * rotateX/rotateY), resetting smoothly on mouse-leave. Mirrors the
 * landing page's local `TiltWrap` so the same feel is reusable in the
 * dashboard app and the auth screens without duplicating it per file. */
export function TiltCard({
  children,
  max = 5,
  className,
}: {
  children: ReactNode;
  max?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia(FINE_POINTER).matches) return;
    if (window.matchMedia(REDUCE_MOTION).matches) return;

    let frame = 0;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`;
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      el.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(frame);
    };
  }, [max]);

  return (
    <div ref={ref} className={className} style={{ transition: "transform 0.25s ease-out", willChange: "transform" }}>
      {children}
    </div>
  );
}
