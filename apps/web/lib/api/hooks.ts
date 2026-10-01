"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type {
  AppConfig,
  GenerateInput,
  Playlist,
  PlaylistSummary,
  SpotifyPlaylist,
  Track,
  User,
} from "@/lib/types";

export const keys = {
  config: ["config"] as const,
  me: ["me"] as const,
  playlists: ["playlists"] as const,
  playlist: (id: string) => ["playlist", id] as const,
  search: (q: string) => ["search", q] as const,
  spotifyPlaylists: ["spotify-playlists"] as const,
};

// --- Session --------------------------------------------------------------------------

export function useConfig() {
  return useQuery({ queryKey: keys.config, queryFn: () => api<AppConfig>("/auth/config"), staleTime: Infinity });
}

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api<User | null>("/auth/me"), staleTime: 60_000 });
}

export function useDemoLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<User>("/auth/demo", { method: "POST" }),
    onSuccess: (user) => qc.setQueryData(keys.me, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      qc.setQueryData(keys.me, null);
      qc.removeQueries({ queryKey: keys.playlists });
      qc.removeQueries({ queryKey: ["playlist"] });
    },
  });
}

// --- Playlists ----------------------------------------------------------------------------

export function usePlaylists(enabled = true) {
  return useQuery({ queryKey: keys.playlists, queryFn: () => api<PlaylistSummary[]>("/playlists"), enabled });
}

export function usePlaylist(id: string) {
  return useQuery({
    queryKey: keys.playlist(id),
    queryFn: () => api<Playlist>(`/playlists/${id}`),
    retry: (count, error) => (error as { status?: number }).status !== 404 && count < 2,
  });
}

export function useGenerate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateInput) => api<Playlist>("/playlists/generate", { method: "POST", json: input }),
    onSuccess: (playlist) => {
      qc.setQueryData(keys.playlist(playlist.id), playlist);
      qc.invalidateQueries({ queryKey: keys.playlists });
    },
  });
}

/** Shared mutation plumbing: write the returned playlist into the cache. */
function usePlaylistMutation<TVars>(id: string, fn: (vars: TVars) => Promise<Playlist>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (playlist) => {
      qc.setQueryData(keys.playlist(id), playlist);
      qc.invalidateQueries({ queryKey: keys.playlists });
    },
  });
}

export function useRefine(id: string) {
  return usePlaylistMutation(id, (instruction: string) =>
    api<Playlist>(`/playlists/${id}/refine`, { method: "POST", json: { instruction } }),
  );
}

export function useRegenerate(id: string) {
  return usePlaylistMutation(id, () => api<Playlist>(`/playlists/${id}/regenerate`, { method: "POST" }));
}

export function useReplaceTrack(id: string) {
  return usePlaylistMutation(id, (trackId: string) =>
    api<Playlist>(`/playlists/${id}/tracks/${encodeURIComponent(trackId)}/replace`, { method: "POST" }),
  );
}

export function useSaveToSpotify(id: string) {
  return usePlaylistMutation(id, () => api<Playlist>(`/playlists/${id}/save`, { method: "POST" }));
}

export function useRename(id: string) {
  return usePlaylistMutation(id, (vars: { title?: string; description?: string }) =>
    api<Playlist>(`/playlists/${id}`, { method: "PATCH", json: vars }),
  );
}

/** Persist an edited track list, updating the cache optimistically for snappy drag & drop. */
export function useUpdateTracks(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tracks: Track[]) => api<Playlist>(`/playlists/${id}/tracks`, { method: "PUT", json: { tracks } }),
    onMutate: async (tracks) => {
      await qc.cancelQueries({ queryKey: keys.playlist(id) });
      const previous = qc.getQueryData<Playlist>(keys.playlist(id));
      if (previous) qc.setQueryData<Playlist>(keys.playlist(id), { ...previous, tracks });
      return { previous };
    },
    onError: (_err, _tracks, ctx) => {
      if (ctx?.previous) qc.setQueryData(keys.playlist(id), ctx.previous);
    },
    onSuccess: (playlist) => {
      qc.setQueryData(keys.playlist(id), playlist);
      qc.invalidateQueries({ queryKey: keys.playlists });
    },
  });
}

export function useDeletePlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/playlists/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: keys.playlist(id) });
      qc.setQueryData<PlaylistSummary[]>(keys.playlists, (old) => old?.filter((p) => p.id !== id));
    },
  });
}

// --- Spotify ---------------------------------------------------------------------------------

export function useTrackSearch(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: keys.search(query),
    queryFn: () => api<Track[]>(`/spotify/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
    staleTime: 5 * 60_000,
  });
}

export function useSpotifyPlaylists(enabled = true) {
  return useQuery({
    queryKey: keys.spotifyPlaylists,
    queryFn: () => api<SpotifyPlaylist[]>("/spotify/playlists"),
    enabled,
  });
}
