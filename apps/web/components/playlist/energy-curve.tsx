"use client";

import { motion } from "motion/react";
import { useId } from "react";

/** Smooth sparkline of per-track energy, drawn with a Catmull-Rom → Bézier path. */
export function EnergyCurve({ values, height = 72, className }: { values: number[]; height?: number; className?: string }) {
  const gradientId = useId();
  const width = 320;
  if (values.length < 2) return null;

  const pad = 6;
  const points = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (width - pad * 2),
    pad + (1 - Math.max(0, Math.min(1, v))) * (height - pad * 2),
  ]);

  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const [p1, p2] = [points[i], points[i + 1]];
    const p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  const area = `${d} L ${points[points.length - 1][0]} ${height} L ${points[0][0]} ${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`Energy across the playlist, from ${Math.round(values[0] * 100)} to ${Math.round(values[values.length - 1] * 100)} out of 100`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--mood-a)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--mood-a)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${gradientId}-stroke`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--mood-a)" />
          <stop offset="100%" stopColor="var(--mood-b)" />
        </linearGradient>
      </defs>
      <motion.path
        d={area}
        fill={`url(#${gradientId}-fill)`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.4 }}
      />
      <motion.path
        d={d}
        fill="none"
        stroke={`url(#${gradientId}-stroke)`}
        strokeWidth="2.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
      />
    </svg>
  );
}
