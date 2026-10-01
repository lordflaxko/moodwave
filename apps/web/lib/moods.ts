/**
 * The moods shown on the landing page and in the studio. Each is "cast" with real
 * catalog artists, so every face we show is someone the curator can actually play.
 */

export interface Mood {
  id: string;
  label: string;
  prompt: string;
  /** 0–1, drives the colour dot and atmosphere */
  energy: number;
  valence: number;
  cast: string[];
}

export const HERO_MOODS: Mood[] = [
  {
    id: "toronto",
    label: "Late-night drive through Toronto",
    prompt: "Late-night drive through Toronto: moody R&B, city lights, windows down",
    energy: 0.45,
    valence: 0.3,
    cast: ["The Weeknd", "Drake", "Daniel Caesar", "PARTYNEXTDOOR"],
  },
  {
    id: "sunday",
    label: "Music for a Sunday morning",
    prompt: "Music for a slow Sunday morning: coffee, sunlight, warm soul and soft jazz",
    energy: 0.3,
    valence: 0.72,
    cast: ["Norah Jones", "Laufey", "Bill Withers", "Khruangbin"],
  },
  {
    id: "coding",
    label: "Coding at 2 AM",
    prompt: "Coding at 2 AM: instrumental electronic and lo-fi to stay in deep focus",
    energy: 0.5,
    valence: 0.4,
    cast: ["Bonobo", "Tycho", "Nujabes", "Fred again.."],
  },
  {
    id: "summer",
    label: "Songs that feel like summer",
    prompt: "Songs that feel like summer: sunny, carefree, dancing outside",
    energy: 0.75,
    valence: 0.88,
    cast: ["Jungle", "Kali Uchis", "Harry Styles", "Tyla"],
  },
  {
    id: "rnb",
    label: "90s R&B dinner party",
    prompt: "A 90s R&B dinner party: smooth, soulful, candlelit and a little nostalgic",
    energy: 0.48,
    valence: 0.62,
    cast: ["Ms. Lauryn Hill", "Sade", "D'Angelo", "Aaliyah"],
  },
];

/** "Make it more…" refinement suggestions → the natural-language instruction sent. */
export const REFINE_SUGGESTIONS: { label: string; instruction: string }[] = [
  { label: "Energetic", instruction: "Make it more energetic and upbeat" },
  { label: "Chill", instruction: "Make it more chill and mellow" },
  { label: "Nostalgic", instruction: "Make it more nostalgic with some throwbacks" },
  { label: "More indie", instruction: "Add more indie songs" },
  { label: "Less mainstream", instruction: "Make it less mainstream with more deep cuts" },
  { label: "More female artists", instruction: "Add more female artists" },
  { label: "No explicit songs", instruction: "Remove explicit songs" },
];

export const TYPEWRITER_PROMPTS = [
  "the drive home after a long week…",
  "a rainy afternoon with a good book…",
  "the last hour of a house party…",
  "cooking pasta for friends, windows open…",
  "a 2 AM walk through an empty city…",
  "the first warm day of spring…",
];
