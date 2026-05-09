"use client";

import { useState, useMemo } from "react";
import PlotlyWrapper from "./PlotlyWrapper";
import {
  RGB,
  deterministicSampleWithIndices,
  prepareHueLightScatterData,
} from "@/lib/barcode-utils";

interface InteractiveHueLightScatterProps {
  colors: RGB[];
  title?: string;
  maxSamples?: number;
  frameIndexOffset?: number;
  onPreviewFrameChange?: (frameIndex: number | null) => void;
  onPreviewFramePin?: (frameIndex: number) => void;
}

const SATURATION_THRESHOLDS = [0, 0.05, 0.10, 0.15, 0.20, 0.30];
const SAMPLE_SIZE_OPTIONS = [1000, 3000, 6000, 10000, 20000];
const DEFAULT_SAMPLE_SIZE = 10000;

export default function InteractiveHueLightScatter({
  colors,
  title = "Hue vs Lightness Scatter Plot",
  maxSamples = 10000,
  frameIndexOffset = 0,
  onPreviewFrameChange,
  onPreviewFramePin,
}: InteractiveHueLightScatterProps) {
  const [saturationThreshold, setSaturationThreshold] = useState(0);
  const maxSelectableSamples = Math.min(maxSamples, colors.length);
  const [sampleSize, setSampleSize] = useState(
    Math.min(DEFAULT_SAMPLE_SIZE, maxSelectableSamples)
  );

  const scatterData = useMemo(() => {
    const sampled = deterministicSampleWithIndices(colors, sampleSize);
    return prepareHueLightScatterData(sampled.items, saturationThreshold, sampled.indices);
  }, [colors, sampleSize, saturationThreshold]);

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div className="panel-bg rounded border border-neutral-200 dark:border-neutral-700">
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
              customdata: scatterData.pointOriginalIndices,
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
              filename: title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
              height: 600,
              width: 1000,
              scale: 2,
            },
          }}
          onHover={(event) => {
            const point = event.points?.[0];
            const frameIndex = point?.customdata;
            onPreviewFrameChange?.(
              typeof frameIndex === "number" ? frameIndex + frameIndexOffset : null
            );
          }}
          onUnhover={() => onPreviewFrameChange?.(null)}
          onClick={(event) => {
            const point = event.points?.[0];
            const frameIndex = point?.customdata;
            if (typeof frameIndex === "number") {
              onPreviewFramePin?.(frameIndex + frameIndexOffset);
            }
          }}
          useResizeHandler={true}
          style={{ width: "100%", height: "450px" }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-600 dark:text-neutral-400">
            Saturation Threshold:
          </label>
          <select
            value={saturationThreshold}
            onChange={(e) => setSaturationThreshold(Number(e.target.value))}
            className="kalmus-input px-2 py-1 text-xs"
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
            className="kalmus-input px-2 py-1 text-xs"
          >
            {SAMPLE_SIZE_OPTIONS.filter((s) => s <= maxSelectableSamples).map((size) => (
              <option key={size} value={size}>
                {size.toLocaleString()}
              </option>
            ))}
            {!SAMPLE_SIZE_OPTIONS.includes(maxSelectableSamples) && (
              <option value={maxSelectableSamples}>
                {maxSelectableSamples.toLocaleString()} (all)
              </option>
            )}
          </select>
        </div>

        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          Showing {scatterData.hueValues.length.toLocaleString()} points
        </span>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Scatter plot showing the distribution of colors by Hue (x-axis) and Lightness/Value (y-axis).
        Each point is colored with its original RGB color.
        {saturationThreshold > 0 && ` Only colors with saturation > ${saturationThreshold} are included.`}
      </p>
    </div>
  );
}
