"use client";

import { LogOut, Menu as MenuIcon, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Logo, SpotifyGlyph } from "@/components/layout/logo";
import { Button, buttonClasses } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger, Skeleton } from "@/components/ui/primitives";
import { useConfig, useDemoLogin, useLogout, useMe } from "@/lib/api/hooks";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";

// When the Framer marketing site is live, the wordmark and "How it works" lead back to it.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

const LINKS = [
  { href: "/generate", label: "Create" },
  { href: "/library", label: "Library" },
  { href: SITE_URL ? `${SITE_URL}/how-it-works` : "/about", label: "How it works" },
];

function StatusDot({ tone }: { tone: "live" | "demo" | "off" }) {
  return (
    <span className="relative flex size-2">
      {tone !== "off" ? (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-50 [animation-duration:2.4s]",
            tone === "live" ? "bg-moss" : "bg-amber",
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex size-2 rounded-full", tone === "live" ? "bg-moss" : tone === "demo" ? "bg-amber" : "bg-fg-faint")} />
    </span>
  );
}

/** Spotify connection status + account actions, all in one understated chip. */
function StatusChip({ onDone }: { onDone?: () => void }) {
  const { data: me, isLoading } = useMe();
  const { data: config } = useConfig();
  const demo = useDemoLogin();
  const logout = useLogout();
  const router = useRouter();

  if (isLoading || !config) return <Skeleton className="h-9 w-32 rounded-full" />;

  const signOut = () =>
    logout.mutate(undefined, {
      onSuccess: () => {
        onDone?.();
        router.push("/");
        toast("Signed out");
      },
    });

  if (!me) {
    return (
      <div className="flex items-center gap-1.5">
        {config.spotify_enabled ? (
          <a href="/api/auth/login" className={buttonClasses("solid", "sm")}>
            <SpotifyGlyph className="size-4" /> Connect Spotify
          </a>
        ) : null}
        <Button
          variant={config.spotify_enabled ? "ghost" : "solid"}
          size="sm"
          loading={demo.isPending}
          onClick={() =>
            demo.mutate(undefined, {
              onSuccess: () => {
                onDone?.();
                router.push("/generate");
              },
              onError: (e) => toast.error(e.message),
            })
          }
        >
          Try the demo
        </Button>
      </div>
    );
  }

  const live = !me.is_demo;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex h-9 items-center gap-2.5 rounded-full border border-line-strong py-1 pr-1 pl-3.5 text-[13px] text-fg-muted transition hover:border-fg-faint hover:text-fg"
          aria-label={live ? "Spotify connected. Account menu" : "Demo mode. Account menu"}
        >
          <StatusDot tone={live ? "live" : "demo"} />
          {live ? "Spotify" : "Demo mode"}
          {me.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatar_url} alt="" className="size-7 rounded-full object-cover" />
          ) : (
            <span className="grid size-7 place-items-center rounded-full bg-ink-4 font-display text-sm text-fg">
              {me.display_name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <p className="font-display text-lg font-light">{me.display_name}</p>
        <dl className="mt-3 space-y-2 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-fg-subtle">Music</dt>
            <dd className="flex items-center gap-2 text-fg">
              <StatusDot tone={live ? "live" : "demo"} />
              {live ? "Spotify connected" : "Sample catalog (290+ songs)"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-fg-subtle">Curator</dt>
            <dd className="text-fg">{config.ai_enabled ? "Moodwave AI" : "Quick mix"}</dd>
          </div>
        </dl>
        {!live ? (
          <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
            Demo mode uses real songs and artwork without touching your Spotify account.
          </p>
        ) : null}
        <div className="mt-4 flex gap-2 border-t border-line pt-4">
          {!live && config.spotify_enabled ? (
            <a href="/api/auth/login" className={buttonClasses("solid", "sm")}>
              <SpotifyGlyph className="size-4" /> Connect Spotify
            </a>
          ) : null}
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="size-3.5" /> Sign out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <motion.nav
        aria-label="Main"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: EASE }}
        className={cn(
          "mx-auto flex h-[3.25rem] max-w-5xl items-center justify-between rounded-full pr-2 pl-4 transition-[background-color,border-color,box-shadow] duration-500",
          scrolled || open ? "chrome" : "border border-transparent",
        )}
      >
        <Link href={SITE_URL ?? "/"} aria-label="Moodwave home" className="rounded-full">
          <Logo />
        </Link>

        <ul className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
          {LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative rounded-full px-3.5 py-1.5 text-[13.5px] transition-colors duration-300",
                    active ? "text-fg" : "text-fg-subtle hover:text-fg",
                  )}
                >
                  {link.label}
                  {active ? (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute inset-x-3.5 -bottom-0.5 h-px bg-lilac"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center gap-1">
          <div className="hidden sm:block">
            <StatusChip />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" /> : <MenuIcon className="size-5" />}
          </Button>
        </div>
      </motion.nav>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="chrome mx-auto mt-2 max-w-5xl rounded-[1.75rem] p-3 md:hidden"
          >
            <ul>
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="block rounded-2xl px-4 py-3 font-display text-2xl font-light text-fg-muted hover:bg-white/[0.04] hover:text-fg"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-2 border-t border-line px-2 pt-3 pb-1">
              <StatusChip onDone={() => setOpen(false)} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
