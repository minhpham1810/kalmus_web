// Film map variants for A/B testing, plus the palette maths they share. No server imports: the client uses this.

export interface MapFilm {
  job_id: string;
  hue: number | null; // dominant OKLab hue in degrees; null for black-and-white films
  mean_hue: number | null; // angle of the mean OKLab (a, b): the overall colour cast
  hue_hist: number[] | null; // chroma-weighted 36-bin hue histogram summing to 1 (film_compare.py)
  lightness: number; // median OKLab L, 0-1
  title: string;
  year: number | null;
  edition: string | null;
}

export const VARIANTS = {
  dominant: {
    label: "Dominant hue",
    blurb: "Angle = the single most dominant hue. Links join films that sit nearest on the map.",
  },
  "palette-links": {
    label: "Palette links",
    blurb: "Angle = dominant hue, but links join films whose whole palettes and lightness match best.",
  },
  "mean-hue": {
    label: "Mean hue",
    blurb: "Angle = the overall colour cast (average of every frame's colour). Links join nearest films.",
  },
  similarity: {
    label: "Similarity",
    blurb: "No axes: films with similar whole palettes and lightness pull together. Dot colour = dominant hue.",
  },
  glyphs: {
    label: "Palette glyphs",
    blurb: "Angle = dominant hue; each film is drawn as its hue histogram. Links join matching palettes.",
  },
} as const;

export type Variant = keyof typeof VARIANTS;

export const HUE_BINS = 36;

/** Earth mover's distance between two hue histograms on the circle, in degrees (as film_compare.circular_emd). */
export function circularEmd(p: number[], q: number[]): number {
  const d: number[] = [];
  let run = 0;
  for (let i = 0; i < p.length; i++) d.push((run += p[i] - q[i]));
  const sorted = [...d].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
  return (360 / p.length) * d.reduce((s, x) => s + Math.abs(x - median), 0);
}

/** Whole-palette distance in half-lives, using film_compare's HALF_LIFE: 30° of hue, 0.06 lightness. */
export function paletteDistance(a: MapFilm, b: MapFilm): number {
  return circularEmd(histOf(a), histOf(b)) / 30 + Math.abs(a.lightness - b.lightness) / 0.06;
}

/** The film's histogram, or (no palette data) all weight on its dominant hue. */
export function histOf(f: MapFilm): number[] {
  if (f.hue_hist) return f.hue_hist;
  const h = new Array(HUE_BINS).fill(0);
  h[Math.floor((f.hue ?? 0) / (360 / HUE_BINS)) % HUE_BINS] = 1;
  return h;
}
