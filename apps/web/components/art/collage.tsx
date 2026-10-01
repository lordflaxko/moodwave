"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

import { Cover } from "@/components/art/cover";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface CollageItem {
  src: string | null | undefined;
  seed: string;
  alt?: string;
}

function pad(items: CollageItem[], count: number): CollageItem[] {
  const out = items.slice(0, count);
  while (out.length < count) out.push({ src: items[out.length % Math.max(items.length, 1)]?.src ?? null, seed: `pad-${out.length}` });
  return out;
}

/**
 * Album-art collage.
 * - `hero`: one large cover + five tiles on a 3×3 grid, with pointer-driven tilt.
 * - `grid`: a tight 2×2 mosaic (library cards); tiles drift apart on hover.
 * - `fan`: three covers fanned like records pulled from a crate.
 */
export function Collage({
  items,
  variant = "grid",
  className,
  priority,
}: {
  items: CollageItem[];
  variant?: "hero" | "grid" | "fan";
  className?: string;
  priority?: boolean;
}) {
  if (variant === "fan") return <Fan items={pad(items, 3)} className={className} />;
  if (variant === "hero") return <HeroCollage items={pad(items, 6)} className={className} priority={priority} />;

  return (
    <div className={cn("grid aspect-square grid-cols-2 gap-[3px] overflow-hidden", className)}>
      {pad(items, 4).map((item, i) => (
        <div key={`${item.seed}-${i}`} className="overflow-hidden">
          <Cover
            src={item.src}
            seed={item.seed}
            alt=""
            sizes="(min-width: 1024px) 160px, 45vw"
            className="h-full w-full transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.06]"
          />
        </div>
      ))}
    </div>
  );
}

function HeroCollage({ items, className, priority }: { items: CollageItem[]; className?: string; priority?: boolean }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-6, 6]), { stiffness: 120, damping: 18 });
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [5, -5]), { stiffness: 120, damping: 18 });

  return (
    <div
      className={cn("[perspective:1200px]", className)}
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - rect.left) / rect.width - 0.5);
        y.set((e.clientY - rect.top) / rect.height - 0.5);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      <motion.div
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="grid aspect-square grid-cols-3 grid-rows-3 gap-2"
      >
        {items.map((item, i) => (
          <motion.div
            key={`${item.seed}-${i}`}
            initial={{ opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.08 * i }}
            className={cn(
              "overflow-hidden rounded-xl shadow-[0_20px_50px_-20px_rgb(0_0_0/0.9)] ring-1 ring-white/[0.06]",
              i === 0 && "col-span-2 row-span-2 rounded-2xl",
            )}
          >
            <Cover
              src={item.src}
              seed={item.seed}
              alt={item.alt ?? ""}
              sizes={i === 0 ? "(min-width: 1024px) 360px, 60vw" : "(min-width: 1024px) 180px, 30vw"}
              priority={priority && i < 3}
              className="h-full w-full"
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

function Fan({ items, className }: { items: CollageItem[]; className?: string }) {
  const poses = [
    { rotate: -10, x: "-34%", z: 1 },
    { rotate: 8, x: "34%", z: 2 },
    { rotate: 0, x: "0%", z: 3 },
  ];
  return (
    <div className={cn("relative aspect-square", className)}>
      {items.map((item, i) => (
        <div
          key={`${item.seed}-${i}`}
          className="absolute inset-[12%] transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:[transform:var(--fan-hover)]"
          style={
            {
              zIndex: poses[i].z,
              transform: `translateX(${poses[i].x}) rotate(${poses[i].rotate}deg) scale(0.86)`,
              "--fan-hover": `translateX(calc(${poses[i].x} * 1.25)) rotate(${poses[i].rotate * 1.4}deg) scale(0.9)`,
            } as React.CSSProperties
          }
        >
          <Cover src={item.src} seed={item.seed} alt="" sizes="120px" className="h-full w-full rounded-lg shadow-2xl shadow-black/70" />
        </div>
      ))}
    </div>
  );
}
