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

const inputStyle = {
  width: '100%',
  padding: '8px 32px 8px 12px',
  fontSize: '13px',
  fontFamily: 'inherit',
  outline: 'none',
} as React.CSSProperties;

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
      <div className="kalmus-surface flex items-start gap-3 p-3">
        {selected.poster_url && (
          <img
            src={selected.poster_url}
            alt={selected.title}
            className="w-10 flex-shrink-0"
            style={{ maxHeight: "60px", objectFit: "cover", border: '1px solid var(--surface-border)' }}
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs kalmus-text-primary truncate">
            {selected.title}{" "}
            <span style={{ color: 'var(--accent-amber)' }}>
              ({selected.year})
            </span>
          </p>
          <p className="font-mono text-xs kalmus-text-secondary truncate mt-0.5">
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
          className="transition-colors flex-shrink-0"
          style={{ color: 'var(--accent-crimson)' }}
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
      <div className="kalmus-surface flex items-center gap-3 p-3">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs kalmus-text-primary truncate">
            {submittedManual}
          </p>
          <p className="font-mono text-xs kalmus-text-secondary">
            Entered manually
          </p>
        </div>
        <button
          onClick={handleClear}
          className="transition-colors flex-shrink-0"
          style={{ color: 'var(--accent-crimson)' }}
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
          className="kalmus-input"
          style={inputStyle}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg
              className="animate-spin h-4 w-4"
              style={{ color: 'var(--accent-amber)' }}
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
        <div className="absolute top-full mt-1 left-0 right-0 z-10 max-h-56 overflow-y-auto" style={{ background: 'var(--panel-gradient)', border: '1px solid var(--input-border)' }}>
          {results.map((r) => (
            <button
              key={r.imdbID}
              onClick={() => {
                setShowDropdown(false);
                fetchDetails(r.imdbID);
              }}
              className="w-full text-left flex items-center gap-3 px-3 py-2 transition-colors"
              style={{ borderBottom: '1px solid var(--surface-border)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {r.Poster && (
                <img
                  src={r.Poster}
                  alt={r.Title}
                  className="w-7 flex-shrink-0"
                  style={{ maxHeight: "36px", objectFit: "cover", border: '1px solid var(--surface-border)' }}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs kalmus-text-primary truncate">
                  {r.Title}
                </p>
                <p className="font-mono text-xs kalmus-text-secondary">
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
          <div className="absolute top-full mt-1 left-0 right-0 z-10 px-3 py-2" style={{ background: 'var(--panel-gradient)', border: '1px solid var(--input-border)' }}>
            <p className="font-mono text-xs kalmus-text-secondary">
              No results found.
            </p>
          </div>
        )}

      {/* Error banner */}
      {error && (
        <p className="mt-2 font-mono text-xs kalmus-text-secondary">
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
            className="kalmus-input"
            style={{ ...inputStyle, padding: '6px 12px' }}
          />
          <button
            onClick={handleManualSubmit}
            disabled={!manualInputValue.trim()}
            className="px-3 py-1.5 font-mono text-xs tracking-wider uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--surface-bg-strong)', border: '1px solid var(--accent-crimson)', color: 'var(--accent-amber)', borderRadius: 0 }}
          >
            Use This
          </button>
        </div>
      )}

      {/* Toggle to manual entry */}
      {!showManualInput && (
        <button
          onClick={() => setShowManualInput(true)}
          className="mt-2 font-mono text-xs underline kalmus-text-muted transition-colors"
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          Enter title manually
        </button>
      )}
    </div>
  );
}
