"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { histOf, type MapFilm } from "@/lib/film-map";

export interface MapFilter {
  q: string; // title search
  country: string;
  director: string;
  genre: string;
  from: string; // year range, as typed
  to: string;
}

export const NO_FILTER: MapFilter = { q: "", country: "", director: "", genre: "", from: "", to: "" };

const has = (list: string[], typed: string) =>
  !typed.trim() || list.some((x) => x.toLowerCase().includes(typed.trim().toLowerCase()));

/** Case-insensitive substring match on each filled-in field; films without a year fail a year range. */
export function matchesFilter(f: MapFilm, flt: MapFilter): boolean {
  const from = Number(flt.from) || -Infinity;
  const to = Number(flt.to) || Infinity;
  return (
    has([f.title], flt.q) &&
    has(f.countries, flt.country) &&
    has(f.directors, flt.director) &&
    has(f.genres, flt.genre) &&
    (!(flt.from || flt.to) || (f.year !== null && f.year >= from && f.year <= to))
  );
}

export const filterActive = (flt: MapFilter) => Object.values(flt).some((v) => v.trim());

const label = (f: MapFilm) => `${f.title}${f.year ? ` (${f.year})` : ""}`;
const uniq = (lists: string[][]) => [...new Set(lists.flat())].sort((a, b) => a.localeCompare(b));

export function FilmMapPanel({
  films,
  hover,
  filter,
  setFilter,
  matches,
}: {
  films: MapFilm[];
  hover: MapFilm | null;
  filter: MapFilter;
  setFilter: (f: MapFilter) => void;
  matches: number;
}) {
  const options = useMemo(
    () => ({
      country: uniq(films.map((f) => f.countries)),
      director: uniq(films.map((f) => f.directors)),
      genre: uniq(films.map((f) => f.genres)),
      q: uniq(films.map((f) => [f.title])),
    }),
    [films],
  );
  const field = (key: keyof MapFilter, placeholder: string, list?: keyof typeof options) => (
    <input
      value={filter[key]}
      onChange={(e) => setFilter({ ...filter, [key]: e.target.value })}
      placeholder={placeholder}
      list={list && `map-${list}`}
      inputMode={key === "from" || key === "to" ? "numeric" : undefined}
      className="kalmus-input w-full min-w-0 px-2 py-1 text-xs"
    />
  );

  return (
    // Clicks pass through the empty space between the boxes to the map; the boxes take them back
    <aside className="fixed top-20 left-6 bottom-6 z-50 hidden md:flex w-80 flex-col gap-4 text-xs pointer-events-none *:pointer-events-auto">
      {Object.entries(options).map(([k, values]) => (
        <datalist key={k} id={`map-${k}`}>
          {values.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ))}

      <section className="kalmus-surface p-4 flex flex-col gap-2">
        <h2 className="font-mono uppercase tracking-[0.22em] kalmus-text-secondary">Find films</h2>
        {field("q", "Search titles…", "q")}
        {field("country", "Country", "country")}
        {field("director", "Filmmaker", "director")}
        {field("genre", "Genre", "genre")}
        <div className="flex items-center gap-2">
          {field("from", "From year")}
          <span className="kalmus-text-muted">–</span>
          {field("to", "To year")}
        </div>
        {filterActive(filter) && (
          <div className="flex justify-between kalmus-text-muted">
            <span>
              {matches} of {films.length} films
            </span>
            <button onClick={() => setFilter(NO_FILTER)} className="underline hover:text-[var(--text-primary)]">
              Clear
            </button>
          </div>
        )}
      </section>

      <section className="kalmus-surface p-4 flex flex-col gap-3 min-h-0 mt-auto">
        {hover ? <HoverCard film={hover} /> : <p className="kalmus-text-muted">Click a film to see its colors.</p>}
      </section>
    </aside>
  );
}

function HoverCard({ film }: { film: MapFilm }) {
  // Keyed by job, so a missing frame hides only that film's image
  const [missing, setMissing] = useState<string | null>(null);
  // The map's own perceptual histogram (OKLab, chroma-weighted)
  const hist = histOf(film);
  const color = (h: number) => `oklch(0.7 0.14 ${h})`;
  const bins = hist.length;
  const max = Math.max(...hist, 1e-9);
  return (
    <>
      <h3 className="text-sm kalmus-text-primary leading-snug">
        {label(film)}
        {film.edition && <span className="kalmus-text-muted"> · {film.edition}</span>}
      </h3>
      {missing !== film.job_id && (
        // eslint-disable-next-line @next/next/no-img-element -- small per-job API image, nothing for next/image to optimise
        <img
          src={`/api/map-frame/${film.job_id}`}
          alt={`Frame from ${film.title} in its dominant hue`}
          className="w-full aspect-[37/20] object-cover bg-black"
          onError={() => setMissing(film.job_id)}
        />
      )}
      {/* Mini hue histogram, red first, as on the wheel */}
      <svg viewBox={`0 0 ${bins} 20`} preserveAspectRatio="none" className="w-full h-14 bg-black" role="img"
        aria-label="Hue histogram">
        {hist.map((v, i) => (
          <rect
            key={i}
            x={i + 0.1}
            width={0.8}
            y={20 - (20 * v) / max}
            height={(20 * v) / max}
            fill={color((i + 0.5) * (360 / bins))}
          />
        ))}
      </svg>
      <Link href={`/results/${film.job_id}`} className="self-start underline kalmus-text-secondary hover:text-[var(--text-primary)]">
        View full results →
      </Link>
    </>
  );
}
