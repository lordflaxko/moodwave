import { LoaderCircle } from "lucide-react";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

type Variant = "solid" | "accent" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon" | "icon-lg";

const variants: Record<Variant, string> = {
  solid: "bg-fg text-ink hover:bg-white",
  accent: "bg-lilac text-ink hover:brightness-110 shadow-[0_10px_40px_-12px_var(--color-lilac)]",
  outline: "border border-line-strong text-fg hover:border-fg-faint hover:bg-white/[0.03]",
  ghost: "text-fg-muted hover:text-fg hover:bg-white/[0.05]",
  danger: "text-rose hover:bg-rose/10",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[13px] gap-1.5",
  md: "h-10 px-5 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2.5",
  icon: "size-9",
  "icon-lg": "size-12",
};

export function buttonClasses(variant: Variant = "outline", size: Size = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-full font-medium whitespace-nowrap select-none",
    "transition-[background-color,border-color,color,transform,filter,box-shadow] duration-300 ease-[var(--ease-out-expo)]",
    "active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40",
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
  { variant = "outline", size = "md", loading, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
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
