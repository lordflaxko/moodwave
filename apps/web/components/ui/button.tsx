import { forwardRef } from "react";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "mood" | "glass" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-fg text-ink hover:bg-white shadow-[0_8px_30px_-8px_rgb(255_255_255/0.35)] hover:shadow-[0_10px_40px_-6px_rgb(255_255_255/0.45)]",
  mood: "mood-ring text-white shadow-[0_10px_40px_-10px_var(--mood-a)] hover:brightness-110",
  glass: "glass text-fg hover:bg-white/10 hover:border-line-strong",
  ghost: "text-fg-muted hover:text-fg hover:bg-white/[0.06]",
  danger: "text-coral hover:bg-coral/10",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-full",
  md: "h-10 px-4 text-sm gap-2 rounded-full",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-full",
  icon: "h-9 w-9 rounded-full",
};

export function buttonClasses(variant: Variant = "glass", size: Size = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none",
    "transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "glass", size = "md", loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});
