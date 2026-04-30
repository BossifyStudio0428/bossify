import { motion } from "framer-motion";
import type { ReactNode } from "react";

export type TransitionDirection = "fade" | "left" | "right";

const variants = {
  fade: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
  },
  right: {
    // New page slides in from the right (forward / next tab)
    initial: { opacity: 0, x: 40 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -40 },
  },
  left: {
    // New page slides in from the left (back / previous tab)
    initial: { opacity: 0, x: -40 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 40 },
  },
};

export function PageTransition({
  children,
  direction = "fade",
  pathKey,
}: {
  children: ReactNode;
  direction?: TransitionDirection;
  pathKey: string;
}) {
  const v = variants[direction];
  return (
    <motion.div
      key={pathKey}
      initial={v.initial}
      animate={v.animate}
      transition={{ duration: 0.2, ease: "easeOut" }}
      style={{
        width: "100%",
        minHeight: "100%",
      }}
    >
      {children}
    </motion.div>
  );
}