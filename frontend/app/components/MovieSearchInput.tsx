"use client";

import { useState, useEffect, useRef } from "react";

export interface MovieMetadata {
  imdb_id: string;
  title: string;
  year: string;
  genre: string;
  director: string;
  plot: string;
  poster_url: string;
  raw: Record<string, unknown>;
}

// Either full OMDb metadata or a manual { title } entry
export type MovieInfo = MovieMetadata | { title: string };

interface SearchResult {
  imdbID: string;
  Title: string;
  Year: string;
  Poster: string;
}

interface MovieSearchInputProps {
  onChange: (movie: MovieInfo | null) => void;
}

const IMDB_ID_RE = /^tt\d{7,8}$/i;

export default function MovieSearchInput({ onChange }: MovieSearchInputProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<MovieMetadata | null>(null);
  const [submittedManual, setSubmittedManual] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualInputValue, setManualInputValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced search / immediate IMDb-ID fetch
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    if (IMDB_ID_RE.test(trimmed)) {
      fetchDetails(trimmed);
      return;
    }

    if (trimmed.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(() => fetchSearch(trimmed), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const fetchSearch = async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/omdb/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setResults(data.results || []);
      setShowDropdown(true);
    } catch {
      setResults([]);
      setShowDropdown(false);
      setError("Search unavailable — you can enter a title manually.");
      setShowManualInput(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetails = async (imdbId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/omdb/get?id=${encodeURIComponent(imdbId)}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as Record<string, string>).error || "Movie not found"
        );
      }
      const movie: MovieMetadata = await res.json();
      applySelection(movie);
    } catch (e) {
      setShowDropdown(false);
      setError(
        (e as Error).message || "Lookup failed — enter a title manually."
      );
      setShowManualInput(true);
    } finally {
      setLoading(false);
    }
  };

  const applySelection = (movie: MovieMetadata) => {
    setSelected(movie);
    setQuery("");
    setResults([]);
    setShowDropdown(false);
    setError(null);
    setShowManualInput(false);
    onChange(movie);
  };

  const handleClear = () => {
    setSelected(null);
    setSubmittedManual("");
    setQuery("");
    setResults([]);
    setShowDropdown(false);
    onChange(null);
  };

  const handleManualSubmit = () => {
    const title = manualInputValue.trim();
    if (!title) return;
    setSubmittedManual(title);
    setShowManualInput(false);
    setManualInputValue("");
    setError(null);
    onChange({ title });
  };

  // ─── Selected OMDb movie card ───
  if (selected) {
    return (
      <div className="flex items-start gap-3">
        {selected.poster_url && (
          <img
            src={selected.poster_url}
            alt={selected.title}
            className="w-12 rounded border border-neutral-200 dark:border-neutral-700"
            style={{ maxHeight: "72px", objectFit: "cover" }}
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {selected.title}{" "}
            <span className="font-normal text-neutral-500 dark:text-neutral-400">
              ({selected.year})
            </span>
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            {[
              selected.genre,
              selected.director && `Dir. ${selected.director}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <button
          onClick={handleClear}
          className="text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors flex-shrink-0"
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    );
  }

  // ─── Manual title card ───
  if (submittedManual) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
            {submittedManual}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Entered manually
          </p>
        </div>
        <button
          onClick={handleClear}
          className="text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors flex-shrink-0"
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    );
  }

  // ─── Search input + dropdown ───
  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setError(null);
          }}
          onFocus={() => {
            if (results.length > 0) setShowDropdown(true);
          }}
          placeholder="Title or IMDb ID (e.g. tt1234567)"
          className="w-full px-3 py-2 pr-8 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400"
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

      {/* Result rows */}
      {showDropdown && results.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 z-10 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg max-h-56 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.imdbID}
              onClick={() => {
                setShowDropdown(false);
                fetchDetails(r.imdbID);
              }}
              className="w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
            >
              {r.Poster && (
                <img
                  src={r.Poster}
                  alt={r.Title}
                  className="w-8 rounded flex-shrink-0"
                  style={{ maxHeight: "40px", objectFit: "cover" }}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                  {r.Title}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {r.Year} · {r.imdbID}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Empty-state message */}
      {showDropdown &&
        results.length === 0 &&
        !loading &&
        query.trim().length >= 2 &&
        !error && (
          <div className="absolute top-full mt-1 left-0 right-0 z-10 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg px-3 py-2">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              No results found.
            </p>
          </div>
        )}

      {/* Error banner */}
      {error && (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          {error}
        </p>
      )}

      {/* Manual-entry input */}
      {showManualInput && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={manualInputValue}
            onChange={(e) => setManualInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleManualSubmit();
            }}
            placeholder="Movie title"
            className="flex-1 px-3 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400"
          />
          <button
            onClick={handleManualSubmit}
            disabled={!manualInputValue.trim()}
            className="px-3 py-1.5 text-xs font-medium bg-neutral-200 dark:bg-neutral-600 text-neutral-800 dark:text-neutral-200 rounded hover:bg-neutral-300 dark:hover:bg-neutral-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Use This
          </button>
        </div>
      )}

      {/* Toggle to manual entry */}
      {!showManualInput && (
        <button
          onClick={() => setShowManualInput(true)}
          className="mt-2 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 underline"
        >
          Enter title manually
        </button>
      )}
    </div>
  );
}
