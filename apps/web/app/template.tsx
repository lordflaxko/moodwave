"use client";

import { motion } from "motion/react";

import { EASE } from "@/lib/motion";

/**
 * Page transition: each route fades and rises in (templates re-mount on navigation).
 * No `filter` here: it would become the containing block for `position: fixed` children.
 * Fixed UI (overlays, docks) is portaled to <body> regardless.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
