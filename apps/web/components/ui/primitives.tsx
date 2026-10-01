"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import * as RadixSlider from "@radix-ui/react-slider";
import * as RadixSwitch from "@radix-ui/react-switch";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export function Chip({
  children,
  className,
  tone = "default",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "mood" | "outline";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        tone === "default" && "bg-white/[0.07] text-fg-muted",
        tone === "mood" &&
          "border border-[color-mix(in_oklab,var(--mood-b)_35%,transparent)] bg-[color-mix(in_oklab,var(--mood-a)_18%,transparent)] text-[color-mix(in_oklab,var(--mood-b)_45%,white)]",
        tone === "outline" && "border border-line text-fg-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-lg", className)} />;
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  className?: string;
}) {
  return (
    <RadixSlider.Root
      className={cn("relative flex h-5 w-full touch-none items-center select-none", className)}
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={([v]) => onChange(v)}
    >
      <RadixSlider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-white/10">
        <RadixSlider.Range className="mood-ring absolute h-full rounded-full" />
      </RadixSlider.Track>
      <RadixSlider.Thumb
        aria-label={label}
        className="block size-4 rounded-full bg-white shadow-[0_0_0_4px_rgb(255_255_255/0.12),0_4px_14px_rgb(0_0_0/0.5)] transition-transform hover:scale-110 focus-visible:scale-110"
      />
    </RadixSlider.Root>
  );
}

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
    <div className={cn("flex items-center justify-between gap-4", disabled && "opacity-50")}>
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm text-fg">{label}</span>
        {description ? <span className="block text-xs text-fg-subtle">{description}</span> : null}
      </label>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="relative h-6 w-11 shrink-0 rounded-full bg-white/12 transition-colors data-[state=checked]:bg-[var(--mood-a)]"
      >
        <RadixSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
      </RadixSwitch.Root>
    </div>
  );
}

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
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <RadixDialog.Content
          className={cn(
            "glass-strong fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl3 p-6",
            "flex max-h-[85dvh] flex-col focus:outline-none",
            className,
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <RadixDialog.Title className="text-lg font-semibold tracking-tight">{title}</RadixDialog.Title>
              <RadixDialog.Description className={description ? "mt-1 text-sm text-fg-muted" : "sr-only"}>
                {description ?? title}
              </RadixDialog.Description>
            </div>
            <RadixDialog.Close
              className="rounded-full p-1.5 text-fg-muted transition hover:bg-white/10 hover:text-fg"
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
