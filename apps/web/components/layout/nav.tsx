"use client";

import { LogOut, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Logo, SpotifyGlyph } from "@/components/layout/logo";
import { Button, buttonClasses } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { useConfig, useDemoLogin, useLogout, useMe } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/generate", label: "Create" },
  { href: "/library", label: "Library" },
  { href: "/about", label: "How it works" },
];

function AuthControls({ onDone }: { onDone?: () => void }) {
  const { data: me, isLoading } = useMe();
  const { data: config } = useConfig();
  const demo = useDemoLogin();
  const logout = useLogout();
  const router = useRouter();

  if (isLoading) return <Skeleton className="h-9 w-28 rounded-full" />;

  if (me) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-2 rounded-full bg-white/[0.05] py-1 pr-3 pl-1 text-sm">
          {me.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatar_url} alt="" className="size-7 rounded-full object-cover" />
          ) : (
            <span className="mood-ring grid size-7 place-items-center rounded-full text-xs font-semibold text-white">
              {me.display_name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="max-w-[9rem] truncate">{me.display_name}</span>
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          title="Sign out"
          onClick={() =>
            logout.mutate(undefined, {
              onSuccess: () => {
                onDone?.();
                router.push("/");
                toast("Signed out");
              },
            })
          }
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {config?.spotify_enabled ? (
        <a href="/api/auth/login" className={buttonClasses("primary", "md")}>
          <SpotifyGlyph className="size-4" />
          Connect Spotify
        </a>
      ) : null}
      <Button
        variant={config?.spotify_enabled ? "ghost" : "primary"}
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

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="mx-auto mt-3 max-w-6xl px-3 sm:px-4">
        <nav
          aria-label="Main"
          className="glass flex h-14 items-center justify-between rounded-full pr-2 pl-4 sm:pl-5"
        >
          <Link href="/" aria-label="Moodwave home" className="rounded-lg">
            <Logo />
          </Link>
          <ul className="hidden items-center gap-1 md:flex">
            {LINKS.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative rounded-full px-4 py-2 text-sm transition-colors",
                      active ? "text-fg" : "text-fg-muted hover:text-fg",
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-full bg-white/[0.08]"
                        transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      />
                    ) : null}
                    <span className="relative">{link.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden md:block">
            <AuthControls />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </nav>

        <AnimatePresence>
          {open ? (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className="glass-strong mt-2 rounded-3xl p-3 md:hidden"
            >
              <ul className="flex flex-col">
                {LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-2xl px-4 py-3 text-base text-fg-muted hover:bg-white/5 hover:text-fg"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-2 border-t border-line px-2 pt-3">
                <AuthControls onDone={() => setOpen(false)} />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </header>
  );
}
