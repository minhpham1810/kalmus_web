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
    <div className="panel border border-amber-500/20 rounded p-6 relative overflow-hidden">
      {/* Decorative corners */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-amber-500/40" />
      <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-amber-500/40" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-amber-500/40" />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-amber-500/40" />
      
      <h3 className="text-xs font-mono mb-6 text-amber-500/80 uppercase tracking-widest flex items-center gap-2">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
        {title.toUpperCase().replace(/ /g, '_')}
      </h3>

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
              COMPUTING_STATISTICS...
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-black/40 border border-red-500/30 rounded p-4">
          <p className="text-sm text-red-400/90 font-mono">// ERROR: {error}</p>
        </div>
      )}

      {!loading && !error && stats && (
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="TOTAL_FRAMES" value={formatNumber(stats.totalFrames)} />
            <StatCard label="FILM_LENGTH" value={`${formatNumber(stats.filmLengthInFrames)} frames`} />
            <StatCard label="BARCODE_SIZE" value={`${stats.barcodeShape[0]} x ${stats.barcodeShape[1]}`} />
            <StatCard label="COLOR_METRIC" value={stats.colorMetric} />
          </div>

          {/* Average Color */}
          <div className="border-t border-amber-500/10 pt-4">
            <h4 className="text-xs font-mono text-amber-500/70 mb-3 uppercase tracking-widest">
              AVERAGE_COLOR
            </h4>
            <div className="flex items-center gap-4">
              <div
                className="w-20 h-20 rounded border border-amber-500/20"
                style={{
                  backgroundColor: `rgb(${stats.averageColor[0]}, ${stats.averageColor[1]}, ${stats.averageColor[2]})`,
                }}
              />
              <div className="flex-1 space-y-2">
                <div className="text-sm font-mono">
                  <span className="text-neutral-500">RGB:</span>{" "}
                  <code className="text-cyan-400/80 text-xs">
                    ({stats.averageColor.join(", ")})
                  </code>
                </div>
                <div className="text-sm font-mono">
                  <span className="text-neutral-500">HEX:</span>{" "}
                  <code className="text-cyan-400/80 text-xs">
                    {rgbToHex(stats.averageColor)}
                  </code>
                </div>
              </div>
            </div>
          </div>

          {/* Dominant Colors */}
          <div className="border-t border-amber-500/10 pt-4">
            <h4 className="text-xs font-mono text-amber-500/70 mb-3 uppercase tracking-widest">
              DOMINANT_COLORS [TOP_5]
            </h4>
            <div className="space-y-2">
              {stats.dominantColors.map((color, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded border border-amber-500/20 flex-shrink-0"
                    style={{
                      backgroundColor: `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`,
                    }}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs mb-1 font-mono">
                      <code className="text-neutral-400">
                        {rgbToHex(color.rgb)}
                      </code>
                      <span className="text-amber-400">
                        {color.percentage.toFixed(2)}%
                      </span>
                    </div>
                    <div className="w-full bg-black/40 rounded h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded transition-all duration-300"
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
          <div className="border-t border-amber-500/10 pt-4">
            <h4 className="text-xs font-mono text-amber-500/70 mb-3 uppercase tracking-widest">
              BRIGHTNESS_DISTRIBUTION
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <BrightnessStatCard label="MEAN" value={stats.brightnessStats.mean} />
              <BrightnessStatCard label="MEDIAN" value={stats.brightnessStats.median} />
              <BrightnessStatCard label="STD_DEV" value={stats.brightnessStats.std} />
              <BrightnessStatCard label="MIN" value={stats.brightnessStats.min} />
              <BrightnessStatCard label="MAX" value={stats.brightnessStats.max} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black/40 border border-amber-500/10 rounded p-3">
      <div className="text-xs text-amber-500/50 font-mono mb-1">{label}</div>
      <div className="text-base font-mono text-amber-100/90">{value}</div>
    </div>
  );
}

function BrightnessStatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-black/40 border border-amber-500/10 rounded p-2 text-center">
      <div className="text-xs text-amber-500/50 font-mono mb-1">{label}</div>
      <div className="text-sm font-mono text-amber-100/90">{value}</div>
    </div>
  );
}
