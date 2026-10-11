# Parity checklist: Framer site → Vite site

Checked on 2026-10-11 against https://moodwave.framer.ai (published Oct 10, 2026).

## Layout (`npm run parity`, every named layer and text block, ±2 px)

| Page | 1280 | 810 | 390 |
| --- | --- | --- | --- |
| / | ✅ | ✅ | ✅ |
| /how-it-works | ✅ | ✅ | ✅ |
| /create | ✅ | ✅ | ✅ |
| /playlist | ✅ | ✅ | ✅ |
| /library | ✅ | ✅ | ✅ |
| /p | ✅ | ✅ | ✅ |
| /errors (= /admin) | ✅ | ✅ | ✅ |
| /faq | ✅ | ✅ | ✅ |
| /privacy | ✅ | ✅ | ✅ |
| /terms | ✅ | ✅ | ⚠️ intentional, see below |
| 404 | ✅ | ✅ | ✅ |

⚠️ **/terms at phone width.** The published Framer page has a broken phone breakpoint: its
media query is `(min-width:1200px) and (max-width:1199.98px)`, which never matches. Phones
therefore get the tablet padding (32 px sides). The new site uses the phone layout from the
canvas (20 px sides), the same as Privacy and FAQ.

## Visual (side-by-side screenshots plus pixel diff)

- ✅ Fonts: same faces and weights (Fraunces / Fraunces Variable, Inter / Inter Variable, JetBrains Mono), now self-hosted.
- ✅ Colour tokens, text presets, borders, shadows, masks, blur, grayscale and contrast filters.
- ✅ Images: same crops. Copies are capped at 640 px, as Framer served them scaled down.
- ✅ Headline alignment: "start" defers to the preset, so Display XL centres.
- ✅ No "Made in Framer" badge.

## Behaviour (`npm run behaviour`, plus manual checks in a real browser)

- ✅ Headline word-by-word blur reveal (on load).
- ✅ Appear on load and on scroll-in, including replay when scrolled back.
- ✅ Mood card hover: lift −4 px, background #18161c, tilt follows the pointer.
- ✅ Button hover (lift and glow) and press (scale 0.96). The magnetic pull is the same override code; it is mouse-only, so headless runs skip it.
- ✅ Nav pill condenses after scrolling (scale 0.97, y −4, darker glass).
- ✅ Tickers: 26 / 20 / 22 px/s, slowing to 30 % / 30 % / 40 % on hover (live measured 22 → 8.8 px/s; local 22 → 8.8, 26 → 7.2, 20 → 6), reversed row, edge masks.
- ✅ Floating cards and light leaks loop (mirror).
- ✅ Artist card hover: lift −6 px, the sleeve slides out (`--sleeve: 1`) and grayscale lifts.
- ✅ Phone menu opens with the same links.
- ✅ Code components (Composer, Studio, Spin the record, Energy mixer, Flow story, Preloader, Cursor, Grain, Waveform, Library, Playlist, Shared playlist, Dashboard) are the same files with the same props.
- ✅ Page titles, descriptions and noindex on private pages. Client-side navigation scrolls to the top and plays the page enter transition.
