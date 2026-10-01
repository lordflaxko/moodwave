/** Example prompts used across the landing page and generator. */

export interface ExamplePrompt {
  label: string;
  prompt: string;
  energy: number;
  valence: number;
  category: "Focus" | "Move" | "Feel" | "Moments";
}

export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  { label: "Late-night study", prompt: "Create a late-night study playlist with mellow indie and alternative songs", energy: 0.35, valence: 0.35, category: "Focus" },
  { label: "Deep work, no lyrics", prompt: "Instrumental deep-focus music for coding: lo-fi, ambient and jazz, no vocals", energy: 0.3, valence: 0.45, category: "Focus" },
  { label: "Sunday kitchen", prompt: "Warm soul and jazz for cooking dinner on a slow Sunday", energy: 0.45, valence: 0.75, category: "Moments" },
  { label: "Golden-hour drive", prompt: "Windows-down road trip at golden hour: sing-along indie rock and feel-good pop", energy: 0.68, valence: 0.8, category: "Moments" },
  { label: "PR on leg day", prompt: "High-energy workout mix with hip hop and EDM to hit a new PR", energy: 0.92, valence: 0.6, category: "Move" },
  { label: "Kitchen disco", prompt: "Disco, funk and house for dancing around the apartment", energy: 0.82, valence: 0.85, category: "Move" },
  { label: "Rain on the window", prompt: "Melancholic songs for a rainy evening, tender female vocals", energy: 0.28, valence: 0.18, category: "Feel" },
  { label: "Main character energy", prompt: "Confident, euphoric pop for getting ready to go out", energy: 0.82, valence: 0.85, category: "Feel" },
  { label: "Wind down", prompt: "Calm ambient and piano to fall asleep to", energy: 0.12, valence: 0.35, category: "Focus" },
  { label: "Nostalgic 2000s", prompt: "Nostalgic 2000s indie throwbacks that feel like the end of summer", energy: 0.7, valence: 0.6, category: "Feel" },
];

export const TYPEWRITER_PROMPTS = [
  "a late-night study session with mellow indie…",
  "a rainy Sunday, tender vocals, nothing too sad…",
  "sprinting the last mile of a 10k…",
  "cooking pasta with friends, warm soul & jazz…",
  "a 2am drive through an empty city…",
  "dancing around my kitchen to disco and house…",
];

export const REFINE_SUGGESTIONS = [
  "Make it more upbeat",
  "Add more female artists",
  "Remove explicit songs",
  "More chill, less drums",
  "Add some 90s throwbacks",
  "Make it shorter",
];
