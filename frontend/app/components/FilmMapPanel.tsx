"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { histOf, type MapFilm } from "@/lib/film-map";
import { NO_FILTER, filterActive, yearBounds, type MapFilter } from "@/lib/film-map-filter";
import { RangeSlider } from "./RangeSlider";

const label = (f: MapFilm) => `${f.title}${f.year ? ` (${f.year})` : ""}`;
const rowLabel = (f: MapFilm) => `${label(f)}${f.edition ? ` · ${f.edition}` : ""}`;
const uniq = (lists: string[][]) => [...new Set(lists.flat())].sort((a, b) => a.localeCompare(b));

export function FilmMapPanel({
  films,
  hover,
  filter,
  setFilter,
  titles,
  setTitles,
  matches,
  pinned,
  children,
}: {
  films: MapFilm[];
  hover: MapFilm | null;
  pinned: boolean;
  filter: MapFilter;
  setFilter: (f: MapFilter) => void;
  titles: boolean;
  setTitles: (t: boolean) => void;
  matches: number;
  children?: React.ReactNode; // back link, logo and key, above the filter
}) {
  const options = useMemo(
    () => ({
      country: uniq(films.map((f) => f.countries)),
      director: uniq(films.map((f) => f.directors)),
      genre: uniq(films.map((f) => f.genres)),
    }),
    [films],
  );
  const bounds = useMemo(() => yearBounds(films), [films]);
  const [search, setSearch] = useState("");
  // Checked films first, then by title; the search narrows the list
  const listed = useMemo(() => {
    const t = search.trim().toLowerCase();
    return films
      .filter((f) => !t || rowLabel(f).toLowerCase().includes(t))
      .sort((a, b) => {
        const ca = filter.films.includes(a.job_id) ? 0 : 1;
        const cb = filter.films.includes(b.job_id) ? 0 : 1;
        return ca - cb || a.title.localeCompare(b.title);
      });
  }, [films, search, filter.films]);
  const toggle = (id: string) =>
    setFilter({
      ...filter,
      films: filter.films.includes(id) ? filter.films.filter((x) => x !== id) : [...filter.films, id],
    });
  const lightActive = filter.light[0] > 0 || filter.light[1] < 100;
  const field = (key: "country" | "director" | "genre", placeholder: string, list?: keyof typeof options) => (
    <input
      value={filter[key]}
      onChange={(e) => setFilter({ ...filter, [key]: e.target.value })}
      placeholder={placeholder}
      list={list && `map-${list}`}
      className="kalmus-input w-full min-w-0 px-2 py-1 text-xs"
    />
  );

  return (
    // Clicks pass through the empty space between the boxes to the map; the boxes take them back
    <aside className="fixed top-5 left-6 bottom-6 z-50 flex w-64 flex-col gap-2 text-xs pointer-events-none *:pointer-events-auto">
      {children}
      {Object.entries(options).map(([k, values]) => (
        <datalist key={k} id={`map-${k}`}>
          {values.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ))}

      <section className="kalmus-surface p-3 flex flex-col gap-1.5 min-h-0">
        <h2 className="font-mono uppercase tracking-[0.22em] kalmus-text-secondary">Filter</h2>
        <label className="flex items-center justify-between gap-2 cursor-pointer kalmus-text-secondary">
          <span>Show titles</span>
          <input
            type="checkbox"
            role="switch"
            checked={titles}
            onChange={(e) => setTitles(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="relative h-4 w-7 shrink-0 rounded-full bg-[var(--input-border)] transition-colors peer-checked:bg-[var(--text-primary)] peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--text-primary)] after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-[var(--surface-bg)] after:transition-transform peer-checked:after:translate-x-3"
          />
        </label>
        {field("country", "Country", "country")}
        {field("director", "Filmmaker", "director")}
        {field("genre", "Genre", "genre")}
        {bounds && bounds[0] < bounds[1] && (
          <RangeSlider
            label="Year"
            min={bounds[0]}
            max={bounds[1]}
            value={filter.years ?? bounds}
            onChange={(v) => setFilter({ ...filter, years: v[0] === bounds[0] && v[1] === bounds[1] ? null : v })}
          />
        )}
        <RangeSlider
          label="Brightness"
          min={0}
          max={100}
          value={filter.light}
          onChange={(v) => setFilter({ ...filter, light: v })}
        />

        <div className="flex flex-col gap-1 flex-1 min-h-0">
          <div className="flex justify-between kalmus-text-muted">
            <span>Films</span>
            {filter.films.length > 0 && (
              <button onClick={() => setFilter({ ...filter, films: [] })} className="underline hover:text-[var(--text-primary)]">
                Clear
              </button>
            )}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search films…"
            className="kalmus-input w-full min-w-0 px-2 py-1 text-xs"
          />
          <ul className="max-h-[15rem] flex-1 min-h-0 overflow-y-auto flex flex-col">
            {listed.map((f) => (
              <li key={f.job_id}>
                <label className="flex items-start gap-2 py-0.5 cursor-pointer kalmus-text-secondary">
                  <input
                    type="checkbox"
                    checked={filter.films.includes(f.job_id)}
                    onChange={() => toggle(f.job_id)}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="leading-snug">{rowLabel(f)}</span>
                </label>
              </li>
            ))}
            {listed.length === 0 && <li className="kalmus-text-muted">No films match.</li>}
          </ul>
        </div>

        {(filterActive(filter) || lightActive) && (
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

      <section className="kalmus-surface p-3 flex flex-col gap-2 mt-auto relative">
        {hover ? <HoverCard film={hover} /> : <p className="kalmus-text-muted">Hover over a film to see its colors; click to pin it.</p>}
        {pinned && <span className="absolute bottom-3 right-3 kalmus-text-muted">Pinned</span>}
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
      <svg viewBox={`0 0 ${bins} 20`} preserveAspectRatio="none" className="w-full h-10 bg-black" role="img"
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
