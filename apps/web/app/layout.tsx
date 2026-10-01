import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";

import { Aurora, DemoBanner, Footer } from "@/components/layout/chrome";
import { Nav } from "@/components/layout/nav";
import { PlayerDock } from "@/components/playlist/player-dock";
import { Providers } from "@/components/providers";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: { default: "Moodwave · AI playlists from a feeling", template: "%s · Moodwave" },
  description:
    "Describe a mood, moment or vibe and Moodwave's AI curator builds a Spotify playlist that fits, then refine it in plain language.",
};

export const viewport: Viewport = {
  themeColor: "#07070a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} grain font-sans antialiased`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-ink"
        >
          Skip to content
        </a>
        <Providers>
          <Aurora />
          <Nav />
          <div aria-hidden className="h-[4.75rem]" />
          <DemoBanner />
          <main id="main" className="relative">
            {children}
          </main>
          <Footer />
          <PlayerDock />
        </Providers>
      </body>
    </html>
  );
}
