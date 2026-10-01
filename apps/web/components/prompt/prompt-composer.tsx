"use client";

import { ArrowUp, SlidersHorizontal } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

import { GenerationOverlay } from "@/components/prompt/generation-overlay";
import { Button } from "@/components/ui/button";
import { Slider, Switch } from "@/components/ui/primitives";
import { useConfig, useMe } from "@/lib/api/hooks";
import { TYPEWRITER_PROMPTS } from "@/lib/prompts";
import { useGenerateFlow } from "@/lib/use-generate-flow";
import { cn, energyLabel } from "@/lib/utils";

const MAX_LENGTH = 500;

/** Cycles through example prompts, typing and deleting them like a person would. */
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
          timer = setTimeout(tick, 2200);
          return;
        }
        timer = setTimeout(tick, 38 + Math.random() * 40);
      } else {
        char -= 2;
        setText(current.slice(0, Math.max(0, char)));
        if (char <= 0) {
          deleting = false;
          phrase = (phrase + 1) % phrases.length;
          timer = setTimeout(tick, 400);
          return;
        }
        timer = setTimeout(tick, 18);
      }
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [phrases, active]);
  return text;
}

export function PromptComposer({
  value,
  onValueChange,
  variant = "hero",
  autoFocus,
}: {
  value: string;
  onValueChange: (value: string) => void;
  variant?: "hero" | "studio";
  autoFocus?: boolean;
}) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const [showControls, setShowControls] = useState(variant === "studio");
  const [length, setLength] = useState(24);
  const [autoEnergy, setAutoEnergy] = useState(true);
  const [energy, setEnergy] = useState(0.5);
  const [allowExplicit, setAllowExplicit] = useState(true);
  const [useTaste, setUseTaste] = useState(false);
  const { data: config } = useConfig();
  const { data: me } = useMe();
  const { start, isPending, variables } = useGenerateFlow();

  const typed = useTypewriter(TYPEWRITER_PROMPTS, !value && !focused);
  const tasteAvailable = Boolean(config?.spotify_enabled && me && !me.is_demo);

  // Grow the textarea with its content.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const submit = () => {
    if (isPending) return;
    void start({
      prompt: value,
      length,
      energy: autoEnergy ? null : energy,
      allow_explicit: allowExplicit,
      use_my_taste: tasteAvailable && useTaste,
    });
  };

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="group relative"
        aria-label="Describe your playlist"
      >
        {/* Animated glow ring */}
        <div
          aria-hidden
          className={cn(
            "absolute -inset-px rounded-[2rem] opacity-60 blur-[2px] transition-opacity duration-500",
            "bg-[conic-gradient(from_var(--angle),var(--mood-a),transparent_30%,var(--mood-b),transparent_70%,var(--mood-a))]",
            "[--angle:0deg] animate-[spin-angle_8s_linear_infinite]",
            focused && "opacity-100",
          )}
        />
        <div
          aria-hidden
          className="absolute -inset-6 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--mood-a)_35%,transparent),transparent)] opacity-60 blur-2xl"
        />

        <div className="relative rounded-[2rem] bg-ink-2/90 p-2 backdrop-blur-xl">
          <div className="relative px-4 pt-4 sm:px-5">
            <label htmlFor={id} className="sr-only">
              Describe the playlist you want
            </label>
            <textarea
              id={id}
              ref={textareaRef}
              value={value}
              maxLength={MAX_LENGTH}
              rows={variant === "studio" ? 3 : 2}
              onChange={(e) => onValueChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              className={cn(
                "block w-full resize-none bg-transparent text-lg leading-relaxed text-fg outline-none placeholder:text-transparent sm:text-xl",
                "min-h-[3.5rem] focus-visible:outline-none",
              )}
              placeholder="Describe a mood, moment or vibe"
            />
            {!value ? (
              <div
                aria-hidden
                className="pointer-events-none absolute top-4 left-4 right-4 text-lg leading-relaxed text-fg-subtle sm:left-5 sm:text-xl"
              >
                {focused ? (
                  "Describe a mood, moment or vibe…"
                ) : (
                  <>
                    <span className="text-fg-muted">A playlist for </span>
                    {typed}
                    <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse bg-[var(--mood-b)]" />
                  </>
                )}
              </div>
            ) : null}
          </div>

          <AnimatePresence initial={false}>
            {showControls ? (
              <motion.div
                key="controls"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="mx-2 mt-3 grid gap-5 rounded-3xl border border-line bg-white/[0.025] p-4 sm:grid-cols-2 sm:p-5">
                  <div>
                    <div className="mb-2.5 flex items-center justify-between text-sm">
                      <span>Length</span>
                      <span className="font-mono text-xs text-fg-muted">{length} songs</span>
                    </div>
                    <Slider label="Playlist length" min={15} max={30} value={length} onChange={setLength} />
                  </div>
                  <div>
                    <div className="mb-2.5 flex items-center justify-between text-sm">
                      <span>Energy</span>
                      <button
                        type="button"
                        onClick={() => setAutoEnergy((a) => !a)}
                        className={cn(
                          "rounded-full px-2 py-0.5 font-mono text-xs transition",
                          autoEnergy ? "bg-[var(--mood-a)]/25 text-fg" : "text-fg-muted hover:text-fg",
                        )}
                        aria-pressed={autoEnergy}
                      >
                        {autoEnergy ? "AI decides" : `${energyLabel(energy)} · ${Math.round(energy * 100)}`}
                      </button>
                    </div>
                    <Slider
                      label="Energy level"
                      min={0}
                      max={100}
                      value={Math.round(energy * 100)}
                      onChange={(v) => {
                        setAutoEnergy(false);
                        setEnergy(v / 100);
                      }}
                      className={cn(autoEnergy && "opacity-40")}
                    />
                  </div>
                  <Switch
                    label="Allow explicit songs"
                    checked={allowExplicit}
                    onChange={setAllowExplicit}
                  />
                  <Switch
                    label="Blend in my taste"
                    description={tasteAvailable ? "Uses your top Spotify artists" : "Connect Spotify to enable"}
                    checked={tasteAvailable && useTaste}
                    onChange={setUseTaste}
                    disabled={!tasteAvailable}
                  />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="flex items-center justify-between gap-2 px-2 pt-3 pb-1">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowControls((s) => !s)}
                aria-expanded={showControls}
              >
                <SlidersHorizontal className="size-3.5" />
                Tune
              </Button>
              <span className="hidden font-mono text-[11px] text-fg-subtle sm:inline">
                {value.length > 0 ? `${value.length}/${MAX_LENGTH}` : "Enter ↵ to generate"}
              </span>
            </div>
            <Button
              type="submit"
              variant="mood"
              size={variant === "hero" ? "md" : "lg"}
              loading={isPending}
              disabled={value.trim().length < 3}
              className="pr-3 pl-5"
            >
              Generate
              {!isPending ? (
                <span className="grid size-6 place-items-center rounded-full bg-white/20">
                  <ArrowUp className="size-3.5" />
                </span>
              ) : null}
            </Button>
          </div>
        </div>
      </form>
      <GenerationOverlay open={isPending} prompt={variables?.prompt ?? value} />
    </>
  );
}
