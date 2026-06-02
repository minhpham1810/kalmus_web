"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import FilmEditor, { FilmRecord } from "@/app/components/FilmEditor";

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

// film of the day addition
type BarcodePixel = [number, number, number] | number;

interface FilmOfDayBarcode {
  barcode: BarcodePixel[][];
  barcodeType: "Color" | "Brightness";
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

function BarcodeImagePreview({data, fixed }: { data: FilmOfDayBarcode; fixed?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const barcode = data.barcode;
    if (!canvas || barcode.length === 0) return;

    const height = barcode.length;
    const width = barcode[0]?.length || 0;
    if (width === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    const imageData = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = barcode[y][x];
        const idx = (y * width + x) * 4;

        if (data.barcodeType === "Color" && Array.isArray(pixel)) {
          imageData.data[idx] = pixel[0];
          imageData.data[idx + 1] = pixel[1];
          imageData.data[idx + 2] = pixel[2];
        } else {
          const gray = typeof pixel === "number" ? pixel : pixel[0] || 0;
          imageData.data[idx] = gray;
          imageData.data[idx + 1] = gray;
          imageData.data[idx + 2] = gray;
        }
        imageData.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [data]);

  return (
    <div className="pt-5">
      <canvas
        ref={canvasRef}
        aria-label="Film of the Day barcode preview"
        // film of the day barcode test
        className = {fixed ? "block" : "block w-full h-auto"}
        style={{
          ...(fixed ? {width: "100%", height: "100%"}: {}),
          border: "1px solid rgba(100,100,100,0.25)",
          imageRendering: "auto",
        }}
      />
    </div>
  );
}

function FilmResultCard({ film }: { film: GroupedFilm }) {
  const format = (val: string | null) =>
    val ? val.split(",").join(" & ") : null;

  const metadataParts = [
    format(film.director),
    film.released && new Date(film.released).getFullYear(),
    film.runtime_minutes &&
      `${Math.floor(Number(film.runtime_minutes) / 60)}h${Number(film.runtime_minutes) % 60}m`,
    format(film.country),
  ].filter(Boolean);

  return (
    <div
      className="py-5 flex gap-5 group"
      style={{
        borderBottomWidth: 1,
        borderBottomColor: "rgba(100,100,100,0.25)",
      }}
    >
      <div className="w-[80px] aspect-[2/3] shrink-0">
        {film.poster ? (
          <img
            src={film.poster}
            alt={film.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full kalmus-help flex items-center justify-center">
            No poster
          </div>
        )}
      </div>

      <div className="flex flex-col justify-between flex-1 min-w-0">
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
            {metadataParts.length > 0 && (
              <span>({metadataParts.join(", ")})</span>
            )}
          </div>
        </div>

        <div>
          {film.analyses.map((a) => (
            <Link
              key={a.job_id}
              href={`/results/${a.job_id}`}
              aria-label={`View result for ${film.title}`}
              className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] items-start sm:items-center gap-2 sm:gap-4 border-b-2 border-transparent py-2 sm:py-1 hover:border-blue-500"
            >
              <div className="flex items-center gap-1 font-mono text-xs kalmus-text-secondary capitalize">
                <span>{a.barcode_type}</span>
                <span style={{ color: "var(--accent-crimson)" }}>|</span>
                <span>{a.frame_type.replace(/_/g, " ")}</span>
                <span style={{ color: "var(--accent-crimson)" }}>|</span>
                <span>{a.metric}</span>
              </div>
              <div className="flex items-center gap-1 font-mono text-xs kalmus-text-secondary">
                <span>Source File:</span>
                <span>
                  {a.source_width} x {a.source_height},
                </span>
                <span>{Number(a.source_fps).toFixed(3)} fps,</span>
                <span>{a.source_frame_count} frames</span>
              </div>
              <div
                className="justify-self-start sm:justify-self-end font-mono text-xs tracking-wider uppercase px-3 py-1.5 transition-colors kalmus-button-filled"
              >
                <span>View →</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// barcode mini preview feature ####################################
function FilmCardBarcode({ jobId }: { jobId: string }) {
  const [data, setData] = useState<FilmOfDayBarcode | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/job-result/${jobId}`);
        const json = await res.json();
        const barcode = json?.barcode?.barcode;
        const barcodeType = json?.barcode?.barcode_type || "Color";

        if (
          !cancelled &&
          Array.isArray(barcode) &&
          (barcodeType === "Color" || barcodeType === "Brightness")
        ) {
          setData({ barcode: barcode as BarcodePixel[][], barcodeType });
        }
      } catch {

      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (loading || !data) return null;

  return (
    <div style = {{ marginTop: 8,
      width: "100%",
      maxWidth: 200,
      height: 60, // ask prof Faden what he generally thinks about this height
      overflow: "hidden" }}>
      <BarcodeImagePreview data={data} fixed />
    </div>
  );
}


export default function AdminPage() {
  const helpRef = useRef<HTMLDivElement>(null);

  const [showHelp, setShowHelp] = useState(false);
  const [activeSelection, setActiveSelection] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FilmSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const [filmOfDayResults, setFilmOfDayResults] = useState<FilmSearchResult[]>(
    [],
  );
  const [filmOfDayBarcode, setFilmOfDayBarcode] =
    useState<FilmOfDayBarcode | null>(null);
  const [filmOfDayLoading, setFilmOfDayLoading] = useState(true);
  const [filmOfDayBarcodeLoading, setFilmOfDayBarcodeLoading] = useState(false);
  // admin state

  const [editingFilm, setEditingFilm] = useState<FilmRecord | null>(null);
  const [editLoading, setEditLoading] = useState<string | null>(null);

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

  //film of the day effects
  useEffect(() => {
    let cancelled = false;

    async function loadFilmOfDay() {
      try {
        const res = await fetch("/api/film-of-day");
        const data = await res.json();
        if (!cancelled) {
          setFilmOfDayResults(data.results || []);
        }
      } catch {
        if (!cancelled) {
          setFilmOfDayResults([]);
        }
      } finally {
        if (!cancelled) {
          setFilmOfDayLoading(false);
        }
      }
    }

    loadFilmOfDay();

    return () => {
      cancelled = true;
    };
  }, []);

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
          setFilmOfDayBarcode({
            barcode: barcode as BarcodePixel[][],
            barcodeType,
          });
        } else if (!cancelled) {
          setFilmOfDayBarcode(null);
        }
      } catch {
        if (!cancelled) {
          setFilmOfDayBarcode(null);
        }
      } finally {
        if (!cancelled) {
          setFilmOfDayBarcodeLoading(false);
        }
      }
    }

    loadFilmOfDayBarcode();

    return () => {
      cancelled = true;
    };
  }, [filmOfDayResults]);

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

  // admin: fetch film metadata for editing
  const handleEditClick = async (jobId: string) => {
    setEditLoading(jobId);
    try {
      const res = await fetch(`/api/edit-film/${jobId}`);
      if (!res.ok) throw new Error("Failed to load film metadata");
      const film: FilmRecord = await res.json();
      setEditingFilm(film);
    } catch (err) {
      console.error("Edit failed", err);
    } finally {
      setEditLoading(null);
    }
  };

  // admin: refresh after save/delete
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
      {/* film editor drawer */}
      {editingFilm && (
        <FilmEditor
          film={editingFilm}
          onClose={() => setEditingFilm(null)}
          onSaved={refreshResults}
          onDeleted={refreshResults}
        />
      )}

      {/* Top-right nav links */}
      <div className="fixed top-5 right-24 z-50">
        <Link
          href="/about?from=admin"
          className="font-mono text-xs tracking-[0.22em] uppercase kalmus-text-secondary hover:text-[var(--text-primary)] transition-colors"
        >
          About
        </Link>
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
                priority
              />
            </div>

            { }
            <div className="mb-2">
              <span
                className="font-mono text-xs tracking-[0.35em] uppercase"
                style={{ color: "var(--accent-amber)" }}
              >
                Admin
              </span>
            </div>

            <p className="font-mono text-xs tracking-[0.28em] uppercase kalmus-text-secondary">
              Edit film metadata and manage records
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

                {/* Help button */}
                <div
                  ref={helpRef}
                  className="absolute right-3 flex items-center kalmus-input transition-colors"
                >
                  <button
                    onClick={() => setShowHelp((v) => !v)}
                    aria-label="Search help"
                    aria-expanded={showHelp}
                    className="w-5 h-5 rounded-full text-xs flex items-center justify-center
                              border hover:text-gray-600 hover:border-gray-600
                              transition-colors cursor-pointer"
                  >
                    ?
                  </button>

                  {showHelp && (
                    <div
                      className="absolute top-full right-0 mt-2 w-80 z-50 rounded-xl
                                    border border-gray-200 p-4 shadow-sm text-xs font-mono kalmus-help transition-colors"
                    >
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

          {/* Selection Buttons */}
          <div className="mb-4 flex flex-wrap justify-center gap-[0.25]">
            {/* A-Z buttons */}
            {Array.from({ length: 26 }, (_, i) =>
              String.fromCharCode(65 + i)
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

            {/* Numbers */}
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

            {/* Symbols */}
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

            {/* Random */}
            <button
              onClick={() => {
                setActiveSelection(null); // Force requery
                setTimeout(() => {
                  setActiveSelection("random");
                }, 0);
                setQuery("");
              }}
              className="px-2 py-1 border rounded text-sm font-mono transition-colors hover:bg-[var(--surface-hover)]"
              style={getSelectionButtonStyle(activeSelection === "random")}
            >
              Surprise Me!
            </button>
          </div>

          {/* Upload CTA */}
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
                <FilmResultCard film={filmOfDay} />
              </div>
              {!filmOfDayBarcodeLoading && filmOfDayBarcode && (
                <BarcodeImagePreview data = {filmOfDayBarcode} />
              )}
            </section>
          )}

          {/* Results */}
          {searched && !loading && (
            <>
              {grouped.length > 0 ? (
                <div>
                  <p className="font-mono text-xs tracking-[0.35em] uppercase kalmus-text-secondary mb-4">
                    ▸ {results.length} record{results.length !== 1 ? "s" : ""} retrieved
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
                      <div
                        key={`${film.title}::${film.imdb_id ?? ""}`}
                        className="py-5 flex gap-5 group"
                        style={{
                          borderBottomWidth: 1,
                          borderBottomColor: "rgba(100,100,100,0.25)",
                        }}
                      >
                        {/* Poster */}
                        <div className="w-[80px] aspect-[2/3] shrink-0 self-start">
                          {film.poster ? (
                            <img
                              src={film.poster}
                              alt={film.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full kalmus-help flex items-center justify-center">
                              No poster
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex flex-col justify-between flex-1 min-w-0 overflow-hidden">
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
                                const format = (val: string | null) =>
                                  val ? val.split(",").join(" & ") : null;

                                const parts = [
                                  format(film.director),
                                  film.released &&
                                    new Date(film.released).getFullYear(),
                                  film.runtime_minutes &&
                                    `${Math.floor(Number(film.runtime_minutes) / 60)}h${Number(film.runtime_minutes) % 60}m`,
                                  format(film.country),
                                ].filter(Boolean);

                                return (
                                  parts.length > 0 && (
                                    <span>({parts.join(", ")})</span>
                                  )
                                );
                              })()}
                            </div>
                          </div>

                          {/* Mini barcode preview */}
                          <FilmCardBarcode jobId={film.analyses[0].job_id} />

                          {/* Analyses summary */}
                          <div>
                            {film.analyses.map((a) => (
                              <div
                                key={a.job_id}
                                className="flex items-center gap-2"
                              >
                                <Link
                                  href={`/results/${a.job_id}?from=admin`}
                                  className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] items-start sm:items-center gap-2 sm:gap-4 border-b-2 border-transparent py-2 sm:py-1 hover:border-blue-500 flex-1"
                                  style={{ color: "var(--accent-amber)" }}
                                >
                                  <div className="flex items-center gap-1 font-mono text-xs kalmus-text-secondary capitalize">
                                    <span>{a.barcode_type}</span>
                                    <span
                                      style={{ color: "var(--accent-crimson)" }}
                                    >
                                      |
                                    </span>
                                    <span>{a.frame_type.replace(/_/g, " ")}</span>
                                    <span
                                      style={{ color: "var(--accent-crimson)" }}
                                    >
                                      |
                                    </span>
                                    <span>{a.metric}</span>
                                  </div>
                                  <div className="flex items-center gap-1 font-mono text-xs kalmus-text-secondary">
                                    <span>Source File:</span>
                                    <span>
                                      {a.source_width} x {a.source_height},
                                    </span>
                                    <span>{Number(a.source_fps).toFixed(3)} fps,</span>
                                    <span>{a.source_frame_count} frames</span>
                                  </div>
                                  <div className="justify-self-start sm:justify-self-end font-mono text-xs tracking-wider uppercase px-3 py-1.5 transition-colors kalmus-button-filled">
                                    <span>View →</span>
                                  </div>
                                </Link>

                                {/* edit button */}
                                <button
                                  onClick={() => handleEditClick(a.job_id)}
                                  className="font-mono text-xs tracking-wider uppercase transition-all flex items-center gap-1 shrink-0"
                                  style={{
                                    padding: "4px 10px",
                                    background: "transparent",
                                    color: "var(--text-muted)",
                                    cursor: "pointer",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = "var(--accent-amber)";
                                    e.currentTarget.style.color = "var(--accent-amber)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = "var(--surface-border)";
                                    e.currentTarget.style.color = "var(--text-muted)";
                                  }}
                                >
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                                  </svg>
                                    Edit
                                </button>
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
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.opacity = "0.85")
                    }
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
