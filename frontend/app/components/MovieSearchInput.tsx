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
      setError("// Search unavailable - enter title manually");
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
        `// ${(e as Error).message || "Lookup failed"} - enter manually`
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
      <div className="flex items-start gap-4 p-4 bg-black/40 border border-cyan-500/20 rounded relative overflow-hidden">
        {/* Decorative corners */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cyan-500/50" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-cyan-500/50" />
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cyan-500/50" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cyan-500/50" />
        
        {selected.poster_url && (
          <img
            src={selected.poster_url}
            alt={selected.title}
            className="w-14 rounded border border-amber-500/20"
            style={{ maxHeight: "80px", objectFit: "cover" }}
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono text-amber-100/90">
            {selected.title}{" "}
            <span className="text-cyan-400/70">
              ({selected.year})
            </span>
          </p>
          <p className="text-xs text-neutral-500 font-mono truncate mt-1">
            {[
              selected.genre,
              selected.director && `Dir. ${selected.director}`,
            ]
              .filter(Boolean)
              .join(" // ")}
          </p>
          <p className="text-xs text-amber-500/50 font-mono mt-1">
            ID: {selected.imdb_id}
          </p>
        </div>
        <button
          onClick={handleClear}
          className="p-2 text-amber-500/60 hover:text-red-400 hover:bg-red-500/10 rounded transition-all duration-200 flex-shrink-0"
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
      <div className="flex items-center gap-4 p-4 bg-black/40 border border-amber-500/20 rounded relative overflow-hidden">
        {/* Decorative corners */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-amber-500/40" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-amber-500/40" />
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-amber-500/40" />
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-amber-500/40" />
        
        <div className="w-10 h-10 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono text-amber-100/90 truncate">
            {submittedManual}
          </p>
          <p className="text-xs text-amber-500/50 font-mono">
            // MANUAL_ENTRY
          </p>
        </div>
        <button
          onClick={handleClear}
          className="p-2 text-amber-500/60 hover:text-red-400 hover:bg-red-500/10 rounded transition-all duration-200 flex-shrink-0"
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
      <div className="relative group">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
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
        </div>
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
          placeholder="SEARCH_TITLE_OR_IMDB_ID..."
          className="w-full pl-10 pr-10 py-2.5 text-sm font-mono bg-black/40 border border-amber-500/20 rounded text-amber-100/90 placeholder-amber-500/30 focus:outline-none focus:border-amber-500/50 focus:shadow-[0_0_15px_rgba(212,165,116,0.1)] transition-all duration-300"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
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

      {/* Result rows */}
      {showDropdown && results.length > 0 && (
        <div className="absolute top-full mt-2 left-0 right-0 z-10 panel border border-amber-500/20 rounded shadow-lg max-h-64 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.imdbID}
              onClick={() => {
                setShowDropdown(false);
                fetchDetails(r.imdbID);
              }}
              className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-amber-500/10 transition-colors border-b border-amber-500/10 last:border-0"
            >
              {r.Poster && r.Poster !== 'N/A' && (
                <img
                  src={r.Poster}
                  alt={r.Title}
                  className="w-10 rounded border border-amber-500/20 flex-shrink-0"
                  style={{ maxHeight: "48px", objectFit: "cover" }}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-mono text-amber-100/90 truncate">
                  {r.Title}
                </p>
                <p className="text-xs text-amber-500/50 font-mono">
                  {r.Year} // {r.imdbID}
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
          <div className="absolute top-full mt-2 left-0 right-0 z-10 panel border border-amber-500/20 rounded shadow-lg px-4 py-3">
            <p className="text-xs text-neutral-500 font-mono">
              // NO_RESULTS_FOUND
            </p>
          </div>
        )}

      {/* Error banner */}
      {error && (
        <p className="mt-2 text-xs text-amber-500/60 font-mono">
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
            placeholder="ENTER_MOVIE_TITLE"
            className="flex-1 px-3 py-2 text-sm font-mono bg-black/40 border border-amber-500/20 rounded text-amber-100/90 placeholder-amber-500/30 focus:outline-none focus:border-amber-500/50 transition-all duration-300"
          />
          <button
            onClick={handleManualSubmit}
            disabled={!manualInputValue.trim()}
            className="px-4 py-2 text-xs font-mono bg-amber-500/20 text-amber-400 rounded border border-amber-500/30 hover:bg-amber-500/30 hover:border-amber-500/50 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed tracking-wider"
          >
            [CONFIRM]
          </button>
        </div>
      )}

      {/* Toggle to manual entry */}
      {!showManualInput && (
        <button
          onClick={() => setShowManualInput(true)}
          className="mt-2 text-xs font-mono text-amber-500/50 hover:text-amber-400 transition-colors"
        >
          // ENTER_TITLE_MANUALLY
        </button>
      )}
    </div>
  );
}
