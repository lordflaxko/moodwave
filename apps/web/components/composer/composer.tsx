"use client";

import { ArrowUp, Minus, Plus, SlidersHorizontal } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

import { GenerationOverlay } from "@/components/composer/generation-overlay";
import { Popover, PopoverContent, PopoverTrigger, Segmented, Switch } from "@/components/ui/primitives";
import { useConfig, useMe } from "@/lib/api/hooks";
import { EASE } from "@/lib/motion";
import { TYPEWRITER_PROMPTS } from "@/lib/moods";
import { useGenerateFlow } from "@/lib/use-generate-flow";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 500;

type EnergyKey = "auto" | "calm" | "steady" | "lift" | "peak";
const ENERGY: Record<EnergyKey, number | null> = { auto: null, calm: 0.2, steady: 0.45, lift: 0.68, peak: 0.9 };
const ENERGY_OPTIONS: { value: EnergyKey; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "calm", label: "Calm" },
  { value: "steady", label: "Steady" },
  { value: "lift", label: "Lift" },
  { value: "peak", label: "Peak" },
];

/** Types and deletes example moments, like someone thinking out loud. */
function useTypewriter(phrases: string[], active: boolean) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!active) return;
    let phrase = 0;
    let char = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = phrases[phrase];
      if (!deleting) {
        char++;
        setText(current.slice(0, char));
        if (char === current.length) {
          deleting = true;
          timer = setTimeout(tick, 2400);
          return;
        }
        timer = setTimeout(tick, 42 + Math.random() * 45);
      } else {
        char -= 2;
        setText(current.slice(0, Math.max(0, char)));
        if (char <= 0) {
          deleting = false;
          phrase = (phrase + 1) % phrases.length;
          timer = setTimeout(tick, 380);
          return;
        }
        timer = setTimeout(tick, 16);
      }
    };
    timer = setTimeout(tick, 900);
    return () => clearTimeout(timer);
  }, [phrases, active]);
  return text;
}

function LengthStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center rounded-full border border-line-strong" role="group" aria-label="Playlist length">
      <button
        type="button"
        onClick={() => onChange(Math.max(15, value - 3))}
        disabled={value <= 15}
        className="grid size-8 place-items-center rounded-full text-fg-subtle transition hover:text-fg disabled:opacity-30"
        aria-label="Fewer songs"
      >
        <Minus className="size-3.5" />
      </button>
      <span className="min-w-[4.5rem] text-center font-mono text-[11px] tracking-wider text-fg-muted uppercase tabular-nums" aria-live="polite">
        {value} songs
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(30, value + 3))}
        disabled={value >= 30}
        className="grid size-8 place-items-center rounded-full text-fg-subtle transition hover:text-fg disabled:opacity-30"
        aria-label="More songs"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

export function Composer({
  value,
  onValueChange,
  autoFocus,
  focusSignal,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  autoFocus?: boolean;
  /** Increment to programmatically focus the prompt (e.g. after picking a mood). */
  focusSignal?: number;
  className?: string;
}) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const [length, setLength] = useState(24);
  const [energy, setEnergy] = useState<EnergyKey>("auto");
  const [clean, setClean] = useState(false);
  const [useTaste, setUseTaste] = useState(false);
  const { data: config } = useConfig();
  const { data: me } = useMe();
  const { start, isPending, variables } = useGenerateFlow();

  const typed = useTypewriter(TYPEWRITER_PROMPTS, !value && !focused);
  const tasteAvailable = Boolean(config?.spotify_enabled && me && !me.is_demo);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(() => {
    if (!focusSignal) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [focusSignal]);

  const submit = () => {
    if (isPending) return;
    void start({
      prompt: value,
      length,
      energy: ENERGY[energy],
      allow_explicit: !clean,
      use_my_taste: tasteAvailable && useTaste,
    });
  };

  const toggles = (
    <div className="space-y-4">
      <Switch label="Clean only" description="Skip songs with explicit lyrics" checked={clean} onChange={setClean} />
      <Switch
        label="Blend in my taste"
        description={tasteAvailable ? "Uses your top Spotify artists" : "Connect Spotify to enable"}
        checked={tasteAvailable && useTaste}
        onChange={setUseTaste}
        disabled={!tasteAvailable}
      />
    </div>
  );

  return (
    <>
      <motion.form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        aria-label="Describe your playlist"
        className={cn("relative", className)}
        animate={{ scale: focused ? 1.012 : 1 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        {/* Halo: blooms when the composer has focus */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -inset-10 -z-10 rounded-[4rem] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-lilac)_28%,transparent),transparent)] blur-2xl"
          animate={{ opacity: focused ? 0.9 : 0.35, scale: focused ? 1.04 : 0.96 }}
          transition={{ duration: 0.9, ease: EASE }}
        />

        <div
          className={cn(
            "relative rounded-[2rem] border bg-ink-2/85 p-2 shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)] backdrop-blur-xl transition-colors duration-500",
            focused ? "border-lilac/35" : "border-line-strong",
          )}
        >
          <div className="flex items-center justify-between px-5 pt-4">
            <span className="eyebrow flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-lilac" aria-hidden />
              New playlist
            </span>
            <span className="eyebrow hidden text-fg-faint sm:inline">
              {value.length > 0 ? `${value.length}/${MAX_LENGTH}` : "Enter ↵ to compose"}
            </span>
          </div>

          <div className="relative px-5 pt-3 pb-2">
            <label htmlFor={id} className="sr-only">
              Describe a moment, a feeling, or a place
            </label>
            <textarea
              id={id}
              ref={textareaRef}
              value={value}
              rows={2}
              maxLength={MAX_LENGTH}
              onChange={(e) => onValueChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Describe a moment, a feeling, or a place"
              className="block min-h-[4.5rem] w-full resize-none bg-transparent font-display text-[1.65rem] leading-snug font-light tracking-[-0.02em] text-fg outline-none placeholder:text-transparent focus-visible:outline-none sm:text-[2rem]"
            />
            {!value ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-5 top-3 line-clamp-2 font-display text-[1.65rem] leading-snug font-light tracking-[-0.02em] text-fg-faint sm:text-[2rem]"
              >
                {focused ? (
                  <span>Describe a moment, a feeling, or a place…</span>
                ) : (
                  <>
                    <span className="text-fg-subtle italic">Music for </span>
                    {typed}
                    <span className="ml-0.5 inline-block h-[0.9em] w-px translate-y-[0.12em] animate-pulse bg-lilac" />
                  </>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line px-3 pt-3 pb-1.5">
            <div className="hidden items-center gap-2 lg:flex">
              <LengthStepper value={length} onChange={setLength} />
              <Segmented label="Energy" value={energy} options={ENERGY_OPTIONS} onChange={setEnergy} />
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="More options"
                    className={cn(
                      "grid size-8 place-items-center rounded-full border transition-colors",
                      clean || (tasteAvailable && useTaste) ? "border-lilac/50 text-lilac" : "border-line-strong text-fg-subtle hover:text-fg",
                    )}
                  >
                    <SlidersHorizontal className="size-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-72">
                  {toggles}
                </PopoverContent>
              </Popover>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 items-center gap-2 rounded-full border border-line-strong px-3.5 text-[13px] text-fg-subtle transition hover:text-fg lg:hidden"
                >
                  <SlidersHorizontal className="size-3.5" /> {length} songs · {ENERGY_OPTIONS.find((o) => o.value === energy)?.label}
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-[min(22rem,calc(100vw-2rem))]">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm">Length</span>
                    <LengthStepper value={length} onChange={setLength} />
                  </div>
                  <div className="space-y-2">
                    <span className="text-sm">Energy</span>
                    <Segmented label="Energy (mobile)" value={energy} options={ENERGY_OPTIONS} onChange={setEnergy} className="w-full justify-between" />
                  </div>
                  {toggles}
                </div>
              </PopoverContent>
            </Popover>

            <motion.button
              type="submit"
              disabled={value.trim().length < 3 || isPending}
              whileTap={{ scale: 0.92 }}
              className={cn(
                "group flex h-11 items-center gap-2.5 rounded-full pr-1.5 pl-5 text-sm font-medium transition-all duration-500",
                value.trim().length >= 3
                  ? "bg-lilac text-ink shadow-[0_12px_40px_-10px_var(--color-lilac)]"
                  : "bg-white/[0.06] text-fg-faint",
              )}
            >
              Compose
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full transition-transform duration-500 group-hover:-translate-y-0.5",
                  value.trim().length >= 3 ? "bg-ink text-lilac" : "bg-white/5",
                )}
              >
                <ArrowUp className="size-4" />
              </span>
            </motion.button>
          </div>
        </div>
      </motion.form>

      <AnimatePresence>{isPending ? <GenerationOverlay prompt={variables?.prompt ?? value} /> : null}</AnimatePresence>
    </>
  );
}
