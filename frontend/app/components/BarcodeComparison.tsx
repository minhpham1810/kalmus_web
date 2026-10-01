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
  range1?: FrameRange | null;
  range2?: FrameRange | null;
}

export default function BarcodeComparison({
  jobId1,
  jobId2,
  title1 = "Barcode 1",
  title2 = "Barcode 2",
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

  const getMetricColor = (value: number, metric: string) => {
    // For correlation metrics, values near 1 are good (green), near -1 are anti-similar (red)
    // For similarity metrics (nrmse, ssim, etc), values near 1 are good
    if (metric === "crossCorrelation" || metric === "localCrossCorrelation") {
      if (value > 0.7) return "text-green-600 dark:text-green-400";
      if (value > 0.3) return "text-yellow-600 dark:text-yellow-400";
      if (value > -0.3) return "text-orange-600 dark:text-orange-400";
      return "text-red-600 dark:text-red-400";
    } else {
      if (value > 0.8) return "text-green-600 dark:text-green-400";
      if (value > 0.6) return "text-yellow-600 dark:text-yellow-400";
      if (value > 0.4) return "text-orange-600 dark:text-orange-400";
      return "text-red-600 dark:text-red-400";
    }
  };

  const getProgressWidth = (value: number, metric: string) => {
    // Convert value to percentage (0-100)
    if (metric === "crossCorrelation" || metric === "localCrossCorrelation") {
      // Map -1 to 1 range to 0 to 100
      return ((value + 1) / 2) * 100;
    } else {
      // Already 0 to 1, just multiply by 100
      return value * 100;
    }
  };

  const metricDescriptions = {
    nrmse: {
      name: "NRMSE Similarity",
      description:
        "Normalized Root Mean Square Error - measures pixel-level similarity",
      range: "0% (least similar) to 100% (most similar)",
      tag: "Image Similarity",
    },
    ssim: {
      name: "SSIM",
      description: "Structural Similarity Index - measures structural patterns",
      range: "0% (least similar) to 100% (most similar)",
      tag: "Image Similarity",
    },
    crossCorrelation: {
      name: "Cross Correlation",
      description: "Measures linear relationship between color sequences",
      range: "-100% (anti-similar) to 100% (most similar)",
      tag: "Signal Correlation",
    },
    localCrossCorrelation: {
      name: "Local Cross Correlation",
      description: "Measures local correlation patterns between sequences",
      range: "-100% (anti-similar) to 100% (most similar)",
      tag: "Signal Correlation",
    },
    needlemanWunsch: {
      name: "Needleman-Wunsch",
      description: "Global sequence alignment similarity",
      range: "0% (least similar) to 100% (most similar)",
      tag: "Sequence Matching",
    },
    smithWaterman: {
      name: "Smith-Waterman",
      description: "Local sequence alignment similarity",
      range: "0% (least similar) to 100% (most similar)",
      tag: "Sequence Matching",
    },
  };

  return (
    <div className="panel-bg border border-[var(--surface-border)] rounded p-6">
      <h3 className="text-2xl font-semibold mb-2 kalmus-text-primary uppercase tracking-wide text-center">
        Barcode Comparison
      </h3>
      <p className="text-xs kalmus-text-muted mb-6 text-center">
        Comparing {title1} and {title2}
      </p>

      {loading && (
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
            <span className="text-sm kalmus-text-secondary">
              Computing similarity metrics...
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="kalmus-surface-strong rounded p-4">
          <p className="text-sm kalmus-text-primary">{error}</p>
        </div>
      )}

      {!loading && !error && metrics && (
        <div className="space-y-6">
          {film && (
            <div className="">
              <div className="flex items-baseline justify-between mb-1">
                <h4 className="text-lg font-semibold kalmus-text-primary">
                  Look &amp; Feel
                </h4>
                {film.overall != null && (
                  <span
                    className={`text-2xl font-semibold ${getMetricColor(film.overall / 100, "")}`}
                  >
                    {film.overall.toFixed(0)}%
                  </span>
                )}
              </div>
              <p className="text-xs kalmus-text-muted mb-4">
                Palette, lightness and editing compared regardless of order.
                Film A = {title1}, Film B = {title2}.
              </p>
              {film.error && (
                <p className="text-xs kalmus-text-secondary">{film.error}</p>
              )}
              {Object.entries(film.sections ?? {}).map(
                ([section, sectionScore]) => (
                  <div
                    key={section}
                    className="kalmus-surface-strong rounded p-4 mb-4 last:mb-0"
                  >
                    <div className="flex items-baseline justify-between text-sm font-medium uppercase tracking-wide kalmus-text-primary border-b border-[var(--surface-border)] pb-2 mb-3">
                      <span>{section}</span>
                      <span
                        className={`text-lg font-semibold ${sectionScore == null ? "kalmus-text-muted" : getMetricColor(sectionScore / 100, "")}`}
                      >
                        {sectionScore == null
                          ? "–"
                          : `${sectionScore.toFixed(0)}%`}
                      </span>
                    </div>
                    {film.metrics
                      ?.filter((m) => m.section === section)
                      .map((m) => (
                        <div
                          key={m.key}
                          className="flex items-baseline gap-3 mb-2 last:mb-0"
                        >
                          <span className="w-24 shrink-0 text-xs kalmus-text-primary">
                            {m.label}
                          </span>
                          <span
                            className={`w-12 shrink-0 text-base font-semibold text-right ${m.score == null ? "kalmus-text-muted" : getMetricColor(m.score / 100, "")}`}
                          >
                            {m.score == null ? "–" : `${m.score.toFixed(0)}%`}
                          </span>
                          <p className="text-xs kalmus-text-muted">
                            {m.summary}
                          </p>
                        </div>
                      ))}
                  </div>
                ),
              )}
            </div>
          )}

          {/* <h4 className="text-xs uppercase tracking-wide kalmus-text-secondary">Alignment</h4>
          {Object.entries(metrics).map(([key, value]) => {
            const desc = metricDescriptions[key as keyof typeof metricDescriptions];
            return (
              <div key={key} className="border-b border-[var(--surface-border)] pb-4 last:border-0">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium kalmus-text-primary">
                        {desc.name}
                      </h4>
                      <span className="text-xs px-2 py-0.5 bg-[var(--surface-bg-strong)] kalmus-text-secondary rounded">
                        {desc.tag}
                      </span>
                    </div>
                    <p className="text-xs kalmus-text-muted mt-1">
                      {desc.description}
                    </p>
                  </div>
                  <span
                    className={`text-2xl font-semibold ${getMetricColor(value, key)}`}
                  >
                    {(value * 100).toFixed(1)}%
                  </span>
                </div>

                <div className="w-full bg-[var(--surface-bg-strong)] rounded-full h-2 mt-2">
                  <div
                    className="h-2 rounded-full transition-all duration-500 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
                    style={{ width: `${getProgressWidth(value, key)}%` }}
                  />
                </div>

                <p className="text-xs kalmus-text-muted mt-1">
                  {desc.range}
                </p>
              </div>
            );
          })} */}

          {/* <div className="mt-6 kalmus-surface-strong rounded p-4">
            <p className="text-xs kalmus-text-secondary">
              <strong>Note:</strong> Different metrics capture different aspects
              of similarity. Use multiple metrics together for comprehensive
              analysis.
            </p>
          </div> */}
        </div>
      )}
    </div>
  );
}
