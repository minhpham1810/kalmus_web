"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";

interface FilmSearchResult {
  job_id: string;
  title: string;
  imdb_id: string | null;
  poster: string | null;
  director: string | null;
  runtime_minutes: string | null;
  country: string | null;
  released: string | null;
  barcode_type: string;
  frame_type: string;
  metric: string;
  process_date: string;
  source_width: string;
  source_height: string;
  source_fps: number;
  source_frame_count: string;
}

interface GroupedFilm {
  title: string;
  imdb_id: string | null;

  poster: string | null;
  director: string | null;
  runtime_minutes: string | null;
  country: string | null;
  released: string | null;

  analyses: {
    job_id: string;
    barcode_type: string;
    frame_type: string;
    metric: string;
    process_date: string;
    source_width: string;
    source_height: string;
    source_fps: number;
    source_frame_count: string;
  }[];
}

function groupResults(results: FilmSearchResult[]): GroupedFilm[] {
  const map = new Map<string, GroupedFilm>();
  for (const r of results) {
    const key = `${r.title}::${r.imdb_id ?? ""}`;
    if (!map.has(key)) {
      map.set(key, {
        title: r.title,
        imdb_id: r.imdb_id,
        poster: r.poster,
        director: r.director,
        runtime_minutes: r.runtime_minutes,
        country: r.country,
        released: r.released,
        analyses: [],
      });
    }
    map.get(key)!.analyses.push({
      job_id: r.job_id,
      barcode_type: r.barcode_type,
      frame_type: r.frame_type,
      metric: r.metric,
      process_date: r.process_date,
      source_width: r.source_width,
      source_height: r.source_height,
      source_fps: r.source_fps,
      source_frame_count: r.source_frame_count,
    });
  }
  return Array.from(map.values());
}

export default function Home() {
  const helpRef = useRef<HTMLDivElement>(null);

  const [showHelp, setShowHelp] = useState(false)
  const [activeSelection, setActiveSelection] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FilmSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setShowHelp(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);


  useEffect(() => {
    // Currently, searching does nothing when a selction button is active
    if (activeSelection) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search-films?q=${encodeURIComponent(trimmed)}`
        );
        const data = await res.json();
        setResults(data.results || []);
      } catch {
        setResults([]);
      } finally {
        setSearched(true);
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, activeSelection]);

  useEffect(() => {
    if (!activeSelection) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        let res: Response
        if (activeSelection === "random") {
          res = await fetch(
            `/api/search-films?random`
          );
        }
        else {
          let search: string;
          if (activeSelection === "numbers") {
            search = "numbers";
          }
          else if (activeSelection === "symbols") {
            search = "symbols";
          }
          else {
            search = `title:^${activeSelection}`
          }

          res = await fetch(
            `/api/search-films?q=${encodeURIComponent(search)}`
          );
        }

        const selectionResults: FilmSearchResult[] = (await res.json()).results || [];

        setResults(selectionResults);
      } catch {
        setResults([]);
      } finally {
        setSearched(true);
        setLoading(false);
      }
    }, 300);
  }, [activeSelection]);

  const grouped = groupResults(results);

  return (
    <div className="min-h-screen flex flex-col">
      {/* About link */}
      <div className="fixed top-5 right-24 z-50">
        <Link
          href="/about"
          className="font-mono text-[10px] tracking-[0.22em] uppercase kalmus-text-secondary hover:text-[var(--text-primary)] transition-colors"
        >
          About
        </Link>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-16">
        <div className="w-full max-w-4xl">

          {/* Header */}
          <header className="text-center mb-12">
            {/* Archive classification label */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <span
                aria-hidden
                style={{ flex: 1, height: 1, background: 'var(--accent-crimson)', opacity: 0.6 }}
              />
              <span className="font-mono text-[9px] tracking-[0.35em] uppercase kalmus-text-secondary whitespace-nowrap">
                ◈ CINEMA COLOR ARCHIVE
              </span>
              <span
                aria-hidden
                style={{ flex: 1, height: 1, background: 'var(--accent-crimson)', opacity: 0.6 }}
              />
            </div>

            <div className="flex justify-center mb-5">
              <Image
                src="/kalmus-logo.png"
                alt="KALMUS"
                width={300}
                height={100}
                className="dark:invert"
                priority
              />
            </div>

            <p className="font-mono text-[10px] tracking-[0.28em] uppercase kalmus-text-secondary">
              Quantitative color analysis · Cinema
            </p>
          </header>

          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <svg
                className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 kalmus-text-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveSelection(null);
                  }}
                  placeholder="Search... e.g. country: united states director: hitchcock"
                  className="kalmus-input w-full pl-11 pr-4 py-4 bg-transparent text-sm font-light focus:outline-none transition-colors"
                  style={{
                    border: '1px solid var(--accent-crimson)',
                    borderLeftWidth: '3px',
                  }}
                />

                {/* Help button */}
                <div ref={helpRef} className="absolute right-3 flex items-center kalmus-input transition-colors">
                  <button
                    onClick={() => setShowHelp((v) => !v)}
                    aria-label="Search help"
                    aria-expanded={showHelp}
                    className="w-5 h-5 rounded-full text-xs flex items-center justify-center
                              border hover:text-gray-600 hover:border-gray-600
                              transition-colors cursor-pointer"
                  >?</button>

                  {showHelp && (
                    <div className="absolute top-full right-0 mt-2 w-80 z-50 rounded-xl
                                    border border-gray-200 p-4 shadow-sm text-xs font-mono kalmus-help transition-colors">
                      <p className="mb-4">
                        Advanced search — search by category and conditionals.
                      </p>

                      <p className="uppercase tracking-wide mb-2">Categories</p>
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {['title', 'director', 'actor', 'writer', 'genre', 'country', 'language'].map((col) => (
                          <code key={col} className="kalmus-surface-strong px-1.5 py-0.5 rounded">
                            {col}
                          </code>
                        ))}
                      </div>

                      <p className="uppercase tracking-wide mb-2">Operators</p>
                      <div className="flex gap-1.5 mb-4">
                        {['AND', 'OR', 'NOT'].map((op) => (
                          <code key={op} className="kalmus-surface-strong px-1.5 py-0.5 rounded">
                            {op}
                          </code>
                        ))}
                      </div>

                      <p className="uppercase tracking-wide mb-1">Example</p>
                      <code className="leading-relaxed break-words">
                        {'(country: united states AND director: hitchcock) OR country: germany'}
                      </code>
                    </div>
                  )}
                </div>
              </div>
              {loading && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <svg
                    className="animate-spin h-4 w-4"
                    style={{ color: 'var(--accent-crimson)' }}
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12" cy="12" r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Selection Buttons */}
          <div className="mb-4 flex flex-wrap justify-center gap-[0.25]">
            {/* A-Z buttons */}
            {Array.from({length: 26}, (_, i) => String.fromCharCode(65 + i)).map(letter => (
              <button
                key={letter}
                className={`px-2 py-1 border rounded text-sm font-mono transition-colors ${
                  activeSelection === letter ? "bg-indigo-600 text-white" : "bg-white text-black"
                }`}
                onClick={() => {
                  setActiveSelection(letter);
                  setQuery("");
                }}
              >
                {letter}
              </button>
            ))}

            {/* Numbers */}
              <button
              className={`px-2 py-1 border rounded text-sm font-mono transition-colors ${
                activeSelection === "numbers" ? "bg-indigo-600 text-white" : "bg-white text-black"
              }`}
              onClick={() => {
                  setActiveSelection("numbers");
                  setQuery("");
                }}
              >
                0-9
              </button>

            {/* Symbols */}
            <button
              onClick={() => {
                setActiveSelection("symbols");
                setQuery("");
              }}
              className={`px-2 py-1 border rounded text-sm font-mono transition-colors ${
                activeSelection === "symbols" ? "bg-indigo-600 text-white" : "bg-white text-black"
              }`}
            >
              #
            </button>

            {/* Random */}
            <button
              onClick={() => {
                setActiveSelection(null); // Force requery
                setTimeout(() => {
                  setActiveSelection("random");
                }, 0);
                setQuery("");
              }}
              className="px-2 py-1 border rounded text-sm font-mono transition-colors bg-white text-black"
            >
              Surprise Me!
            </button>
          </div>

          {/* Upload CTA */}
          <div className="text-center mb-14">
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 px-5 py-2 font-mono text-[11px] tracking-[0.22em] uppercase transition-all"
              style={{
                color: 'var(--accent-amber)',
                border: '1px solid var(--accent-amber)',
                borderRadius: 0,
                opacity: 0.85,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.85')}
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Upload New Video
            </Link>
          </div>

          {/* Results */}
          {searched && !loading && (
            <>
              {grouped.length > 0 ? (
                <div>
                  <p className="font-mono text-[9px] tracking-[0.35em] uppercase kalmus-text-secondary mb-4">
                    ▸ {results.length} record{results.length !== 1 ? "s" : ""} retrieved
                  </p>

                  <div className="divide-y" style={{ borderColor: 'var(--accent-crimson)', borderTopWidth: 1, opacity: 1 }}>
                    {grouped.map((film) => (
                      <div
                        key={`${film.title}::${film.imdb_id ?? ""}`}
                        className="py-5 flex gap-5 group"
                        style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(100,100,100,0.25)' }}
                      >
                        {/* Poster */}
                        <div className="w-[80px] aspect-[2/3] shrink-0">
                          {film.poster
                            ? <img src={film.poster} alt={film.title} className="w-full h-full object-cover"/>
                            : <div className="w-full h-full kalmus-help flex items-center justify-center">No poster</div>
                          }
                        </div>

                        {/* Content */}
                        <div className="flex flex-col justify-between flex-1 min-w-0">
                          {/* Title and metadata */}
                          <div>
                            <h3 className="text-lg tracking-tight kalmus-text-primary leading-snug font-display">
                              {film.imdb_id ? (
                                <a
                                  href={`https://www.imdb.com/title/${film.imdb_id}/`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:underline"
                                >
                                  {film.title}
                                </a>
                              ) : (
                                <span>{film.title}</span>
                              )}
                            </h3>
                            <div className="font-mono text-xs kalmus-text-secondary mt-1">
                              {(() => {
                                const format = (val: string | null) => val ? val.split(',').join(' & ') : null;

                                const parts = [
                                  format(film.director),
                                  film.released && new Date(film.released).getFullYear(),
                                  film.runtime_minutes && `${Math.floor(Number(film.runtime_minutes) / 60)}h${Number(film.runtime_minutes) % 60}m`,
                                  format(film.country),
                                ].filter(Boolean);

                                return parts.length > 0 && (
                                  <span>({parts.join(', ')})</span>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Analyses summary */}
                          <div>
                            {film.analyses.map((a) => (
                              <Link
                                key={a.job_id}
                                href={`/results/${a.job_id}`}
                                className="grid grid-cols-[1fr_2fr_auto] items-center gap-4 border-b-2 border-transparent hover:border-blue-500"
                                style={{ color: 'var(--accent-amber)' }}
                              >
                                <div className="flex items-center gap-1 font-mono text-xs kalmus-text-secondary capitalize">
                                  <span>{a.barcode_type}</span>
                                  <span style={{ color: 'var(--accent-crimson)' }}>|</span>
                                  <span>{a.frame_type.replace(/_/g, " ")}</span>
                                  <span style={{ color: 'var(--accent-crimson)' }}>|</span>
                                  <span>{a.metric}</span>
                                </div>
                                <div className="flex items-center gap-1 font-mono text-xs kalmus-text-secondary">
                                  <span>Source File:</span>
                                  <span>{a.source_width} x {a.source_height},</span>
                                  <span>{a.source_fps.toFixed(3)} fps,</span>
                                  <span>{a.source_frame_count} frames</span>
                                </div>
                                <div className="font-mono text-[10px] tracking-wider uppercase transition-colors">
                                  <span>View →</span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center">
                  <p className="font-mono text-[9px] tracking-[0.35em] uppercase kalmus-text-secondary mb-2">
                    ▸ No records found
                  </p>
                  <p className="text-sm font-light kalmus-text-secondary mb-8 font-mono">
                    &ldquo;{query.trim()}&rdquo; hasn&apos;t been analyzed yet.
                  </p>
                  <Link
                    href="/upload"
                    className="inline-flex items-center gap-2 px-5 py-2 font-mono text-[11px] tracking-[0.22em] uppercase transition-all"
                    style={{
                      color: 'var(--accent-amber)',
                      border: '1px solid var(--accent-amber)',
                      borderRadius: 0,
                      opacity: 0.85,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.85')}
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    Upload &amp; Analyze
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="py-8 text-center">
        <div
          aria-hidden
          style={{ height: 1, background: 'var(--accent-crimson)', width: 60, margin: '0 auto 16px', opacity: 0.4 }}
        />
        <p className="font-mono text-[9px] tracking-[0.28em] uppercase kalmus-text-muted">
          Powered by{" "}
          <a
            href="https://github.com/KALMUS-Color-Toolkit/KALMUS"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-[var(--text-secondary)] transition-colors"
          >
            KALMUS
          </a>
        </p>
      </footer>
    </div>
  );
}
