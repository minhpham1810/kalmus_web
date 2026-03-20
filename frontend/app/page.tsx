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

function StatusIndicator() {
  const [time, setTime] = useState<string>("");
  
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-6 text-xs text-amber-500/60 font-mono">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(78,205,196,0.6)] animate-pulse" />
        <span>SYSTEM_ONLINE</span>
      </div>
      <div className="hidden sm:block">{time}</div>
    </div>
  );
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
    <div className="min-h-screen">
      {/* Top Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-40 border-b border-amber-500/10 bg-black/40 backdrop-blur-md">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <StatusIndicator />
          <Link
            href="/about"
            className="text-xs font-mono text-amber-500/60 hover:text-amber-400 transition-colors tracking-wider"
          >
            [ABOUT]
          </Link>
        </div>
      </nav>

      <main className="container mx-auto px-4 pt-28 pb-12">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <header className="text-center mb-12">
            <div className="flex justify-center mb-6 opacity-0 animate-[fade-in-up_0.6s_ease-out_forwards]">
              <Image
                src="/kalmus-logo.png"
                alt="KALMUS"
                width={360}
                height={120}
                className="dark:invert opacity-90"
                priority
              />
            </div>
            <div className="opacity-0 animate-[fade-in-up_0.6s_ease-out_0.1s_forwards]">
              <p className="text-sm text-amber-500/60 font-mono tracking-widest uppercase mb-2">
                Film Color Analysis System
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-500 font-mono">
                // Decode the chromatic DNA of cinema
              </p>
            </div>
          </header>

          {/* Search Input */}
          <div className="mb-8 opacity-0 animate-[fade-in-up_0.6s_ease-out_0.2s_forwards]">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500/20 to-cyan-500/20 rounded blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-amber-500/50"
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
                  <span className="text-amber-500/30 text-xs font-mono">{'>>'}</span>
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="QUERY_FILM_DATABASE..."
                  className="w-full pl-20 pr-12 py-4 bg-black/60 border border-amber-500/20 rounded text-sm text-amber-100/90 placeholder-amber-500/30 font-mono tracking-wide focus:outline-none focus:border-amber-500/50 focus:shadow-[0_0_20px_rgba(212,165,116,0.15)] transition-all duration-300"
                />
                {loading && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <svg
                      className="animate-spin h-4 w-4 text-amber-500/60"
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
          </div>

          {/* Upload Link */}
          <div className="text-center mb-12 opacity-0 animate-[fade-in-up_0.6s_ease-out_0.3s_forwards]">
            <Link
              href="/upload"
              className="group inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-700 text-black text-sm font-mono font-medium tracking-wider rounded border border-amber-500/30 hover:shadow-[0_0_30px_rgba(212,165,116,0.3)] transition-all duration-300 hover:-translate-y-0.5"
            >
              <svg
                className="w-4 h-4 transition-transform group-hover:rotate-90 duration-300"
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
              UPLOAD_NEW_VIDEO
            </Link>
          </div>

          {/* Results */}
          {searched && !loading && (
            <div className="opacity-0 animate-[fade-in-up_0.6s_ease-out_forwards]">
              {grouped.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
                    <p className="text-xs text-amber-500/60 font-mono tracking-widest">
                      {results.length} RECORD{results.length !== 1 ? "S" : ""} FOUND
                    </p>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
                  </div>
                  {grouped.map((film, index) => (
                    <div
                      key={`${film.title}::${film.imdb_id ?? ""}`}
                      className="group panel border border-amber-500/10 rounded p-5 hover:border-amber-500/30 transition-all duration-300 hover:shadow-[0_0_20px_rgba(212,165,116,0.1)]"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <div className="mb-3">
                        <h3 className="text-base font-medium text-amber-100/90 group-hover:text-amber-400 transition-colors">
                          {film.title}
                        </h3>
                        <div className="flex items-center gap-3 mt-1">
                          {film.imdb_id && (
                            <span className="text-xs text-cyan-400/60 font-mono">
                              {film.imdb_id}
                            </span>
                          )}
                          {film.released && (
                            <span className="text-xs text-neutral-500">
                              {film.released}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="border-t border-amber-500/10 pt-3 space-y-2">
                        {film.analyses.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-3 text-xs">
                              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400/80 rounded font-mono">
                                {a.barcode_type}
                              </span>
                              <span className="text-neutral-400">{a.frame_type.replace(/_/g, " ")}</span>
                              <span className="text-neutral-500">
                                {a.metric}
                              </span>
                            </div>
                            <Link
                              href={`/results/${a.id}`}
                              className="text-xs font-mono text-cyan-400/80 hover:text-cyan-300 transition-colors tracking-wider"
                            >
                              [VIEW]
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 panel border border-amber-500/10 rounded">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/10 mb-4">
                    <svg className="w-6 h-6 text-amber-500/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-amber-100/70 mb-1 font-mono">
                    NO_RECORDS_FOUND
                  </p>
                  <p className="text-xs text-neutral-500 mb-6 font-mono">
                    // Query: &ldquo;{query.trim()}&rdquo; returned empty
                  </p>
                  <Link
                    href="/upload"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 text-black text-sm font-mono font-medium tracking-wider rounded border border-amber-500/30 hover:shadow-[0_0_20px_rgba(212,165,116,0.2)] transition-all duration-300"
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
                    UPLOAD_NEW_VIDEO
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="py-8 border-t border-amber-500/10">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-neutral-500">
            <p>
              POWERED_BY{" "}
              <a
                href="https://github.com/KALMUS-Color-Toolkit/KALMUS"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-500/60 hover:text-amber-400 transition-colors"
              >
                KALMUS_TOOLKIT
              </a>
            </p>
            <p className="text-neutral-600">
              v2.0.0 // FILM_COLOR_ANALYSIS_SYSTEM
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
