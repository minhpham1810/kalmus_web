"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";

interface FilmSearchResult {
  id: string;
  title: string;
  imdb_id: string | null;
  released: string | null;
  barcode_type: string;
  frame_type: string;
  metric: string;
  process_date: string;
}

interface GroupedFilm {
  title: string;
  imdb_id: string | null;
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

const SPECTRAL = "linear-gradient(90deg, transparent 0%, #e53935 12%, #fb8c00 26%, #fdd835 40%, #43a047 52%, #1e88e5 66%, #5e35b1 80%, transparent 100%)";

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FilmSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
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
  }, [query]);

  const grouped = groupResults(results);

  return (
    <div className="min-h-screen flex flex-col">
      {/* About link */}
      <div className="fixed top-5 right-24 z-50">
        <Link
          href="/about"
          className="font-mono text-[11px] tracking-[0.18em] uppercase text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
        >
          About
        </Link>
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg">

          {/* Logo + spectral motif */}
          <header className="text-center mb-12">
            <div className="flex justify-center mb-6">
              <Image
                src="/kalmus-logo.png"
                alt="KALMUS"
                width={300}
                height={100}
                className="dark:invert"
                priority
              />
            </div>

            <div
              aria-hidden
              style={{ height: 1, background: SPECTRAL, width: 180, margin: "0 auto 18px" }}
            />

            <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-neutral-400 dark:text-neutral-500">
              Quantitative color analysis · Cinema
            </p>
          </header>

          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <svg
                className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 dark:text-neutral-500"
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
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title or IMDb ID…"
                className="w-full pl-11 pr-4 py-4 bg-transparent border border-neutral-300 dark:border-neutral-600 text-sm font-light text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none focus:border-neutral-600 dark:focus:border-neutral-400 transition-colors"
                style={{ borderRadius: 0 }}
              />
              {loading && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <svg
                    className="animate-spin h-4 w-4 text-neutral-400"
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

          {/* Upload CTA */}
          <div className="text-center mb-14">
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 px-5 py-2 font-mono text-[11px] tracking-[0.18em] uppercase text-neutral-500 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-600 hover:border-neutral-600 dark:hover:border-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
              style={{ borderRadius: 0 }}
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
                  <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-neutral-400 dark:text-neutral-500 mb-4">
                    {results.length} result{results.length !== 1 ? "s" : ""} found
                  </p>

                  <div className="divide-y divide-neutral-200 dark:divide-neutral-700/60">
                    {grouped.map((film) => (
                      <div
                        key={`${film.title}::${film.imdb_id ?? ""}`}
                        className="py-5"
                      >
                        <div className="flex items-baseline justify-between mb-3 gap-4">
                          <h3 className="text-base font-light tracking-tight text-neutral-900 dark:text-neutral-100 leading-snug">
                            {film.title}
                          </h3>
                          <div className="flex items-center gap-3 shrink-0">
                            {film.released && (
                              <span className="font-mono text-[11px] text-neutral-400 dark:text-neutral-500">
                                {film.released}
                              </span>
                            )}
                            {film.imdb_id && (
                              <span className="font-mono text-[11px] text-neutral-400 dark:text-neutral-500">
                                {film.imdb_id}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          {film.analyses.map((a) => (
                            <div
                              key={a.id}
                              className="flex items-center justify-between group"
                            >
                              <div className="flex items-center gap-2 font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                                <span className="text-neutral-700 dark:text-neutral-300">
                                  {a.barcode_type}
                                </span>
                                <span className="text-neutral-300 dark:text-neutral-600">·</span>
                                <span>{a.frame_type.replace(/_/g, " ")}</span>
                                <span className="text-neutral-300 dark:text-neutral-600">·</span>
                                <span>{a.metric}</span>
                              </div>
                              <Link
                                href={`/results/${a.id}`}
                                className="font-mono text-[11px] tracking-wider uppercase text-neutral-400 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
                              >
                                View →
                              </Link>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center">
                  <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-neutral-400 dark:text-neutral-500 mb-2">
                    No results
                  </p>
                  <p className="text-sm font-light text-neutral-500 dark:text-neutral-400 mb-8">
                    &ldquo;{query.trim()}&rdquo; hasn&apos;t been analyzed yet.
                  </p>
                  <Link
                    href="/upload"
                    className="inline-flex items-center gap-2 px-5 py-2 font-mono text-[11px] tracking-[0.18em] uppercase text-neutral-500 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-600 hover:border-neutral-600 dark:hover:border-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
                    style={{ borderRadius: 0 }}
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
          style={{ height: 1, background: SPECTRAL, width: 80, margin: "0 auto 16px", opacity: 0.35 }}
        />
        <p className="font-mono text-[10px] tracking-[0.28em] uppercase text-neutral-400 dark:text-neutral-500">
          Powered by{" "}
          <a
            href="https://github.com/KALMUS-Color-Toolkit/KALMUS"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
          >
            KALMUS
          </a>
        </p>
      </footer>
    </div>
  );
}
