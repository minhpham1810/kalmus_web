"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";

interface FilmSearchResult {
  id: string;
  title: string;
  imdb_id: string | null;
  poster: string | null;
  director: string | null;
  runtime: string | null;
  country: string | null;
  released: string | null;
  barcode_type: string;
  frame_type: string;
  metric: string;
  process_date: string;
}

interface GroupedFilm {
  title: string;
  imdb_id: string | null;

  poster: string | null;
  director: string | null;
  runtime: string | null;
  country: string | null;
  released: string | null;

  analyses: {
    id: string;
    barcode_type: string;
    frame_type: string;
    metric: string;
    process_date: string;
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
        runtime: r.runtime,
        country: r.country,
        released: r.released,
        analyses: [],
      });
    }
    map.get(key)!.analyses.push({
      id: r.id,
      barcode_type: r.barcode_type,
      frame_type: r.frame_type,
      metric: r.metric,
      process_date: r.process_date,
    });
  }
  return Array.from(map.values());
}

export default function Home() {
  const [activeSelection, setActiveSelection] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FilmSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const res = await fetch(
          `/api/search-films?q=${encodeURIComponent(activeSelection)}&titleOnly=true`
        );

        let selectionResults: FilmSearchResult[] = (await res.json()).results || [];

        if (activeSelection === "random" && selectionResults.length > 0) {
          const randomFilm = selectionResults[Math.floor(Math.random() * selectionResults.length)];
          selectionResults = [randomFilm];
        }

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

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg">

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
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveSelection(null);
                }}
                placeholder="Search by title, year, director, etc…"
                className="kalmus-input w-full pl-11 pr-4 py-4 bg-transparent text-sm font-light focus:outline-none transition-colors"
                style={{
                  border: '1px solid var(--accent-crimson)',
                  borderLeftWidth: '3px',
                }}
              />
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
          <div className="mb-4">
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
                        {film.poster && (
                          <div className="w-[80px] shrink-0">
                            <img
                              src={film.poster}
                              alt={film.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}

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
                              <span>{(film.director || film.released || film.runtime || film.country) && `(`}</span>
                              <span>{film.director && `${film.director}`}</span>
                              <span>{film.released && `, ${new Date(film.released).getFullYear()}`}</span>
                              <span>{film.runtime && `, ${Math.floor(Number(film.runtime) / 60)}h${Number(film.runtime) % 60}m`}</span>
                              <span>{film.country && `, ${film.country}`}</span>
                              <span>{(film.director || film.released || film.runtime || film.country) && `)`}</span>
                            </div>
                          </div>

                          {/* Analyses summary */}
                          <div>
                            {film.analyses.map((a) => (
                              <div
                                key={a.id}
                                className="flex items-center justify-between"
                              >
                                <div className="flex items-center gap-2 font-mono text-xs kalmus-text-secondary capitalize">
                                  <span>{a.barcode_type}</span>
                                  <span style={{ color: 'var(--accent-crimson)' }}>|</span>
                                  <span>{a.frame_type.replace(/_/g, " ")}</span>
                                  <span style={{ color: 'var(--accent-crimson)' }}>|</span>
                                  <span>{a.metric}</span>
                                </div>
                                <Link
                                  href={`/results/${a.id}`}
                                  className="font-mono text-[10px] tracking-wider uppercase transition-colors"
                                  style={{ color: 'var(--accent-amber)' }}
                                >
                                  View →
                                </Link>
                              </div>
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
