import { type ReactNode } from "react";

export type TransitionDirection = "fade" | "left" | "right";

/**
 * Pure CSS page transition. Re-mounts on pathKey change and runs a 120ms fade-in.
 * No JS animation libraries, no rAF — keeps mobile WebView fast.
 */
export function PageTransition({
  children,
  pathKey,
}: {
  children: ReactNode;
  direction?: TransitionDirection;
  pathKey: string;
}) {
  return (
    <div
      key={pathKey}
      className="page-transition"
      style={{ width: "100%", minHeight: "100%" }}
    >
      {children}
    </div>
  );
}