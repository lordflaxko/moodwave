"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import * as RadixPopover from "@radix-ui/react-popover";
import * as RadixSwitch from "@radix-ui/react-switch";
import { X } from "lucide-react";
import { motion, type HTMLMotionProps } from "motion/react";

import { EASE, fadeUp, stagger } from "@/lib/motion";
import { cn } from "@/lib/utils";

/* --- Text ----------------------------------------------------------------------- */

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("eyebrow", className)}>{children}</p>;
}

/* --- Pill ------------------------------------------------------------------------ */

export function Pill({
  children,
  className,
  tone = "default",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "outline" | "accent";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px]",
        tone === "default" && "bg-white/[0.05] text-fg-muted",
        tone === "outline" && "border border-line-strong text-fg-muted",
        tone === "accent" && "bg-lilac/12 text-lilac",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-xl", className)} />;
}

/* --- Reveal-on-scroll -------------------------------------------------------------- */

export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
} & Omit<HTMLMotionProps<"div">, "children">) {
  const Component = motion[as] as typeof motion.div;
  return (
    <Component
      className={className}
      initial={{ opacity: 0, y: 28, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.9, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </Component>
  );
}

/** Staggered reveal: wrap items in <RevealGroup> and give each child `variants={fadeUp}`. */
export function RevealGroup({
  children,
  className,
  step = 0.07,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  step?: number;
  as?: "div" | "ul" | "ol";
}) {
  const Component = motion[as] as typeof motion.div;
  return (
    <Component
      className={className}
      variants={stagger(step)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
    >
      {children}
    </Component>
  );
}

export { fadeUp };

/* --- Segmented control -------------------------------------------------------------- */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex rounded-full bg-white/[0.04] p-1", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-full px-3 py-1.5 text-[13px] transition-colors duration-300",
              active ? "text-ink" : "text-fg-subtle hover:text-fg",
            )}
          >
            {active ? (
              <motion.span
                layoutId={`seg-${label}`}
                className="absolute inset-0 rounded-full bg-fg"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            ) : null}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* --- Switch --------------------------------------------------------------------------- */

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = `switch-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className={cn("flex items-center justify-between gap-4", disabled && "opacity-40")}>
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm text-fg">{label}</span>
        {description ? <span className="block text-xs text-fg-subtle">{description}</span> : null}
      </label>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="relative h-6 w-10 shrink-0 rounded-full bg-white/10 transition-colors duration-300 data-[state=checked]:bg-lilac"
      >
        <RadixSwitch.Thumb className="block size-[18px] translate-x-[3px] rounded-full bg-fg shadow transition-transform duration-300 data-[state=checked]:translate-x-[19px] data-[state=checked]:bg-ink" />
      </RadixSwitch.Root>
    </div>
  );
}

/* --- Dialog ---------------------------------------------------------------------------- */

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[80] bg-ink/70 backdrop-blur-md" />
        <RadixDialog.Content
          className={cn(
            "surface fixed top-1/2 left-1/2 z-[80] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] p-7",
            "flex max-h-[85dvh] flex-col focus:outline-none",
            className,
          )}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <RadixDialog.Title className="font-display text-2xl font-light tracking-tight">{title}</RadixDialog.Title>
              <RadixDialog.Description className={description ? "mt-1.5 text-sm text-fg-muted" : "sr-only"}>
                {description ?? title}
              </RadixDialog.Description>
            </div>
            <RadixDialog.Close
              className="rounded-full p-2 text-fg-subtle transition hover:bg-white/5 hover:text-fg"
              aria-label="Close"
            >
              <X className="size-4" />
            </RadixDialog.Close>
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/* --- Menu & popover ---------------------------------------------------------------------- */

const floatingPanel =
  "chrome z-[75] min-w-48 rounded-2xl p-1.5 text-sm outline-none data-[state=open]:animate-in";

export const Menu = RadixDropdown.Root;
export const MenuTrigger = RadixDropdown.Trigger;

export function MenuContent({ children, align = "end" }: { children: React.ReactNode; align?: "start" | "end" }) {
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.Content align={align} sideOffset={8} className={floatingPanel}>
        {children}
      </RadixDropdown.Content>
    </RadixDropdown.Portal>
  );
}

export function MenuItem({
  children,
  onSelect,
  danger,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <RadixDropdown.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 outline-none data-[highlighted]:bg-white/[0.06]",
        danger ? "text-rose" : "text-fg-muted data-[highlighted]:text-fg",
      )}
    >
      {children}
    </RadixDropdown.Item>
  );
}

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;

export function PopoverContent({
  children,
  className,
  side = "bottom",
  align = "end",
}: {
  children: React.ReactNode;
  className?: string;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
}) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content side={side} align={align} sideOffset={10} className={cn(floatingPanel, "p-4", className)}>
        <motion.div initial={{ opacity: 0, y: side === "top" ? 6 : -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
          {children}
        </motion.div>
      </RadixPopover.Content>
    </RadixPopover.Portal>
  );
}
