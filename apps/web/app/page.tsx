"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { Suspense } from "react";

import { ArtistsBand } from "@/components/landing/artists-band";
import { Hero } from "@/components/landing/hero";
import { Showcase } from "@/components/landing/showcase";
import { AuthErrorNotice } from "@/components/layout/auth-error-notice";
import { buttonClasses } from "@/components/ui/button";
import { Eyebrow, Reveal, RevealGroup, fadeUp } from "@/components/ui/primitives";

const STEPS = [
  { n: "01", title: "Describe", body: "A moment, a place, a feeling. As specific or as vague as you like." },
  { n: "02", title: "Listen & refine", body: "“More upbeat.” “Fewer hits.” “Only female vocalists.” The playlist reshapes as you talk." },
  { n: "03", title: "Keep it", body: "Save it to Spotify in one tap, or come back to it in your library." },
];

export default function LandingPage() {
  return (
    <>
      <Suspense fallback={null}>
        <AuthErrorNotice />
      </Suspense>

      <Hero />

      <ArtistsBand />

      <Showcase />

      {/* How it flows: typography-led, deliberately not cards */}
      <section aria-labelledby="flow-heading" className="mx-auto max-w-6xl px-5 py-28 sm:py-36">
        <Reveal className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <Eyebrow>How it flows</Eyebrow>
            <h2 id="flow-heading" className="display mt-4 text-[clamp(2.5rem,5.5vw,4.25rem)]">
              Talk to it like <em>a friend</em> with great taste.
            </h2>
          </div>
          <Link href="/about" className={buttonClasses("ghost", "md", "self-start sm:self-end")}>
            Inside the pipeline <ArrowRight className="size-4" />
          </Link>
        </Reveal>
        <RevealGroup as="ol" className="mt-16 grid gap-px overflow-hidden rounded-[2rem] border border-line bg-line sm:grid-cols-3">
          {STEPS.map((step) => (
            <motion.li key={step.n} variants={fadeUp} className="bg-ink p-8 sm:p-10">
              <span className="font-display text-6xl font-extralight text-fg-faint">{step.n}</span>
              <h3 className="mt-8 font-display text-3xl font-light tracking-[-0.02em]">{step.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{step.body}</p>
            </motion.li>
          ))}
        </RevealGroup>
      </section>

      {/* Closing */}
      <section className="px-5 pt-16 pb-8 text-center">
        <Reveal>
          <h2 className="display mx-auto max-w-4xl text-[clamp(3rem,8vw,6.5rem)]">
            Press play on <em>a feeling.</em>
          </h2>
          <div className="mt-10 flex justify-center gap-3">
            <Link href="/generate" className={buttonClasses("accent", "lg")}>
              Start composing <ArrowRight className="size-4" />
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
