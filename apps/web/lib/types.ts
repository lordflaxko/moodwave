/** Mirrors `apps/api/app/schemas.py`. Keep the two in sync. */

export type Vocals = "any" | "female" | "male" | "mixed" | "instrumental";

export interface Track {
  id: string;
  uri: string;
  title: string;
  artists: string[];
  artist_ids?: string[];
  /** Portrait per artist (same order as `artists`), when known. */
  artist_images?: (string | null)[];
  album: string;
  image_url: string | null;
  duration_ms: number;
  explicit: boolean;
  popularity: number | null;
  external_url: string | null;
  release_year: number | null;
  energy: number | null;
  reason: string | null;
}

export interface MusicalIntent {
  title: string;
  description: string;
  moods: string[];
  genres: string[];
  characteristics: string[];
  energy: number;
  valence: number;
  tempo_min: number;
  tempo_max: number;
  era: string | null;
  vocals: Vocals;
  explicit_allowed: boolean;
  reference_artists: string[];
  rationale: string;
}

export interface PlaylistStats {
  track_count: number;
  total_duration_ms: number;
  artist_count: number;
  explicit_count: number;
  avg_energy: number | null;
  energy_curve: number[];
}

export interface Refinement {
  id: number;
  instruction: string;
  summary: string;
  added: number;
  removed: number;
  created_at: string;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  prompt: string;
  intent: MusicalIntent;
  tracks: Track[];
  stats: PlaylistStats;
  refinements: Refinement[];
  ai_source: "claude" | "heuristic";
  spotify_playlist_id: string | null;
  spotify_url: string | null;
  notice: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlaylistSummary {
  id: string;
  title: string;
  prompt: string;
  moods: string[];
  energy: number;
  cover_images: (string | null)[];
  cover_seeds: string[];
  track_count: number;
  total_duration_ms: number;
  saved_to_spotify: boolean;
  spotify_url: string | null;
  created_at: string;
}

export interface User {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_demo: boolean;
}

export interface AppConfig {
  demo_mode: boolean;
  spotify_enabled: boolean;
  ai_enabled: boolean;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  image_url: string | null;
  track_count: number;
  external_url: string | null;
}

export interface GenerateInput {
  prompt: string;
  length: number;
  energy: number | null;
  allow_explicit: boolean;
  use_my_taste: boolean;
}

export interface FeaturedArtist {
  name: string;
  image_url: string;
  genre: string;
  track_count: number;
  top_track: string;
  album: string;
  cover_url: string | null;
}

export interface Featured {
  tracks: Track[];
  artists: FeaturedArtist[];
}
