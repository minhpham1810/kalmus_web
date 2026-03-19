"use client";

import { useState, useEffect } from "react";

interface ColorStats {
  totalFrames: number;
  filmLengthInFrames: number;
  barcodeShape: number[];
  dominantColors: Array<{ rgb: number[]; percentage: number }>;
  averageColor: number[];
  brightnessStats: {
    mean: number;
    median: number;
    std: number;
    min: number;
    max: number;
  };
  colorMetric: string;
  frameType: string;
  barcodeType: string;
}

interface ColorStatsDashboardProps {
  jobId: string;
  title?: string;
}

export default function ColorStatsDashboard({
  jobId,
  title = "Color Statistics",
}: ColorStatsDashboardProps) {
  const [stats, setStats] = useState<ColorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, [jobId]);

  const loadStats = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/job-result/${jobId}`);
      if (!response.ok) {
        throw new Error("Failed to load barcode data");
      }

      const data = await response.json();

      if (data.success && data.barcode && data.summary) {
        computeStats(data.barcode, data.summary);
      } else {
        throw new Error("Invalid barcode data");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const computeStats = (barcodeData: any, summary: any) => {
    const colors = barcodeData.colors || [];

    // Calculate dominant colors
    const colorCounts = new Map<string, number>();
    colors.forEach((color: number[]) => {
      const key = color.join(",");
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    });

    const sortedColors = Array.from(colorCounts.entries())
      .map(([key, count]) => ({
        rgb: key.split(",").map(Number),
        percentage: (count / colors.length) * 100,
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 5);

    // Calculate average color
    const avgR = colors.reduce((sum: number, c: number[]) => sum + c[0], 0) / colors.length;
    const avgG = colors.reduce((sum: number, c: number[]) => sum + c[1], 0) / colors.length;
    const avgB = colors.reduce((sum: number, c: number[]) => sum + c[2], 0) / colors.length;

    // Calculate brightness statistics
    const brightness = colors.map((c: number[]) => (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114));
    brightness.sort((a: number, b: number) => a - b);

    const mean = brightness.reduce((sum: number, b: number) => sum + b, 0) / brightness.length;
    const median = brightness[Math.floor(brightness.length / 2)];
    const variance =
      brightness.reduce((sum: number, b: number) => sum + Math.pow(b - mean, 2), 0) /
      brightness.length;
    const std = Math.sqrt(variance);

    setStats({
      totalFrames: summary.total_frames || 0,
      filmLengthInFrames: summary.film_length_in_frames || 0,
      barcodeShape: summary.barcode_shape || [0, 0, 0],
      dominantColors: sortedColors,
      averageColor: [Math.round(avgR), Math.round(avgG), Math.round(avgB)],
      brightnessStats: {
        mean: Math.round(mean),
        median: Math.round(median),
        std: Math.round(std),
        min: Math.round(brightness[0]),
        max: Math.round(brightness[brightness.length - 1]),
      },
      colorMetric: summary.color_metric || "Unknown",
      frameType: summary.frame_type || "Unknown",
      barcodeType: summary.barcode_type || "Unknown",
    });
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const rgbToHex = (rgb: number[]) => {
    return (
      "#" +
      rgb
        .map((c) => {
          const hex = c.toString(16);
          return hex.length === 1 ? "0" + hex : hex;
        })
        .join("")
    );
  };

  return (
    <div className="panel-bg border border-neutral-200 dark:border-neutral-700 rounded p-6">
      <h3 className="text-sm font-medium mb-6 text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
        {title}
      </h3>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <svg
              className="animate-spin h-5 w-5 text-neutral-600 dark:text-neutral-400"
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
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              Computing statistics...
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded p-4">
          <p className="text-sm text-neutral-900 dark:text-neutral-100">{error}</p>
        </div>
      )}

      {!loading && !error && stats && (
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Total Frames" value={formatNumber(stats.totalFrames)} />
            <StatCard label="Film Length" value={`${formatNumber(stats.filmLengthInFrames)} frames`} />
            <StatCard label="Barcode Size" value={`${stats.barcodeShape[0]} × ${stats.barcodeShape[1]}`} />
            <StatCard label="Color Metric" value={stats.colorMetric} />
          </div>

          {/* Average Color */}
          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4">
            <h4 className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-3 uppercase tracking-wide">
              Average Color
            </h4>
            <div className="flex items-center gap-4">
              <div
                className="w-20 h-20 rounded border border-neutral-300 dark:border-neutral-600"
                style={{
                  backgroundColor: `rgb(${stats.averageColor[0]}, ${stats.averageColor[1]}, ${stats.averageColor[2]})`,
                }}
              />
              <div className="flex-1 space-y-1">
                <div className="text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">RGB:</span>{" "}
                  <code className="text-neutral-900 dark:text-neutral-100 font-mono text-xs">
                    ({stats.averageColor.join(", ")})
                  </code>
                </div>
                <div className="text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">HEX:</span>{" "}
                  <code className="text-neutral-900 dark:text-neutral-100 font-mono text-xs">
                    {rgbToHex(stats.averageColor)}
                  </code>
                </div>
              </div>
            </div>
          </div>

          {/* Dominant Colors */}
          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4">
            <h4 className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-3 uppercase tracking-wide">
              Top 5 Dominant Colors
            </h4>
            <div className="space-y-2">
              {stats.dominantColors.map((color, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded border border-neutral-300 dark:border-neutral-600 flex-shrink-0"
                    style={{
                      backgroundColor: `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`,
                    }}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <code className="text-neutral-600 dark:text-neutral-400 font-mono">
                        {rgbToHex(color.rgb)}
                      </code>
                      <span className="text-neutral-900 dark:text-neutral-100 font-medium">
                        {color.percentage.toFixed(2)}%
                      </span>
                    </div>
                    <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${color.percentage}%`,
                          backgroundColor: `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Brightness Statistics */}
          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-4">
            <h4 className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-3 uppercase tracking-wide">
              Brightness Distribution
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <BrightnessStatCard label="Mean" value={stats.brightnessStats.mean} />
              <BrightnessStatCard label="Median" value={stats.brightnessStats.median} />
              <BrightnessStatCard label="Std Dev" value={stats.brightnessStats.std} />
              <BrightnessStatCard label="Min" value={stats.brightnessStats.min} />
              <BrightnessStatCard label="Max" value={stats.brightnessStats.max} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-100 dark:bg-neutral-900 rounded p-3">
      <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">{label}</div>
      <div className="text-base font-medium text-neutral-900 dark:text-neutral-100">{value}</div>
    </div>
  );
}

function BrightnessStatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-neutral-100 dark:bg-neutral-900 rounded p-2 text-center">
      <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">{label}</div>
      <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{value}</div>
    </div>
  );
}
