"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import InteractiveHistogram from "./InteractiveHistogram";
import InteractiveRGBCube from "./InteractiveRGBCube";
import InteractiveHueLightScatter from "./InteractiveHueLightScatter";
import InteractiveHueLight3DBar from "./InteractiveHueLight3DBar";
import FramesScatter from "./FramesScatter";
import BarcodeComparison from "./BarcodeComparison";
import ColorStatsDashboard from "./ColorStatsDashboard";
import CSVExportButton from "./CSVExportButton";
import BarcodePreview, { type BarcodePreviewMovie } from "./BarcodePreview";
import {
  buildPreviewFromFrameIndex,
  type BarcodePreviewData,
  RGB,
  BarcodeData,
  ThumbnailManifest,
  formatTimestamp,
  rgbToHsl,
} from "@/lib/barcode-utils";
// import { clearTimeout } from "node:timers";

interface FilmSearchResult {
  job_id: string;
  title: string;
  imdb_id: string | null;
  poster: string | null;
  director: string | null;
  runtime_minutes: string | number | null;
  country: string | null;
  released: string | null;
  barcode_type: string;
  frame_type: string;
  metric: string;
  process_date: string;
  source_width: string;
  source_height: string;
  source_fps: string;
  source_frame_count: string;
}

interface VisualizationMovieMetadata {
  title: string;
  year?: string;
  genre?: string;
  director?: string;
  poster_url?: string;
  raw?: {
    Runtime?: string;
    Country?: string;
    Director?: string;
  };
}

function formatRuntime(runtime: string | number | null | undefined): string | null {
  if (!runtime) return null;

  const totalMinutes =
    typeof runtime === "number"
      ? runtime
      : parseInt(runtime.match(/(\d+)/)?.[1] ?? "", 10);

  if (!Number.isFinite(totalMinutes)) {
    return typeof runtime === "string" ? runtime : null;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${minutes}m`;
}

function normalizeAnalysisLabel(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  return normalized
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMovieDetailLine(
  movie: VisualizationMovieMetadata | null | undefined
): string | null {
  if (!movie) return null;

  const parts = [
    movie.director || movie.raw?.Director,
    movie.year,
    formatRuntime(movie.raw?.Runtime),
    movie.raw?.Country,
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? `(${parts.join(", ")})` : null;
}

function formatAnalysisDetailLine(
  barcodeType: string | null | undefined,
  frameType: string | null | undefined,
  metric: string | null | undefined
): string | null {
  const parts = [
    normalizeAnalysisLabel(barcodeType),
    normalizeAnalysisLabel(frameType),
    normalizeAnalysisLabel(metric),
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" | ") : null;
}

function formatSourceDetailLine(
  width: number | string | null | undefined,
  height: number | string | null | undefined,
  fps: number | string | null | undefined,
  frameCount: number | string | null | undefined
): string | null {
  const parsedWidth = typeof width === "string" ? parseInt(width, 10) : width;
  const parsedHeight = typeof height === "string" ? parseInt(height, 10) : height;
  const parsedFps = typeof fps === "string" ? parseFloat(fps) : fps;
  const parsedFrameCount =
    typeof frameCount === "string" ? parseInt(frameCount, 10) : frameCount;

  const sourceParts: string[] = [];

  if (
    typeof parsedWidth === "number" &&
    !Number.isNaN(parsedWidth) &&
    typeof parsedHeight === "number" &&
    !Number.isNaN(parsedHeight)
  ) {
    sourceParts.push(`${parsedWidth.toLocaleString()} x ${parsedHeight.toLocaleString()}`);
  }

  if (typeof parsedFps === "number" && !Number.isNaN(parsedFps)) {
    sourceParts.push(`${parsedFps.toFixed(3)} fps`);
  }

  if (typeof parsedFrameCount === "number" && !Number.isNaN(parsedFrameCount)) {
    sourceParts.push(`${parsedFrameCount.toLocaleString()} frames`);
  }

  return sourceParts.length > 0 ? `Source File: ${sourceParts.join(", ")}` : null;
}

function buildPreviewMovie(
  movie: VisualizationMovieMetadata | null | undefined
): BarcodePreviewMovie | null {
  if (!movie?.title) return null;

  return {
    title: movie.title,
    year: movie.year,
    posterUrl: movie.poster_url || null,
    metadata: [movie.genre, movie.director ? `Dir. ${movie.director}` : null].filter(
      (value): value is string => Boolean(value)
    ),
  };
}

function formatRgbValue(rgb: RGB): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function formatHslValue(rgb: RGB): string {
  const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  return `hsl(${Math.round(hsl[0])}°, ${Math.round(hsl[1] * 100)}%, ${Math.round(hsl[2] * 100)}%)`;
}

function formatHexValue(rgb: RGB): string {
  return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load thumbnail sheet"));
    image.src = url;
  });
}

function drawExportText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: {
    color: string;
    size: number;
    tracking?: number;
    uppercase?: boolean;
  }
) {
  const output = options.uppercase ? text.toUpperCase() : text;
  context.fillStyle = options.color;
  context.font = `${options.size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  context.textBaseline = "top";

  if (!options.tracking) {
    context.fillText(output, x, y);
    return;
  }

  let currentX = x;
  for (const character of output) {
    context.fillText(character, currentX, y);
    currentX += context.measureText(character).width + options.tracking;
  }
}

function drawClippedExportText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  options: {
    color: string;
    size: number;
  }
) {
  context.save();
  context.beginPath();
  context.rect(x, y, Math.max(0, maxWidth), options.size + 3);
  context.clip();
  drawExportText(context, text, x, y, options);
  context.restore();
}

async function exportPinnedFramePreview(preview: BarcodePreviewData): Promise<void> {
  if (!preview.sheet.url) {
    throw new Error("Thumbnail sheet is unavailable");
  }

  const sheetImage = await loadImage(preview.sheet.url);
  const frameLabel = `Frame ${preview.thumbnail.frame_index.toLocaleString()}`;
  const timeLabel = formatTimestamp(preview.thumbnail.time_seconds);
  const hoveredPixel = formatRgbValue(preview.rgb);
  const hoveredPixelHsl = formatHslValue(preview.rgb);
  const columnAverage = formatRgbValue(preview.avgRgb);
  const columnAverageHsl = formatHslValue(preview.avgRgb);
  const columnAverageHex = formatHexValue(preview.avgRgb);

  const metadataHeight = 58;
  const canvas = document.createElement("canvas");
  canvas.width = preview.thumbnail.width;
  canvas.height = preview.thumbnail.height + metadataHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas export is unavailable");
  }

  context.fillStyle = "#111111";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.drawImage(
    sheetImage,
    preview.thumbnail.x,
    preview.thumbnail.y,
    preview.thumbnail.width,
    preview.thumbnail.height,
    0,
    0,
    preview.thumbnail.width,
    preview.thumbnail.height
  );

  const metadataTop = preview.thumbnail.height;
  context.fillStyle = "#4a4946";
  context.fillRect(0, metadataTop, canvas.width, metadataHeight);

  const inset = Math.max(10, Math.round(canvas.width * 0.035));
  const contentTop = metadataTop + 11;
  drawExportText(context, frameLabel, inset, contentTop, {
    color: "#bcb6ad",
    size: 7,
    tracking: 1.9,
    uppercase: true,
  });
  drawExportText(context, timeLabel, inset, contentTop + 18, {
    color: "#f4f1eb",
    size: 9,
  });

  const swatchSize = 15;
  const colorX = Math.max(inset + 84, Math.round(canvas.width * 0.27));
  context.fillStyle = hoveredPixel;
  context.fillRect(colorX, contentTop + 13, swatchSize, swatchSize);
  context.strokeStyle = "rgba(255, 255, 255, 0.22)";
  context.strokeRect(colorX + 0.5, contentTop + 13.5, swatchSize - 1, swatchSize - 1);

  const colorTextX = colorX + swatchSize + 10;
  drawExportText(context, "Hovered pixel", colorTextX, contentTop, {
    color: "#bcb6ad",
    size: 7,
    tracking: 1.7,
    uppercase: true,
  });
  drawExportText(context, hoveredPixel, colorTextX, contentTop + 14, {
    color: "#f4f1eb",
    size: 8,
  });
  const averageLabel = "Avg";
  const averageTextWidth = 42;
  const averageTextX = canvas.width - inset - averageTextWidth;
  const averageX = averageTextX - swatchSize - 8;
  const colorLineMaxWidth = Math.max(0, averageX - 12 - colorTextX);
  drawClippedExportText(
    context,
    hoveredPixelHsl,
    colorTextX,
    contentTop + 27,
    colorLineMaxWidth,
    {
      color: "#c8c2b8",
      size: 7,
    }
  );

  if (averageX > colorTextX + 48) {
    context.fillStyle = columnAverage;
    context.fillRect(averageX, contentTop + 13, swatchSize, swatchSize);
    context.strokeStyle = "rgba(255, 255, 255, 0.22)";
    context.strokeRect(averageX + 0.5, contentTop + 13.5, swatchSize - 1, swatchSize - 1);

    drawExportText(context, averageLabel, averageTextX, contentTop, {
      color: "#bcb6ad",
      size: 7,
      tracking: 1.4,
      uppercase: true,
    });
    drawClippedExportText(
      context,
      columnAverageHex,
      averageTextX,
      contentTop + 14,
      averageTextWidth,
      {
        color: "#f4f1eb",
        size: 8,
      }
    );
    drawClippedExportText(
      context,
      columnAverageHsl,
      averageTextX,
      contentTop + 27,
      averageTextWidth,
      {
        color: "#f4f1eb",
        size: 7,
      }
    );
  }

  context.strokeStyle = "rgba(255, 255, 255, 0.18)";
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) {
        resolve(result);
        return;
      }
      reject(new Error("Unable to create PNG export"));
    }, "image/png");
  });

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const framePart = sanitizeFilenamePart(`frame-${preview.thumbnail.frame_index}`);
  link.href = objectUrl;
  link.download = `kalmus-${framePart || "pinned-frame"}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function buildFilmSearchPreviewMovie(result: FilmSearchResult): BarcodePreviewMovie {
  return {
    title: result.title,
    year: result.released ? result.released.slice(0, 4) : undefined,
    posterUrl: result.poster,
    metadata: [
      result.director ? `Dir. ${result.director}` : null,
      formatRuntime(result.runtime_minutes),
      result.country,
    ].filter((value): value is string => Boolean(value)),
  };
}

function buildFilmSearchDetailLines(result: FilmSearchResult): string[] {
  return [
    [
      result.director,
      result.released ? result.released.slice(0, 4) : null,
      formatRuntime(result.runtime_minutes),
      result.country,
    ]
      .filter((value): value is string => Boolean(value))
      .join(", "),
    formatAnalysisDetailLine(result.barcode_type, result.frame_type, result.metric),
    formatSourceDetailLine(
      result.source_width,
      result.source_height,
      result.source_fps,
      result.source_frame_count
    ),
  ]
    .map((line, index) => (index === 0 && line ? `(${line})` : line))
    .filter((value): value is string => Boolean(value));
}

function StaticPreviewPanel({
  preview,
  pinned,
  minimized,
  onToggleMinimized,
  onClearPin,
}: {
  preview: BarcodePreviewData | null;
  pinned: boolean;
  minimized: boolean;
  onToggleMinimized: () => void;
  onClearPin: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const previewHeight = preview?.thumbnail.height ?? 200;
  const frameLabel = preview
    ? `Frame ${preview.thumbnail.frame_index.toLocaleString()}`
    : "No thumbnail selected";
  const timeLabel = preview ? formatTimestamp(preview.thumbnail.time_seconds) : "";
  const canExport = pinned && preview;

  const handleExport = async () => {
    if (!preview || exporting) return;

    setExporting(true);
    setExportError(null);
    try {
      await exportPinnedFramePreview(preview);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Unable to export pinned frame");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="panel-bg border border-[var(--surface-border)] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-[var(--surface-border)] bg-[var(--surface-bg-strong)]">
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-[0.24em] uppercase kalmus-text-secondary">
            Frame Thumbnail
          </p>
          <p className="font-mono text-xs kalmus-text-primary truncate mt-0.5">
            {minimized
              ? [frameLabel, timeLabel].filter(Boolean).join(" | ")
              : "Hover the barcode or a plot to inspect a matching captured frame."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canExport && (
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="px-2.5 py-1 font-mono text-xs tracking-[0.18em] uppercase transition-colors border border-[var(--input-border)] hover:border-[var(--accent-amber)] hover:text-[var(--text-primary)] disabled:cursor-wait disabled:opacity-60"
            >
              {exporting ? "Exporting" : "Export"}
            </button>
          )}
          {pinned && preview && (
            <button
              type="button"
              onClick={onClearPin}
              className="px-2.5 py-1 font-mono text-xs tracking-[0.18em] uppercase transition-colors border border-[var(--input-border)] hover:border-[var(--accent-amber)] hover:text-[var(--text-primary)]"
            >
              Release
            </button>
          )}
          <button
            type="button"
            onClick={onToggleMinimized}
            className="px-2.5 py-1 font-mono text-xs tracking-[0.18em] uppercase transition-colors border border-[var(--input-border)] hover:border-[var(--accent-amber)] hover:text-[var(--text-primary)]"
            aria-expanded={!minimized}
          >
            {minimized ? "Show" : "Minimize"}
          </button>
        </div>
      </div>

      {minimized ? null : (
      <div
        className="grid gap-4 p-4 lg:grid-cols-[minmax(260px,1.2fr)_minmax(240px,0.8fr)]"
        style={{ minHeight: `${previewHeight + 32}px` }}
      >
        <div
          className="overflow-auto border border-[var(--surface-border)] bg-[var(--surface-bg-strong)] flex items-center justify-center"
          style={{ minHeight: `${previewHeight}px` }}
        >
          {preview?.sheet.url ? (
            <div
              style={{
                width: preview.thumbnail.width,
                height: preview.thumbnail.height,
                backgroundImage: `url(${preview.sheet.url})`,
                backgroundPosition: `-${preview.thumbnail.x}px -${preview.thumbnail.y}px`,
                backgroundRepeat: "no-repeat",
                backgroundSize: `${preview.sheet.width}px ${preview.sheet.height}px`,
              }}
            />
          ) : (
            <p className="font-mono text-xs kalmus-text-secondary text-center px-4">
              Hover the barcode or a plot to preview a thumbnail here.
            </p>
          )}
        </div>

        <div className="space-y-4" style={{ minHeight: `${previewHeight}px` }}>
          <div className="flex items-start justify-between gap-3 min-h-[40px]">
            <div>
              <div className="font-mono text-xs tracking-[0.16em] uppercase kalmus-text-secondary">
                {frameLabel}
              </div>
              <div className="font-mono text-xs kalmus-text-primary mt-1">
                {timeLabel || " "}
              </div>
            </div>
            {pinned && preview && (
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs tracking-[0.18em] uppercase px-2 py-0.5 border border-[var(--accent-amber)] text-[var(--accent-amber)]">
                  Pinned
                </span>
              </div>
            )}
          </div>

          {exportError && (
            <p className="font-mono text-xs text-red-400">
              {exportError}
            </p>
          )}

          <div className="grid gap-3">
            <MetricRow
              label="Hovered pixel"
              swatch={
                preview
                  ? `rgb(${preview.rgb[0]}, ${preview.rgb[1]}, ${preview.rgb[2]})`
                  : "transparent"
              }
              value={
                preview
                  ? formatRgbValue(preview.rgb)
                  : "Awaiting hover"
              }
              subValue={preview ? formatHslValue(preview.rgb) : undefined}
            />
            <MetricRow
              label="Column average"
              swatch={
                preview
                  ? `rgb(${preview.avgRgb[0]}, ${preview.avgRgb[1]}, ${preview.avgRgb[2]})`
                  : "transparent"
              }
              value={
                preview
                  ? formatRgbValue(preview.avgRgb)
                  : "Awaiting hover"
              }
              subValue={preview ? formatHslValue(preview.avgRgb) : undefined}
            />
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

function MetricRow({
  label,
  swatch,
  value,
  subValue,
}: {
  label: string;
  swatch: string;
  value: string;
  subValue?: string;
}) {
  return (
    <div className="flex items-center gap-3 border border-[var(--surface-border)] bg-[var(--surface-bg-strong)] px-3 py-2">
      <div
        className="h-8 w-8 shrink-0 border border-[rgba(255,255,255,0.12)]"
        style={{ background: swatch }}
      />
      <div className="min-w-0">
        <div className="font-mono text-xs tracking-[0.18em] uppercase kalmus-text-secondary">
          {label}
        </div>
        <div className="font-mono text-xs kalmus-text-primary mt-1 truncate">
          {value}
        </div>
        {subValue && (
          <div className="font-mono text-xs kalmus-text-primary mt-0.5 truncate">
            {subValue}
          </div>
        )}
      </div>
    </div>
  );
}

interface VisualizationPanelProps {
  jobId: string;
  videoFilename?: string;
  compareJobId?: string;
  movie?: VisualizationMovieMetadata | null;
}

type VisualizationTab =
  | "histogram"
  | "colorcube"
  | "huelightscatter"
  | "huelight3d"
  |  "framesscatter"
  | "stats"
  | "comparison";

interface LoadedBarcodeData {
  colors?: RGB[];
  brightness?: number[];
  barcode_type: "Color" | "Brightness";
  sampled_frame_rate: number;
  skip_over: number;
  color_metric?: string;
  frame_type?: string;
  total_frames?: number;
  fps?: number;
  source_width?: number;
  source_height?: number;
  barcodeImageUrl?: string;
  barcodeImage?: RGB[][] | number[][];
  thumbnails?: ThumbnailManifest | null;
}

function FilmSearch({
  currentJobId,
  compareJobId,
  onSelect,
  onClear,
}: {
  currentJobId: string;
  compareJobId: string | null;
  onSelect: (
    job_id: string,
    title: string,
    movie: BarcodePreviewMovie,
    detailLines: string[]
  ) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FilmSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    fetch(`/api/search-films?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results || []);
        setOpen(true);
      })
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 300);
  };

  const handleSelect = (r: FilmSearchResult) => {
    setQuery(r.title);
    setOpen(false);
    onSelect(
      r.job_id,
      r.title,
      buildFilmSearchPreviewMovie(r),
      buildFilmSearchDetailLines(r)
    );
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    onClear();
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="block font-mono text-xs tracking-[0.3em] uppercase kalmus-text-secondary mb-2">
        Compare with a film
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={handleChange}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search films in database…"
            className="kalmus-input w-full px-3 py-2 font-mono text-xs focus:outline-none"
            style={{ borderRadius: 0 }}
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <svg className="animate-spin h-4 w-4 kalmus-text-muted" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}
        </div>
        {compareJobId && (
          <button
            onClick={handleClear}
            className="px-3 py-2 font-mono text-xs transition-all hover:opacity-80 hover:scale-[1.02]"
            style={{ border: '1px solid var(--input-border)', color: 'var(--accent-crimson)', background: 'transparent', borderRadius: 0 }}
            title="Clear comparison"
          >
            ✕
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto" style={{ background: 'var(--panel-gradient)', border: '1px solid var(--input-border)' }}>
          {results.map((r) => (
            <button
              key={r.job_id}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-4 py-3 transition-colors"
              style={{ borderBottom: '1px solid var(--surface-border)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs kalmus-text-primary truncate">
                  {r.title}
                </span>
                <span className="font-mono text-xs kalmus-text-secondary shrink-0">
                  {r.released ? r.released.slice(0, 4) : ""}
                </span>
              </div>
              <div className="flex gap-2 mt-0.5">
                <span className="font-mono text-xs kalmus-text-secondary">{r.barcode_type}</span>
                <span style={{ color: 'var(--accent-crimson)' }}>·</span>
                <span className="font-mono text-xs kalmus-text-secondary">{r.frame_type}</span>
                {r.job_id === currentJobId && (
                  <>
                    <span style={{ color: 'var(--accent-crimson)' }}>·</span>
                    <span className="font-mono text-xs kalmus-text-secondary">Current</span>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {open && results.length === 0 && !searching && query.trim() && (
        <div className="absolute z-50 mt-1 w-full px-4 py-3" style={{ background: 'var(--panel-gradient)', border: '1px solid var(--input-border)' }}>
          <p className="font-mono text-xs kalmus-text-secondary">No films found.</p>
        </div>
      )}
    </div>
  );
}

export default function VisualizationPanel({
  jobId,
  videoFilename = "Video",
  compareJobId: initialCompareJobId,
  movie = null,
}: VisualizationPanelProps) {
  const [activeTab, setActiveTab] = useState<VisualizationTab>("histogram");
  const [barcodeData, setBarcodeData] = useState<LoadedBarcodeData | null>(null);
  const [frameRange, setFrameRange] = useState<[number, number] | null>(null);
  const [comparePrimaryRange, setComparePrimaryRange] = useState<[number, number] | null>(null);
  const [compareSecondaryRange, setCompareSecondaryRange] = useState<[number, number] | null>(null);
  const [previewData, setPreviewData] = useState<BarcodePreviewData | null>(null);
  const [previewPinned, setPreviewPinned] = useState(false);
  const [thumbnailViewerMinimized, setThumbnailViewerMinimized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [compareJobId, setCompareJobId] = useState<string | null>(initialCompareJobId || null);
  const [compareTitle, setCompareTitle] = useState<string>("");
  const [compareMovie, setCompareMovie] = useState<BarcodePreviewMovie | null>(null);
  const [compareDetailLines, setCompareDetailLines] = useState<string[]>([]);
  const [compareData, setCompareData] = useState<LoadedBarcodeData | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const previewMovie = useMemo(() => buildPreviewMovie(movie), [movie]);
  const previewDetailLines = useMemo(
    () =>
      [
        formatMovieDetailLine(movie),
        formatAnalysisDetailLine(
          barcodeData?.barcode_type,
          barcodeData?.frame_type,
          barcodeData?.color_metric
        ),
        formatSourceDetailLine(
          barcodeData?.source_width,
          barcodeData?.source_height,
          barcodeData?.fps,
          barcodeData?.total_frames
        ),
      ].filter((value): value is string => Boolean(value)),
    [barcodeData?.barcode_type, barcodeData?.color_metric, barcodeData?.fps, barcodeData?.frame_type, barcodeData?.source_height, barcodeData?.source_width, barcodeData?.total_frames, movie]
  );

  const [debouncedFrameRange, setDebouncedFrameRange] = useState<[number, number] | null>(frameRange);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFrameRange(frameRange);
    }, 200);
    return () => clearTimeout(timer);
  }, [frameRange]);


  const loadBarcodeData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/job-result/${jobId}`);
      if (!response.ok) {
        throw new Error("Failed to load barcode data");
      }

      const data = await response.json();

      if (data.success && data.barcode) {
        const barcode = data.barcode;
        setBarcodeData({
          colors: barcode.colors as RGB[],
          brightness: barcode.brightness,
          barcode_type: barcode.barcode_type || "Color",
          sampled_frame_rate: barcode.sampled_frame_rate || 1,
          skip_over: barcode.skip_over || 0,
          color_metric: barcode.color_metric || barcode.metric,
          frame_type: barcode.frame_type,
          total_frames: barcode.total_frames,
          fps: barcode.fps,
          source_width:
            typeof barcode.high_bound_hor === "number" && typeof barcode.low_bound_hor === "number"
              ? barcode.high_bound_hor - barcode.low_bound_hor
              : undefined,
          source_height:
            typeof barcode.high_bound_ver === "number" && typeof barcode.low_bound_ver === "number"
              ? barcode.high_bound_ver - barcode.low_bound_ver
              : undefined,
          barcodeImage: barcode.barcode as RGB[][] | number[][],
          thumbnails: data.thumbnails,
        });
      } else {
        throw new Error("Invalid barcode data");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    loadBarcodeData();
  }, [loadBarcodeData]);

  const loadCompareData = async (cJobId: string) => {
    setCompareLoading(true);
    setCompareData(null);
    try {
      const res = await fetch(`/api/job-result/${cJobId}`);
      if (!res.ok) throw new Error("Failed to load comparison barcode");
      const data = await res.json();
      if (data.success && data.barcode) {
        const b = data.barcode;
        setCompareData({
          colors: b.colors as RGB[],
          brightness: b.brightness,
          barcode_type: b.barcode_type || "Color",
          sampled_frame_rate: b.sampled_frame_rate || 1,
          skip_over: b.skip_over || 0,
          color_metric: b.color_metric || b.metric,
          frame_type: b.frame_type,
          total_frames: b.total_frames,
          fps: b.fps,
          source_width:
            typeof b.high_bound_hor === "number" && typeof b.low_bound_hor === "number"
              ? b.high_bound_hor - b.low_bound_hor
              : undefined,
          source_height:
            typeof b.high_bound_ver === "number" && typeof b.low_bound_ver === "number"
              ? b.high_bound_ver - b.low_bound_ver
              : undefined,
          barcodeImage: b.barcode as RGB[][] | number[][],
          thumbnails: data.thumbnails,
        });
      }
    } catch {
      // compareData stays null
    } finally {
      setCompareLoading(false);
    }
  };

  const isColorBarcode = barcodeData?.barcode_type === "Color";
  const totalColorFrames =
    barcodeData?.barcode_type === "Color"
      ? barcodeData.colors?.length ?? 0
      : barcodeData?.brightness?.length ?? 0;
  const compareTotalColorFrames =
    compareData?.barcode_type === "Color"
      ? compareData.colors?.length ?? 0
      : compareData?.brightness?.length ?? 0;

  useEffect(() => {
    if (totalColorFrames > 0) {
      setFrameRange([0, totalColorFrames - 1]);
      return;
    }
    setFrameRange(null);
  }, [jobId, totalColorFrames]);

  useEffect(() => {
    if (totalColorFrames > 0) {
      setComparePrimaryRange([0, totalColorFrames - 1]);
      return;
    }
    setComparePrimaryRange(null);
  }, [jobId, totalColorFrames]);

  useEffect(() => {
    if (compareTotalColorFrames > 0) {
      setCompareSecondaryRange([0, compareTotalColorFrames - 1]);
      return;
    }
    setCompareSecondaryRange(null);
  }, [compareJobId, compareTotalColorFrames]);

  useEffect(() => {
    setPreviewData(null);
    setPreviewPinned(false);
  }, [jobId]);

  const slicedColors = useMemo(() => {
    if (!barcodeData?.colors) return undefined;
    if (!frameRange) return barcodeData.colors;
    return barcodeData.colors.slice(frameRange[0], frameRange[1] + 1);
  }, [barcodeData?.colors, frameRange]);

  const debouncedSlicedColors = useMemo(() => {
    if (!barcodeData?.colors) return undefined;
    if (!debouncedFrameRange) return barcodeData.colors;
    return barcodeData.colors.slice(debouncedFrameRange[0], debouncedFrameRange[1] + 1);
  }, [barcodeData?.colors, debouncedFrameRange]);

  const slicedBrightness = useMemo(() => {
    if (!barcodeData?.brightness) return undefined;
    if (!frameRange) return barcodeData.brightness;
    return barcodeData.brightness.slice(frameRange[0], frameRange[1] + 1);
  }, [barcodeData?.brightness, frameRange]);

  const tabs: Array<{ id: VisualizationTab; label: string; icon: string; colorOnly?: boolean }> = [
    { id: "histogram", label: isColorBarcode ? "Hue Histogram" : "Brightness Histogram", icon: "M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" },
    // { id: "colorcube", label: "RGB Cube", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4", colorOnly: true },
    { id: "huelightscatter", label: "Hue/Light Scatter", icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", colorOnly: true },
    { id: "huelight3d", label: "Hue/Light 3D", icon: "M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5", colorOnly: true },
    { id: "framesscatter", label: "Frames Scatter", icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4z", colorOnly: true },  // ← new
    { id: "stats", label: "Statistics", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
    { id: "comparison", label: "Compare", icon: "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" },
  ];

  const availableTabs = tabs.filter((tab) => !tab.colorOnly || isColorBarcode);

  const handlePreviewChange = useCallback((preview: BarcodePreviewData | null) => {
    setPreviewData((current) => (previewPinned ? current : preview));
  }, [previewPinned]);

  const handlePreviewPin = useCallback((preview: BarcodePreviewData) => {
    setPreviewData(preview);
    setPreviewPinned(true);
  }, []);

  const handlePreviewFrameChange = useCallback((frameIndex: number | null) => {
    if (!barcodeData?.barcodeImage || frameIndex === null) {
      setPreviewData((current) => (previewPinned ? current : null));
      return;
    }

    const preview = buildPreviewFromFrameIndex({
      barcode: barcodeData.barcodeImage,
      barcodeType: barcodeData.barcode_type,
      thumbnails: barcodeData.thumbnails,
      frameIndex,
      sampledFrameRate: barcodeData.sampled_frame_rate,
      skipOver: barcodeData.skip_over,
    });

    setPreviewData((current) => (previewPinned ? current : preview));
  }, [barcodeData, previewPinned]);

  const handlePreviewFramePin = useCallback((frameIndex: number) => {
    if (!barcodeData?.barcodeImage) return;

    const preview = buildPreviewFromFrameIndex({
      barcode: barcodeData.barcodeImage,
      barcodeType: barcodeData.barcode_type,
      thumbnails: barcodeData.thumbnails,
      frameIndex,
      sampledFrameRate: barcodeData.sampled_frame_rate,
      skipOver: barcodeData.skip_over,
    });

    if (!preview) return;
    setPreviewData(preview);
    setPreviewPinned(true);
  }, [barcodeData]);

  const handleClearPreviewPin = useCallback(() => {
    setPreviewPinned(false);
    setPreviewData(null);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="panel-bg p-6" style={{ border: '1px solid var(--surface-border)' }}>
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3">
                <svg
                className="animate-spin h-5 w-5 kalmus-text-secondary"
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
              <span className="font-mono text-xs tracking-[0.18em] uppercase kalmus-text-secondary">
                Loading barcode data...
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="panel-bg p-6" style={{ border: '1px solid var(--accent-crimson)' }}>
          <div className="p-4 text-center kalmus-surface-strong">
            <p className="font-mono text-xs kalmus-text-secondary mb-3">{error}</p>
            <button
              onClick={loadBarcodeData}
              className="px-4 py-1.5 font-mono text-xs tracking-wider uppercase transition-all bg-[var(--accent-crimson)] text-[var(--background)] hover:brightness-110 hover:-translate-y-px hover:shadow-md"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barcode Preview (Collapsible) */}
      {barcodeData?.barcodeImage && activeTab !== "comparison" && (
        <BarcodePreview
          barcode={barcodeData.barcodeImage}
          barcodeType={barcodeData.barcode_type}
          movie={previewMovie}
          detailLines={previewDetailLines}
          fallbackTitle={videoFilename}
          downloadTitle={`${barcodeData.barcode_type} Barcode - ${videoFilename}`}
          headerActions={
            <CSVExportButton
              barcodeData={barcodeData as BarcodeData}
              jobId={jobId}
              title={`${barcodeData.barcode_type}_barcode_${videoFilename}`}
              iconOnly
            />
          }
          fps={barcodeData.fps}
          sampledFrameRate={barcodeData.sampled_frame_rate}
          skipOver={barcodeData.skip_over}
          totalFrames={barcodeData.total_frames}
          thumbnails={barcodeData.thumbnails}
          frameRange={frameRange ?? undefined}
          totalColorFrames={totalColorFrames}
          onFrameRangeChange={setFrameRange}
          onPreviewChange={handlePreviewChange}
          onPreviewPin={handlePreviewPin}
        />
      )}

      {barcodeData?.barcodeImage && activeTab !== "comparison" && (
        <StaticPreviewPanel
          preview={previewData}
          pinned={previewPinned}
          minimized={thumbnailViewerMinimized}
          onToggleMinimized={() => setThumbnailViewerMinimized((value) => !value)}
          onClearPin={handleClearPreviewPin}
        />
      )}

      {/* Tab Navigation */}
      <div className="panel-bg" style={{ border: '1px solid var(--surface-border)' }}>
        <div className="overflow-x-auto" style={{ borderBottom: '1px solid rgba(100,100,100,0.25)' }}>
          <nav className="flex min-w-max" aria-label="Tabs">
            {availableTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="group flex items-center gap-2 py-3 px-4 font-mono text-xs tracking-[0.15em] uppercase whitespace-nowrap transition-all border-b-2"
                style={{
                  borderBottomColor: activeTab === tab.id ? 'var(--accent-amber)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: activeTab === tab.id ? 'var(--surface-bg-strong)' : 'transparent',
                  boxShadow: activeTab === tab.id ? 'inset 0 -2px 0 var(--accent-amber)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.background = 'var(--surface-bg)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                    e.currentTarget.style.borderBottomColor = 'var(--accent-crimson)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                    e.currentTarget.style.borderBottomColor = 'transparent';
                  }
                }}
              >
                <svg
                  className="w-3.5 h-3.5 transition-transform group-hover:scale-110"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={tab.icon}
                  />
                </svg>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">

          {activeTab === "histogram" && barcodeData && (
            <InteractiveHistogram
              colors={debouncedSlicedColors}
              brightness={slicedBrightness}
              barcodeType={barcodeData.barcode_type}
              frameIndexOffset={frameRange?.[0] ?? 0}
              onPreviewFrameChange={handlePreviewFrameChange}
              onPreviewFramePin={handlePreviewFramePin}
              title={
                barcodeData.barcode_type === "Color"
                  ? `Hue Distribution - ${videoFilename}`
                  : `Brightness Distribution - ${videoFilename}`
              }
            />
          )}

          {/*{activeTab === "colorcube" && slicedColors && (*/}
          {/*  <InteractiveRGBCube*/}
          {/*    colors={slicedColors}*/}
          {/*    title={`RGB Color Cube - ${videoFilename}`}*/}
          {/*    maxSamples={20000}*/}
          {/*    frameIndexOffset={frameRange?.[0] ?? 0}*/}
          {/*    onPreviewFrameChange={handlePreviewFrameChange}*/}
          {/*    onPreviewFramePin={handlePreviewFramePin}*/}
          {/*  />*/}
          {/*)}*/}

          {activeTab === "huelightscatter" && debouncedSlicedColors && (
            <InteractiveHueLightScatter
              colors={debouncedSlicedColors}
              title={`Hue vs Lightness - ${videoFilename}`}
              maxSamples={20000}
              frameIndexOffset={frameRange?.[0] ?? 0}
              onPreviewFrameChange={handlePreviewFrameChange}
              onPreviewFramePin={handlePreviewFramePin}
            />
          )}

          {activeTab === "huelight3d" && debouncedSlicedColors && (
            <InteractiveHueLight3DBar
              colors={debouncedSlicedColors}
              title={`Hue/Light 3D Distribution - ${videoFilename}`}
              frameIndexOffset={frameRange?.[0] ?? 0}
              onPreviewFrameChange={handlePreviewFrameChange}
              onPreviewFramePin={handlePreviewFramePin}
            />
          )}

          {activeTab === "framesscatter" && barcodeData && debouncedSlicedColors && (
            <FramesScatter
              colors={debouncedSlicedColors}
              thumbnails={barcodeData.thumbnails}
              title={`Frames Scatter - ${videoFilename}`}
              frameIndexOffset={frameRange?.[0] ?? 0}
              sampledFrameRate={barcodeData.sampled_frame_rate}
              skipOver={barcodeData.skip_over}
            />
          )}

          {activeTab === "stats" && (
            <ColorStatsDashboard
              jobId={jobId}
              title={`Statistics for ${videoFilename}`}
              colors={debouncedSlicedColors}
            />
          )}

          {activeTab === "comparison" && barcodeData && (
            <div className="space-y-6">
              <FilmSearch
                currentJobId={jobId}
                compareJobId={compareJobId}
                onSelect={(job_id, title, selectedMovie, selectedDetailLines) => {
                  setCompareJobId(job_id);
                  setCompareTitle(title);
                  setCompareMovie(selectedMovie);
                  setCompareDetailLines(selectedDetailLines);
                  loadCompareData(job_id);
                }}
                onClear={() => {
                  setCompareJobId(null);
                  setCompareData(null);
                  setCompareTitle("");
                  setCompareMovie(null);
                  setCompareDetailLines([]);
                }}
              />

              {barcodeData.barcodeImage && (
                <BarcodePreview
                  barcode={barcodeData.barcodeImage}
                  barcodeType={barcodeData.barcode_type}
                  movie={previewMovie}
                  detailLines={previewDetailLines}
                  fallbackTitle={videoFilename}
                  downloadTitle={`${barcodeData.barcode_type} Barcode — ${videoFilename}`}
                  fps={barcodeData.fps}
                  sampledFrameRate={barcodeData.sampled_frame_rate}
                  skipOver={barcodeData.skip_over}
                  totalFrames={barcodeData.total_frames}
                  thumbnails={barcodeData.thumbnails}
                  frameRange={comparePrimaryRange ?? undefined}
                  totalColorFrames={totalColorFrames}
                  onFrameRangeChange={setComparePrimaryRange}
                />
              )}

              {compareLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-3">
                    <svg className="animate-spin h-4 w-4 kalmus-text-secondary" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="font-mono text-xs tracking-[0.15em] uppercase kalmus-text-secondary">Loading comparison barcode...</span>
                  </div>
                </div>
              )}

              {!compareLoading && compareData?.barcodeImage && (
                <BarcodePreview
                  barcode={compareData.barcodeImage}
                  barcodeType={compareData.barcode_type}
                  movie={compareMovie}
                  detailLines={compareDetailLines}
                  fallbackTitle={compareTitle}
                  downloadTitle={`${compareData.barcode_type} Barcode — ${compareTitle}`}
                  fps={compareData.fps}
                  sampledFrameRate={compareData.sampled_frame_rate}
                  skipOver={compareData.skip_over}
                  totalFrames={compareData.total_frames}
                  thumbnails={compareData.thumbnails}
                  frameRange={compareSecondaryRange ?? undefined}
                  totalColorFrames={compareTotalColorFrames}
                  onFrameRangeChange={setCompareSecondaryRange}
                />
              )}

              {compareJobId && (
                <BarcodeComparison
                  jobId1={jobId}
                  jobId2={compareJobId}
                  title1={videoFilename}
                  title2={compareTitle}
                  range1={comparePrimaryRange}
                  range2={compareSecondaryRange}
                />
              )}

              {!compareJobId && (
                <p className="font-mono text-xs text-center kalmus-text-muted py-6 tracking-wider">
                  Search for a film above to compare barcodes side by side.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Info Panel
      <div className="p-4 kalmus-surface">
        <h4 className="font-mono text-xs tracking-[0.3em] uppercase kalmus-text-secondary mb-2">
          ▸ About These Visualizations
        </h4>
        <ul className="font-mono text-xs kalmus-text-secondary space-y-1">
          <li>
            <strong>Statistics:</strong> Overview of barcode metadata, dominant colors, and
            brightness distribution
          </li>
          <li>
            <strong>Histogram:</strong>{" "}
            {isColorBarcode
              ? "Distribution of color hues (0-360°) across all frames"
              : "Distribution of brightness values (0-255) across all frames"}
          </li>
          {isColorBarcode && (
            <>
              <li>
                <strong>RGB Cube:</strong> 3D scatter plot of RGB colors in the barcode (drag to
                rotate)
              </li>
              <li>
                <strong>Hue/Light Scatter:</strong> 2D scatter plot showing hue vs lightness
                distribution
              </li>
              <li>
                <strong>Hue/Light 3D:</strong> 3D visualization of color distribution with
                adjustable resolution and camera controls
              </li>
            </>
          )}
          <li>
            <strong>Compare:</strong> Side-by-side barcode comparison with similarity metrics
            (SSIM, NRMSE, cross-correlation, sequence alignment)
          </li>
          <li>
            <strong>Export CSV:</strong> Download per-frame color/brightness data with frame
            indices
          </li>
        </ul>
      </div> */}
    </div>
  );
}
