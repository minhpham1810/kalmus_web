"use client";

import { useState, useEffect, useCallback } from "react";

type FrameRange = [number, number];

interface ComparisonMetrics {
  nrmse: number;
  ssim: number;
  crossCorrelation: number;
  localCrossCorrelation: number;
  needlemanWunsch: number;
  smithWaterman: number;
}

// Output of film_compare.py's Report.to_dict(); null for brightness barcodes.
interface FilmReport {
  error?: string;
  overall?: number | null;
  sections?: Record<string, number | null>;
  metrics?: {
    key: string;
    label: string;
    section: string;
    score: number | null;
    summary: string;
  }[];
}

interface BarcodeComparisonProps {
  jobId1: string;
  jobId2: string;
  title1?: string;
  title2?: string;
  poster1?: string | null;
  poster2?: string | null;
  range1?: FrameRange | null;
  range2?: FrameRange | null;
}

// Score 0-100 -> hue 0 (red) to 120 (green)
const hue = (score: number) => Math.max(0, Math.min(100, score)) * 1.2;

// One row: label, percentage, and a bar that runs from red up to the score's own color
function ScoreRow({
  label,
  score,
  strong = false,
  title,
}: {
  label: string;
  score: number | null | undefined;
  strong?: boolean;
  title?: string;
}) {
  const s = score ?? null;
  return (
    <div className="grid grid-cols-[8rem_3rem_1fr] items-center gap-3" title={title}>
      <span
        className={
          strong
            ? "text-sm font-semibold uppercase tracking-wide kalmus-text-primary"
            : "text-xs kalmus-text-secondary"
        }
      >
        {label}
      </span>
      <span
        className={`text-right font-semibold ${strong ? "text-base" : "text-sm"} ${s == null ? "kalmus-text-muted" : ""}`}
        style={s == null ? undefined : { color: `hsl(${hue(s)} 75% 60%)` }}
      >
        {s == null ? "–" : `${s.toFixed(0)}%`}
      </span>
      <div className={strong ? "h-4" : "h-3"}>
        {s != null && (
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${Math.max(1, Math.min(100, s))}%`,
              background: `linear-gradient(to right, hsl(0 75% 40%), hsl(${hue(s)} 70% 45%))`,
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function BarcodeComparison({
  jobId1,
  jobId2,
  title1 = "Barcode 1",
  title2 = "Barcode 2",
  poster1 = null,
  poster2 = null,
  range1 = null,
  range2 = null,
}: BarcodeComparisonProps) {
  const [metrics, setMetrics] = useState<ComparisonMetrics | null>(null);
  const [film, setFilm] = useState<FilmReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadComparisonMetrics = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);

      try {
        const searchParams = new URLSearchParams({
          jobId1,
          jobId2,
          title1,
          title2,
        });

        if (range1) {
          searchParams.set("start1", range1[0].toString());
          searchParams.set("end1", range1[1].toString());
        }
        if (range2) {
          searchParams.set("start2", range2[0].toString());
          searchParams.set("end2", range2[1].toString());
        }

        const response = await fetch(
          `/api/visualization/compare?${searchParams.toString()}`,
          {
            signal,
          },
        );

        if (!response.ok) {
          throw new Error("Failed to load comparison metrics");
        }

        const data = await response.json();

        if (data.success) {
          const { film: filmReport, ...alignment } = data.metrics;
          setMetrics(alignment);
          setFilm(filmReport ?? null);
        } else {
          throw new Error(data.error || "Failed to compute metrics");
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [jobId1, jobId2, range1, range2],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      loadComparisonMetrics(controller.signal);
    }, 150);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [loadComparisonMetrics]);

  const sections = Object.entries(film?.sections ?? {});
  const metricsOf = (section: string) => film?.metrics?.filter((m) => m.section === section) ?? [];

  return (
    <div className="panel-bg border border-[var(--surface-border)] rounded p-6">
      {/* Header: titles and posters, with every metric's written summary beside them */}
      <div className="grid gap-6 md:grid-cols-[auto_1fr] mb-6">
        <div>
          <h3 className="text-2xl font-semibold uppercase tracking-wide kalmus-text-primary">Comparing</h3>
          <p className="text-xs kalmus-text-secondary mb-3">
            {title1} with {title2}
          </p>
          <div className="flex gap-2">
            {[poster1, poster2].map((src, i) =>
              src ? (
                // eslint-disable-next-line @next/next/no-img-element -- external poster URL
                <img key={i} src={src} alt="" className="h-28 w-auto border border-[var(--surface-border)]" />
              ) : null,
            )}
          </div>
        </div>
        {film && !loading && (
          <div className="space-y-3 text-xs leading-relaxed kalmus-text-secondary">
            {sections.map(([section]) => {
              const text = metricsOf(section)
                .map((m) => m.summary)
                .filter(Boolean)
                .join(" ");
              return text ? <p key={section}>{text}</p> : null;
            })}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <svg className="animate-spin h-5 w-5 kalmus-text-secondary" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-sm kalmus-text-secondary">Computing similarity metrics...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="kalmus-surface-strong rounded p-4">
          <p className="text-sm kalmus-text-primary">{error}</p>
        </div>
      )}

      {!loading && !error && metrics && film && (
        <div className="space-y-4">
          {film.error && <p className="text-xs kalmus-text-secondary">{film.error}</p>}

          {/* Scale labels, over the bar column */}
          <div className="grid grid-cols-[8rem_3rem_1fr] gap-3 text-xs uppercase tracking-wide kalmus-text-secondary">
            <span />
            <span />
            <div className="flex justify-between">
              <span>Less alike</span>
              <span>More alike</span>
            </div>
          </div>

          <ScoreRow label="Overall" score={film.overall} strong />

          {sections.map(([section, sectionScore]) => (
            <div key={section} className="kalmus-surface-strong rounded p-4 space-y-2">
              <div className="border-b border-[var(--surface-border)] pb-2 mb-1">
                <ScoreRow label={section} score={sectionScore} strong />
              </div>
              {metricsOf(section).map((m) => (
                <ScoreRow key={m.key} label={m.label} score={m.score} title={m.summary} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
