export type Category = 'Películas' | 'Series' | 'En familia' | 'Recuerdos' | 'Otros';
export type Subtitle = { id: string; label: string; language: string; forced: boolean; source: 'embedded' | 'external'; url: string };
export type Media = {
  id: string; title: string; description: string; category: Category; addedBy: string;
  originalName: string; size: number; createdAt: string; duration: number;
  width: number; height: number; status: 'processing' | 'ready' | 'error'; progress: number;
  error: string | null; format: string; posterUrl: string | null; streamUrl: string | null;
  subtitles: Subtitle[]; subtitleWarnings: string[]; posterVersion: number; posterSource: 'embedded' | 'frame' | 'tmdb' | null;
  backdropUrl: string | null; tmdbId: number | null; tmdbType: 'movie' | 'tv' | null; releaseYear: string | null; genres: string[];
  downloadUrl: string; videoCodec: string; audioCodec: string;
};
export type System = { name: string; urls: string[]; categories: Category[]; maxUploadBytes: number; protected: boolean };
export type WatchProgress = Record<string, { time: number; duration: number; updatedAt: number }>;

export const categories: Category[] = ['Películas', 'Series', 'En familia', 'Recuerdos', 'Otros'];
export function bytes(value: number) {
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(0)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(0)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}
export function duration(seconds: number) {
  if (!seconds) return 'Video';
  if (seconds < 60) return `${Math.ceil(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}
export function readLocal<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(`casacine:${key}`); return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}
export function writeLocal(key: string, value: unknown) {
  try { localStorage.setItem(`casacine:${key}`, JSON.stringify(value)); } catch { /* Private browsing can disable storage. */ }
}
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('casacine:unauthorized'));
    throw new Error(body.error || 'No pudimos conectar con la PC. Revisa que Palomita esté abierto.');
  }
  return body;
}
