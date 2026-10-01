import type { Metadata, Viewport } from "next";
import { Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";

import { Atmosphere } from "@/components/layout/atmosphere";
import { Footer } from "@/components/layout/footer";
import { Nav } from "@/components/layout/nav";
import { PlayerDock } from "@/components/playlist/player-dock";
import { Providers } from "@/components/providers";

import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
});
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Moodwave · What are you in the mood for?", template: "%s · Moodwave" },
  description:
    "Tell us a moment. We'll find the soundtrack. Moodwave turns a feeling into a playlist of real songs and lets you reshape it in plain language.",
};

export const viewport: Viewport = {
  themeColor: "#0b0a0d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${interTight.variable} ${jetbrains.variable} grain font-sans antialiased`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-full focus:bg-fg focus:px-4 focus:py-2 focus:text-ink"
        >
          Skip to content
        </a>
        <Providers>
          <Atmosphere />
          <Nav />
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
