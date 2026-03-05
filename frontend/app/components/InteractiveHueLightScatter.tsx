"use client";

import { useState, useMemo } from "react";
import PlotlyWrapper from "./PlotlyWrapper";
import {
  RGB,
  deterministicSample,
  prepareHueLightScatterData,
} from "@/lib/barcode-utils";

interface InteractiveHueLightScatterProps {
  colors: RGB[];
  title?: string;
  maxSamples?: number;
}

const SATURATION_THRESHOLDS = [0, 0.05, 0.10, 0.15, 0.20, 0.30];
const SAMPLE_SIZE_OPTIONS = [1000, 3000, 6000, 10000];

export default function InteractiveHueLightScatter({
  colors,
  title = "Hue vs Lightness Scatter Plot",
  maxSamples = 10000,
}: InteractiveHueLightScatterProps) {
  const [saturationThreshold, setSaturationThreshold] = useState(0);
  const [sampleSize, setSampleSize] = useState(Math.min(10000, colors.length));

  const scatterData = useMemo(() => {
    const sampled = deterministicSample(colors, sampleSize);
    return prepareHueLightScatterData(sampled, saturationThreshold);
  }, [colors, sampleSize, saturationThreshold]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-600 dark:text-neutral-400">
            Saturation Threshold:
          </label>
          <select
            value={saturationThreshold}
            onChange={(e) => setSaturationThreshold(Number(e.target.value))}
            className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
          >
            {SATURATION_THRESHOLDS.map((t) => (
              <option key={t} value={t}>
                {t === 0 ? "No filter" : `> ${t}`}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-600 dark:text-neutral-400">
            Sample Size:
          </label>
          <select
            value={sampleSize}
            onChange={(e) => setSampleSize(Number(e.target.value))}
            className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
          >
            {SAMPLE_SIZE_OPTIONS.filter((s) => s <= colors.length).map((size) => (
              <option key={size} value={size}>
                {size.toLocaleString()}
              </option>
            ))}
            {!SAMPLE_SIZE_OPTIONS.includes(colors.length) && colors.length < SAMPLE_SIZE_OPTIONS[SAMPLE_SIZE_OPTIONS.length - 1] && (
              <option value={colors.length}>
                {colors.length.toLocaleString()} (all)
              </option>
            )}
          </select>
        </div>

        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          Showing {scatterData.hueValues.length.toLocaleString()} points
        </span>
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700">
        <PlotlyWrapper
          data={[
            {
              type: "scatter",
              mode: "markers",
              x: scatterData.hueValues,
              y: scatterData.lightValues,
              marker: {
                size: 4,
                color: scatterData.colorStrs,
                opacity: 0.7,
              },
              hovertemplate:
                "Hue: %{x:.0f}°<br>Lightness: %{y:.2f}<extra></extra>",
            },
          ]}
          layout={{
            title: {
              text: title,
              font: { size: 14 },
            },
            xaxis: {
              title: { text: "Hue (0 - 360°)" },
              range: [0, 360],
              tickvals: [0, 60, 120, 180, 240, 300, 360],
              gridcolor: "rgba(128,128,128,0.2)",
            },
            yaxis: {
              title: { text: "Lightness (Value) (0 - 1)" },
              range: [0, 1],
              tickvals: [0, 0.25, 0.5, 0.75, 1],
              gridcolor: "rgba(128,128,128,0.2)",
            },
            margin: { l: 60, r: 30, t: 50, b: 50 },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            font: {
              color: "#666",
            },
            autosize: true,
          }}
          config={{
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ["lasso2d", "select2d"],
            toImageButtonOptions: {
              format: "png",
              filename: "hue_light_scatter",
              height: 600,
              width: 1000,
              scale: 2,
            },
          }}
          useResizeHandler={true}
          style={{ width: "100%", height: "450px" }}
        />
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Scatter plot showing the distribution of colors by Hue (x-axis) and Lightness/Value (y-axis).
        Each point is colored with its original RGB color.
        {saturationThreshold > 0 && ` Only colors with saturation > ${saturationThreshold} are included.`}
      </p>
    </div>
  );
}
