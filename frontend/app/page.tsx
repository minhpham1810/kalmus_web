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
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      {/* Top-right About link — sits left of the theme toggle */}
      <div className="fixed top-4 right-14 z-50">
        <Link
          href="/about"
          className="text-m text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
        >
          About
        </Link>
      </div>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <header className="text-center mb-10">
            <div className="flex justify-center mb-3">
              <Image
                src="/kalmus-logo.png"
                alt="KALMUS"
                width={360}
                height={120}
                className="dark:invert"
                priority
              />
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 font-light">
              Explore movie color barcodes, or generate a new one
            </p>
          </header>

          {/* Search Input */}
          <div className="mb-8">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by movie title or IMDb ID..."
                className="w-full pl-11 pr-4 py-3 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition-colors"
              />
              {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg
                    className="animate-spin h-4 w-4 text-neutral-400"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
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

          {/* Upload Link (always visible) */}
          <div className="text-center mb-10">
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium rounded hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
            >
              <svg
                className="w-4 h-4"
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
                <div className="space-y-4">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide font-medium">
                    {results.length} result{results.length !== 1 ? "s" : ""}{" "}
                    found
                  </p>
                  {grouped.map((film) => (
                    <div
                      key={`${film.title}::${film.imdb_id ?? ""}`}
                      className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded p-5"
                    >
                      <div className="mb-3">
                        <h3 className="text-base font-medium text-neutral-900 dark:text-neutral-100">
                          {film.title}
                        </h3>
                        <div className="flex items-center gap-3 mt-1">
                          {film.imdb_id && (
                            <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                              {film.imdb_id}
                            </span>
                          )}
                          {film.released && (
                            <span className="text-xs text-neutral-500 dark:text-neutral-400">
                              {film.released}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="border-t border-neutral-100 dark:border-neutral-700 pt-3 space-y-2">
                        {film.analyses.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3 text-xs text-neutral-600 dark:text-neutral-400">
                              <span className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded">
                                {a.barcode_type}
                              </span>
                              <span>{a.frame_type.replace(/_/g, " ")}</span>
                              <span className="text-neutral-400 dark:text-neutral-500">
                                {a.metric}
                              </span>
                            </div>
                            <Link
                              href={`/results/${a.id}`}
                              className="text-xs font-medium text-neutral-900 dark:text-neutral-100 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors underline"
                            >
                              View
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
                    No results for &ldquo;{query.trim()}&rdquo;
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-500 mb-6">
                    This film hasn&apos;t been analyzed yet.
                  </p>
                  <Link
                    href="/upload"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium rounded hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
                  >
                    <svg
                      className="w-4 h-4"
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
              )}
            </>
          )}
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-neutral-400 dark:text-neutral-600">
        <p>
          Powered by{" "}
          <a
            href="https://github.com/KALMUS-Color-Toolkit/KALMUS"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-neutral-600 dark:hover:text-neutral-400"
          >
            KALMUS
          </a>
        </p>
      </footer>
    </div>
  );
}
