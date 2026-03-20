"use client";

import { useState, useEffect } from "react";

interface ComparisonMetrics {
  nrmse: number;
  ssim: number;
  crossCorrelation: number;
  localCrossCorrelation: number;
  needlemanWunsch: number;
  smithWaterman: number;
}

interface BarcodeComparisonProps {
  jobId1: string;
  jobId2: string;
  title1?: string;
  title2?: string;
}

export default function BarcodeComparison({
  jobId1,
  jobId2,
  title1 = "Barcode 1",
  title2 = "Barcode 2",
}: BarcodeComparisonProps) {
  const [metrics, setMetrics] = useState<ComparisonMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadComparisonMetrics();
  }, [jobId1, jobId2]);

  const loadComparisonMetrics = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch comparison metrics from KALMUS API endpoint
      const response = await fetch(
        `/api/visualization/compare?jobId1=${jobId1}&jobId2=${jobId2}`
      );

      if (!response.ok) {
        throw new Error("Failed to load comparison metrics");
      }

      const data = await response.json();

      if (data.success) {
        setMetrics(data.metrics);
      } else {
        throw new Error(data.error || "Failed to compute metrics");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const getMetricColor = (value: number, metric: string) => {
    // For correlation metrics, values near 1 are good (green), near -1 are anti-similar (red)
    // For similarity metrics (nrmse, ssim, etc), values near 1 are good
    if (metric === "crossCorrelation" || metric === "localCrossCorrelation") {
      if (value > 0.7) return "text-emerald-400";
      if (value > 0.3) return "text-amber-400";
      if (value > -0.3) return "text-orange-400";
      return "text-red-400";
    } else {
      if (value > 0.8) return "text-emerald-400";
      if (value > 0.6) return "text-amber-400";
      if (value > 0.4) return "text-orange-400";
      return "text-red-400";
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
      name: "NRMSE_SIMILARITY",
      description: "Normalized Root Mean Square Error - pixel-level similarity",
      range: "0 (LEAST) to 1 (MOST)",
      tag: "IMAGE",
    },
    ssim: {
      name: "SSIM",
      description: "Structural Similarity Index - structural patterns",
      range: "0 (LEAST) to 1 (MOST)",
      tag: "IMAGE",
    },
    crossCorrelation: {
      name: "CROSS_CORRELATION",
      description: "Linear relationship between color sequences",
      range: "-1 (ANTI) to 1 (SIMILAR)",
      tag: "SIGNAL",
    },
    localCrossCorrelation: {
      name: "LOCAL_CORRELATION",
      description: "Local correlation patterns between sequences",
      range: "-1 (ANTI) to 1 (SIMILAR)",
      tag: "SIGNAL",
    },
    needlemanWunsch: {
      name: "NEEDLEMAN_WUNSCH",
      description: "Global sequence alignment similarity",
      range: "0 (LEAST) to 1 (MOST)",
      tag: "SEQUENCE",
    },
    smithWaterman: {
      name: "SMITH_WATERMAN",
      description: "Local sequence alignment similarity",
      range: "0 (LEAST) to 1 (MOST)",
      tag: "SEQUENCE",
    },
  };

  return (
    <div className="panel border border-amber-500/20 rounded p-6 relative overflow-hidden">
      {/* Decorative corners */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-amber-500/40" />
      <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-amber-500/40" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-amber-500/40" />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-amber-500/40" />
      
      <h3 className="text-xs font-mono mb-2 text-amber-500/80 uppercase tracking-widest flex items-center gap-2">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        BARCODE_COMPARISON
      </h3>
      <p className="text-xs text-neutral-500 font-mono mb-6">
        // Comparing {title1} vs {title2}
      </p>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <svg
              className="animate-spin h-8 w-8 text-amber-500"
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
            <span className="text-sm text-amber-500/80 font-mono tracking-wider">
              COMPUTING_METRICS...
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-black/40 border border-red-500/30 rounded p-4">
          <p className="text-sm text-red-400/90 font-mono">// ERROR: {error}</p>
        </div>
      )}

      {!loading && !error && metrics && (
        <div className="space-y-5">
          {Object.entries(metrics).map(([key, value]) => {
            const desc = metricDescriptions[key as keyof typeof metricDescriptions];
            return (
              <div key={key} className="border-b border-amber-500/10 pb-4 last:border-0">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-mono text-amber-100/90">
                        {desc.name}
                      </h4>
                      <span className="text-xs font-mono px-2 py-0.5 bg-cyan-500/10 text-cyan-400/70 rounded">
                        {desc.tag}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 font-mono mt-1">
                      // {desc.description}
                    </p>
                  </div>
                  <span
                    className={`text-lg font-mono font-semibold ${getMetricColor(value, key)}`}
                  >
                    {value.toFixed(3)}
                  </span>
                </div>

                <div className="w-full bg-black/40 rounded h-2 mt-2 overflow-hidden">
                  <div
                    className="h-2 rounded transition-all duration-500 bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500"
                    style={{ width: `${getProgressWidth(value, key)}%` }}
                  />
                </div>

                <p className="text-xs text-neutral-600 font-mono mt-1">
                  {desc.range}
                </p>
              </div>
            );
          })}

          <div className="mt-6 bg-black/40 border border-amber-500/10 rounded p-4">
            <p className="text-xs text-neutral-400 font-mono">
              <span className="text-cyan-400/70">NOTE:</span> Different metrics capture different aspects of similarity.
              Use multiple metrics for comprehensive analysis.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
