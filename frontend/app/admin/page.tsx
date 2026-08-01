"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import FilmEditor, { FilmRecord } from "@/app/components/FilmEditor";
import { FilmSearchResult, groupResults } from "@/lib/admin-films";
import AdminFilmCard from "@/app/components/admin/AdminFilmCard";
import BarcodeImagePreview, {
  BarcodePixel,
  FilmOfDayBarcode,
} from "@/app/components/admin/BarcodeImagePreview";

/**
 * admin page
 * all film-card structure lives in AdminFilmCard
 */
export default function AdminPage() {

  // --- search + selection state -------------------------------------------
  const helpRef = useRef<HTMLDivElement>(null);
  const [showHelp, setShowHelp] = useState(false);

  //  a-z search
  const [activeSelection, setActiveSelection] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FilmSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- film of the day  states ----------------------------------------------
  const [filmOfDayResults, setFilmOfDayResults] = useState<FilmSearchResult[]>([]);
  const [filmOfDayBarcode, setFilmOfDayBarcode] =
    useState<FilmOfDayBarcode | null>(null);
  const [filmOfDayLoading, setFilmOfDayLoading] = useState(true);
  const [filmOfDayBarcodeLoading, setFilmOfDayBarcodeLoading] = useState(false);

  // --- admin editing state -------------------------------------------------
  const [editingFilm, setEditingFilm] = useState<FilmRecord | null>(null);

  const getSelectionButtonStyle = (isActive: boolean) => ({
    background: isActive ? "var(--foreground)" : "var(--surface-bg)",
    color: isActive ? "var(--background)" : "var(--text-primary)",
    borderColor: isActive ? "var(--foreground)" : "var(--input-border)",
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setShowHelp(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // load film of the day
  useEffect(() => {
    let cancelled = false;
    async function loadFilmOfDay() {
      try {
        const res = await fetch("/api/film-of-day");
        const data = await res.json();
        if (!cancelled) setFilmOfDayResults(data.results || []);
      } catch {
        if (!cancelled) setFilmOfDayResults([]);
      } finally {
        if (!cancelled) setFilmOfDayLoading(false);
      }
    }
    loadFilmOfDay();
    return () => {
      cancelled = true;
    };
  }, []);

  // load film of the day data
  useEffect(() => {
    const jobId = filmOfDayResults[0]?.job_id;
    if (!jobId) {
      setFilmOfDayBarcode(null);
      return;
    }
    let cancelled = false;
    setFilmOfDayBarcodeLoading(true);
    async function loadFilmOfDayBarcode() {
      try {
        const res = await fetch(`/api/job-result/${jobId}`);
        const data = await res.json();
        const barcode = data?.barcode?.barcode;
        const barcodeType = data?.barcode?.barcode_type || "Color";
        if (
          !cancelled &&
          Array.isArray(barcode) &&
          (barcodeType === "Color" || barcodeType === "Brightness")
        ) {
          setFilmOfDayBarcode({ barcode: barcode as BarcodePixel[][], barcodeType });
        } else if (!cancelled) {
          setFilmOfDayBarcode(null);
        }
      } catch {
        if (!cancelled) setFilmOfDayBarcode(null);
      } finally {
        if (!cancelled) setFilmOfDayBarcodeLoading(false);
      }
    }
    loadFilmOfDayBarcode();
    return () => {
      cancelled = true;
    };
  }, [filmOfDayResults]);

  // skipped if selection filter
  useEffect(() => {
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
          `/api/search-films?q=${encodeURIComponent(trimmed)}`,
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

  // selection-filter effect
  useEffect(() => {
    if (!activeSelection) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        let res: Response;
        if (activeSelection === "random") {
          res = await fetch(`/api/search-films?random`);
        } else {
          let search: string;
          if (activeSelection === "numbers") {
            search = "numbers";
          } else if (activeSelection === "symbols") {
            search = "symbols";
          } else {
            search = `title:^${activeSelection}`;
          }
          res = await fetch(`/api/search-films?q=${encodeURIComponent(search)}`);
        }
        const selectionResults: FilmSearchResult[] =
          (await res.json()).results || [];
        setResults(selectionResults);
      } catch {
        setResults([]);
      } finally {
        setSearched(true);
        setLoading(false);
      }
    }, 300);
  }, [activeSelection]);

  /** Fetch a film's full metadata and open the editor menu. */
  const handleEditClick = async (jobId: string) => {
    try {
      const res = await fetch(`/api/edit-film/${jobId}`);
      if (!res.ok) throw new Error("Failed to load film metadata");
      const film: FilmRecord = await res.json();
      setEditingFilm(film);
    } catch (err) {
      console.error("Edit failed", err);
    }
  };

  /**
   * re-runs query to show changes in database
   */
  const refreshResults = () => {
    setEditingFilm(null);
    if (activeSelection) {
      const current = activeSelection;
      setActiveSelection(null);
      setTimeout(() => setActiveSelection(current), 0);
    } else if (query.trim()) {
      const current = query;
      setQuery("");
      setTimeout(() => setQuery(current), 0);
    }
  };

  const grouped = groupResults(results);
  const filmOfDay = groupResults(filmOfDayResults)[0] || null;
  const showFilmOfDay =
    !filmOfDayLoading &&
    !!filmOfDay &&
    !searched &&
    !loading &&
    !query.trim() &&
    !activeSelection;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Film editor drawer */}
      {editingFilm && (
        <FilmEditor
          film={editingFilm}
          onClose={() => setEditingFilm(null)}
          onSaved={refreshResults}
          onDeleted={refreshResults}
        />
      )}

      {/* top-right nav links */}
      <div className="fixed top-5 right-24 z-50 flex items-center gap-5">
        <Link href="/admin/dashboard" className="font-mono text-xs tracking-[0.22em] uppercase kalmus-text-secondary hover:text-[var(--text-primary)] transition-colors">
          Dashboard</Link>
        <Link href="/tutorials?from=admin" className="font-mono text-xs tracking-[0.22em] uppercase kalmus-text-secondary hover:text-[var(--text-primary)] transition-colors">
          Tutorials</Link>
        <Link href="/about?from=admin" className="font-mono text-xs tracking-[0.22em] uppercase kalmus-text-secondary hover:text-[var(--text-primary)] transition-colors">
          About</Link>
      </div>

      <main className="flex-1 flex flex-col items-center px-4 py-16">
        <div className="w-full max-w-4xl">
          {/* Header */}
          <header className="text-center mb-12">
            <div className="flex justify-center mb-5">
              <Image
                src="/kalmus-logo.png"
                alt="KALMUS"
                width={300}
                height={100}
                className="dark:invert"
                style={{ height: "auto" }}
                priority
              />
            </div>
            <div className="mb-2">
              <span
                className="font-mono text-xs tracking-[0.35em] uppercase"
                style={{ color: "var(--accent-amber)" }}
              >
                Admin
              </span>
            </div>
            <p className="font-mono text-xs tracking-[0.28em] uppercase kalmus-text-secondary">
              An archive and toolkit for analyzing film color
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
                    border: "1px solid var(--accent-crimson)",
                    borderLeftWidth: "3px",
                  }}
                />
                {/* Help popover */}
                <div
                  ref={helpRef}
                  className="absolute right-3 flex items-center kalmus-input transition-colors"
                >
                  <button
                    onClick={() => setShowHelp((v) => !v)}
                    aria-label="Search help"
                    aria-expanded={showHelp}
                    className="w-5 h-5 rounded-full text-xs flex items-center justify-center border hover:text-gray-600 hover:border-gray-600 transition-colors cursor-pointer"
                  >
                    ?
                  </button>
                  {showHelp && (
                    <div className="absolute top-full right-0 mt-2 w-80 z-50 rounded-xl border border-gray-200 p-4 shadow-sm text-xs font-mono kalmus-help transition-colors">
                      <p className="mb-4">
                        Advanced search — search by category and conditionals.
                      </p>
                      <p className="uppercase tracking-wide mb-2">Categories</p>
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {[
                          "title",
                          "director",
                          "actor",
                          "writer",
                          "genre",
                          "country",
                          "language",
                          "year", //test

                        ].map((col) => (
                          <code
                            key={col}
                            className="kalmus-surface-strong px-1.5 py-0.5 rounded"
                          >
                            {col}
                          </code>
                        ))}
                      </div>
                      <p className="uppercase tracking-wide mb-2">Operators</p>
                      <div className="flex gap-1.5 mb-4">
                        {["AND", "OR", "NOT"].map((op) => (
                          <code
                            key={op}
                            className="kalmus-surface-strong px-1.5 py-0.5 rounded"
                          >
                            {op}
                          </code>
                        ))}
                      </div>
                      <p className="uppercase tracking-wide mb-1">Example</p>
                      <code className="leading-relaxed break-words">
                        {
                          "(country: united states AND director: hitchcock) OR country: germany"
                        }
                      </code>
                    </div>
                  )}
                </div>
              </div>
              {loading && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <svg
                    className="animate-spin h-4 w-4"
                    style={{ color: "var(--accent-crimson)" }}
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

          {/* Selection buttons */}
          <div className="mb-4 flex flex-wrap justify-center gap-[0.25]">
            {Array.from({ length: 26 }, (_, i) =>
              String.fromCharCode(65 + i),
            ).map((letter) => (
              <button
                key={letter}
                className="px-2 py-1 border rounded text-sm font-mono transition-colors hover:bg-[var(--surface-hover)]"
                style={getSelectionButtonStyle(activeSelection === letter)}
                onClick={() => {
                  setActiveSelection(letter);
                  setQuery("");
                }}
              >
                {letter}
              </button>
            ))}
            <button
              className="px-2 py-1 border rounded text-sm font-mono transition-colors hover:bg-[var(--surface-hover)]"
              style={getSelectionButtonStyle(activeSelection === "numbers")}
              onClick={() => {
                setActiveSelection("numbers");
                setQuery("");
              }}
            >
              0-9
            </button>
            <button
              onClick={() => {
                setActiveSelection("symbols");
                setQuery("");
              }}
              className="px-2 py-1 border rounded text-sm font-mono transition-colors hover:bg-[var(--surface-hover)]"
              style={getSelectionButtonStyle(activeSelection === "symbols")}
            >
              #
            </button>
            <button
              onClick={() => {
                // Toggle off then on so re-clicking "random" re-queries.
                setActiveSelection(null);
                setTimeout(() => setActiveSelection("random"), 0);
                setQuery("");
              }}
              className="px-2 py-1 border rounded text-sm font-mono transition-colors hover:bg-[var(--surface-hover)]"
              style={getSelectionButtonStyle(activeSelection === "random")}
            >
              Surprise Me!
            </button>
          </div>

          {/* puload cta */}
          <div className="text-center mb-14">
            <Link
              href="/upload?from=admin"
              className="inline-flex items-center gap-2 px-5 py-2 font-mono text-xs tracking-[0.22em] uppercase transition-all"
              style={{
                color: "var(--accent-amber)",
                border: "1px solid var(--accent-amber)",
                borderRadius: 0,
                opacity: 0.85,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.85")}
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

          {/* film of the day */}
          {showFilmOfDay && (
            <section className="mb-14 kalmus-surface px-4 py-5 sm:px-6 sm:py-6">
              <p className="text-center font-mono text-xs tracking-[0.35em] uppercase kalmus-text-secondary mb-4">
                KALMUS Film of the Day
              </p>
              <div
                className="divide-y"
                style={{
                  borderColor: "var(--accent-crimson)",
                  borderTopWidth: 1,
                  opacity: 1,
                }}
              >
                {/* read-only card: no onEdit, no barcode preview */}
                <AdminFilmCard film={filmOfDay} />
              </div>
              {!filmOfDayBarcodeLoading && filmOfDayBarcode && (
                <BarcodeImagePreview data={filmOfDayBarcode} />
              )}
            </section>
          )}

          {/* Search results */}
          {searched && !loading && (
            <>
              {grouped.length > 0 ? (
                <div>
                  <p className="font-mono text-xs tracking-[0.35em] uppercase kalmus-text-secondary mb-4">
                    ▸ {results.length} record{results.length !== 1 ? "s" : ""}{" "}
                    retrieved
                  </p>
                  <div
                    className="divide-y"
                    style={{
                      borderColor: "var(--accent-crimson)",
                      borderTopWidth: 1,
                      opacity: 1,
                    }}
                  >
                    {grouped.map((film) => (
                      <AdminFilmCard
                        key={`${film.title}::${film.imdb_id ?? ""}`}
                        film={film}
                        onEdit={handleEditClick}
                        showBarcode
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center">
                  <p className="font-mono text-xs tracking-[0.35em] uppercase kalmus-text-secondary mb-2">
                    ▸ No records found
                  </p>
                  <Link
                    href="/upload?from=admin"
                    className="inline-flex items-center gap-2 px-5 py-2 font-mono text-xs tracking-[0.22em] uppercase transition-all"
                    style={{
                      color: "var(--accent-amber)",
                      border: "1px solid var(--accent-amber)",
                      borderRadius: 0,
                      opacity: 0.85,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.85")}
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
          style={{
            height: 1,
            background: "var(--accent-crimson)",
            width: 60,
            margin: "0 auto 16px",
            opacity: 0.4,
          }}
        />
        <p className="font-mono text-xs tracking-[0.28em] uppercase kalmus-text-muted">
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