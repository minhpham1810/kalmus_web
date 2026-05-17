"use client";

import { useState, useMemo } from "react";
import PlotlyWrapper from "./PlotlyWrapper";
import {
  RGB,
  filterHueHistogramColors,
  getHueSamples,
  computeHistogram,
  getHueColor,
  filterHueSamplesBySaturation,
  pickDeterministicFrameIndex,
  rgbToHsv,
  trimHueSampleOutliers,
} from "@/lib/barcode-utils";

interface InteractiveHistogramProps {
  colors?: RGB[];
  brightness?: number[];
  barcodeType: "Color" | "Brightness";
  title?: string;
  frameIndexOffset?: number;
  onPreviewFrameChange?: (frameIndex: number | null) => void;
  onPreviewFramePin?: (frameIndex: number) => void;
}

const BIN_STEP_OPTIONS = [1, 2, 5, 10, 15, 20, 30];
const SATURATION_THRESHOLDS = [0, 0.05, 0.10, 0.15, 0.20, 0.30];

export default function InteractiveHistogram({
  colors,
  brightness,
  barcodeType,
  title = "Distribution",
  frameIndexOffset = 0,
  onPreviewFrameChange,
  onPreviewFramePin,
}: InteractiveHistogramProps) {
  const [binStep, setBinStep] = useState(1);
  const [satThreshold, setSatThreshold] = useState(0);

  const histogramData = useMemo(() => {
    if (barcodeType === "Color" && colors) {
      // Exclude near-achromatic black/white RGBs before hue exists, then trim/filter hue.
      const filteredColors = filterHueHistogramColors(colors);
      const rawSamples = getHueSamples(filteredColors);
      const trimmedSamples = trimHueSampleOutliers(rawSamples, 0.01);
      const filteredSamples = filterHueSamplesBySaturation(trimmedSamples, satThreshold);
      const hues = filteredSamples.map((sample) => sample.hue);
      const { binCenters, counts } = computeHistogram(hues, binStep, 360);
      const representativeFrameIndices = new Array(binCenters.length).fill(null) as Array<number | null>;

      const indexedFilteredColors = colors
        .map((color, index) => ({ color, index }))
        .filter(({ color }) => filterHueHistogramColors([color]).length > 0)
        .map(({ color, index }) => {
          const [hue, saturation] = rgbToHsv(color[0], color[1], color[2]);
          return { hue, saturation, index };
        })
        .sort((a, b) => a.hue - b.hue);

      const trimCount = Math.floor(indexedFilteredColors.length * 0.01);
      const trimmedIndexedSamples =
        trimCount > 0 && trimCount < indexedFilteredColors.length
          ? indexedFilteredColors.slice(trimCount)
          : indexedFilteredColors;

      const finalIndexedSamples =
        satThreshold > 0
          ? trimmedIndexedSamples.filter(
              (sample) => sample.saturation > 0 && sample.saturation >= satThreshold
            )
          : trimmedIndexedSamples;

      const binFrameIndices = new Map<number, number[]>();
      finalIndexedSamples.forEach((sample) => {
        const binIndex = Math.min(Math.floor(sample.hue / binStep), binCenters.length - 1);
        const existing = binFrameIndices.get(binIndex) ?? [];
        existing.push(sample.index);
        binFrameIndices.set(binIndex, existing);
      });

      for (let i = 0; i < representativeFrameIndices.length; i++) {
        representativeFrameIndices[i] = pickDeterministicFrameIndex(binFrameIndices.get(i) ?? [], i);
      }

      // Generate colors for each bin based on hue
      const barColors = binCenters.map((h) => getHueColor(h));

      return {
        x: binCenters,
        y: counts,
        colors: barColors,
        xLabel: "Color Hue (0 - 360)",
        yLabel: "Number of frames",
        xTicks: Array.from({ length: 13 }, (_, i) => i * 30), // 0, 30, 60, ..., 360
        maxX: 360,
        representativeFrameIndices,
      };
    } else if (barcodeType === "Brightness" && brightness) {
      // Brightness histogram (0-255)
      const { binCenters, counts } = computeHistogram(brightness, binStep, 255);
      const representativeFrameIndices = new Array(binCenters.length).fill(null) as Array<number | null>;
      const binFrameIndices = new Map<number, number[]>();

      brightness.forEach((value, index) => {
        const binIndex = Math.min(Math.floor(value / binStep), binCenters.length - 1);
        const existing = binFrameIndices.get(binIndex) ?? [];
        existing.push(index);
        binFrameIndices.set(binIndex, existing);
      });

      for (let i = 0; i < representativeFrameIndices.length; i++) {
        representativeFrameIndices[i] = pickDeterministicFrameIndex(binFrameIndices.get(i) ?? [], i);
      }

      // Grayscale colors for brightness
      const barColors = binCenters.map((b) => {
        const gray = Math.round(b);
        return `rgb(${gray},${gray},${gray})`;
      });

      return {
        x: binCenters,
        y: counts,
        colors: barColors,
        xLabel: "Brightness (0 - 255)",
        yLabel: "Number of frames",
        xTicks: Array.from({ length: 18 }, (_, i) => i * 15), // 0, 15, 30, ..., 255
        maxX: 255,
        representativeFrameIndices,
      };
    }

    return null;
  }, [colors, brightness, barcodeType, binStep, satThreshold]);

  if (!histogramData) {
    return (
      <div className="bg-neutral-100 dark:bg-neutral-900 rounded p-8 text-center">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          No data available for histogram
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div className="panel-bg rounded border border-neutral-200 dark:border-neutral-700">
        <PlotlyWrapper
          data={[
            {
              type: "bar",
              x: histogramData.x,
              y: histogramData.y,
              marker: {
                color: histogramData.colors,
                line: {
                  color: "rgba(0,0,0,0.3)",
                  width: 0.5,
                },
              },
              customdata: histogramData.representativeFrameIndices,
              hovertemplate:
                barcodeType === "Color"
                  ? "Hue: %{x}°<br>Count: %{y}<extra></extra>"
                  : "Brightness: %{x}<br>Count: %{y}<extra></extra>",
            },
          ]}
          layout={{
            title: {
              text: title,
              font: { size: 14 },
            },
            xaxis: {
              title: { text: histogramData.xLabel },
              tickvals: histogramData.xTicks,
              range: [0, histogramData.maxX],
              gridcolor: "rgba(128,128,128,0.2)",
            },
            yaxis: {
              title: { text: histogramData.yLabel },
              gridcolor: "rgba(128,128,128,0.2)",
            },
            bargap: 0.05,
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
          style={{ width: "100%", height: "400px" }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-600 dark:text-neutral-400">
            Bin Step:
          </label>
          <select
            value={binStep}
            onChange={(e) => setBinStep(Number(e.target.value))}
            className="kalmus-input px-2 py-1 text-xs"
          >
            {BIN_STEP_OPTIONS.map((step) => (
              <option key={step} value={step}>
                {step}
              </option>
            ))}
          </select>
        </div>
        {barcodeType === "Color" && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-600 dark:text-neutral-400">
              Saturation Filter:
            </label>
            <select
              value={satThreshold}
              onChange={(e) => setSatThreshold(Number(e.target.value))}
              className="kalmus-input px-2 py-1 text-xs"
            >
              {SATURATION_THRESHOLDS.map((t) => (
                <option key={t} value={t}>
                  {t === 0 ? "No filter" : `> ${t}`}
                </option>
              ))}
            </select>
          </div>
        )}
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          Total samples: {histogramData.y.reduce((a, b) => a + b, 0).toLocaleString()}
        </span>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {barcodeType === "Color"
          ? `Distribution of hue values (0-360°) across all sampled frames. Near-achromatic black and white RGB values are excluded before hue conversion, then the bottom 1% of hue values are trimmed.${satThreshold > 0 ? ` An additional saturation filter of > ${satThreshold} is applied afterward.` : ""}`
          : "Distribution of brightness values (0-255) across all sampled frames."}
      </p>
    </div>
  );
}
