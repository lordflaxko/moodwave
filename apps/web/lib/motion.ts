import type { Transition, Variants } from "motion/react";

/** One easing curve for the whole product: fast start, long soft landing. */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const spring = {
  soft: { type: "spring", stiffness: 180, damping: 26 } satisfies Transition,
  snappy: { type: "spring", stiffness: 420, damping: 34 } satisfies Transition,
  layout: { type: "spring", stiffness: 300, damping: 34, mass: 0.8 } satisfies Transition,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: EASE } },
};

export const stagger = (step = 0.06, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});
