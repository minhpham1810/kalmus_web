// Pure filter logic for the Kalmusverse film map. No React: the panel and the map both import this.
import type { MapFilm } from "./film-map";

export interface MapFilter {
  films: string[]; // checked job_ids; empty means every film
  country: string;
  director: string;
  genre: string;
  years: [number, number] | null; // inclusive range; null means any year
  light: [number, number] | null; // lightness range, 0-100, inclusive; null means any brightness
}

export const NO_FILTER: MapFilter = { films: [], country: "", director: "", genre: "", years: null, light: null };

const has = (list: string[], chosen: string) =>
  !chosen.trim() || list.some((x) => x.trim().toLowerCase() === chosen.trim().toLowerCase());

/** Checked films, whole-name match (case-insensitive) on each chosen dropdown field, inclusive year range (films without a year fail it). Ignores lightness. */
export function matchesFilter(f: MapFilm, flt: MapFilter): boolean {
  return (
    (flt.films.length === 0 || flt.films.includes(f.job_id)) &&
    has(f.countries, flt.country) &&
    has(f.directors, flt.director) &&
    has(f.genres, flt.genre) &&
    (flt.years === null || (f.year !== null && f.year >= flt.years[0] && f.year <= flt.years[1]))
  );
}

/** Whether the film's lightness (0-1 scaled to 0-100) lies in the inclusive light range. Lightness hides films rather than dimming them. */
export function inLightRange(f: MapFilm, flt: MapFilter): boolean {
  if (!flt.light) return true;
  // Compare in 0-1 (bound / 100), not lightness * 100: 0.57 * 100 is 56.999..., which would miss a bound of 57
  return f.lightness >= flt.light[0] / 100 && f.lightness <= flt.light[1] / 100;
}

/** True when a dimming filter is set; lightness is excluded because it hides instead. */
export const filterActive = (flt: MapFilter) =>
  flt.films.length > 0 || flt.years !== null || [flt.country, flt.director, flt.genre].some((v) => v.trim());

/** Slider limits for brightness: one step (5) outside the darkest and brightest film, rounded outward to a multiple of 5 within 0-100; null for no films. */
export function lightBounds(films: MapFilm[]): [number, number] | null {
  if (!films.length) return null;
  // Round to 6 decimals first: 0.57 * 100 is 56.999...
  const r = (x: number) => Math.round(x * 100 * 1e6) / 1e6;
  const lo = Math.min(...films.map((f) => r(f.lightness)));
  const hi = Math.max(...films.map((f) => r(f.lightness)));
  return [Math.max(0, Math.floor((lo - 5) / 5) * 5), Math.min(100, Math.ceil((hi + 5) / 5) * 5)];
}

/** [min, max] of the films' non-null years, or null when none have a year. */
export function yearBounds(films: MapFilm[]): [number, number] | null {
  const years = films.map((f) => f.year).filter((y): y is number => y !== null);
  return years.length ? [Math.min(...years), Math.max(...years)] : null;
}
