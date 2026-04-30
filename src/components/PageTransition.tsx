import { useEffect, useState, type ReactNode } from "react";

export type TransitionDirection = "fade" | "left" | "right";

export function PageTransition({
  children,
  pathKey,
}: {
  children: ReactNode;
  direction?: TransitionDirection;
  pathKey: string;
}) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(false);
    // Trigger transition on next frame for smooth CSS animation
    const id = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(id);
  }, [pathKey]);

  return (
    <div
      key={pathKey}
      className={`page-enter${active ? " page-enter-active" : ""}`}
      style={{ width: "100%", minHeight: "100%" }}
    >
      {children}
    </div>
  );
}