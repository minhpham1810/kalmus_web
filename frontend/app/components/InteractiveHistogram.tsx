"use client";

import { useState, useMemo } from "react";
import PlotlyWrapper from "./PlotlyWrapper";
import {
  RGB,
  getHueValues,
  computeHistogram,
  getHueColor,
} from "@/lib/barcode-utils";

interface InteractiveHistogramProps {
  colors?: RGB[];
  brightness?: number[];
  barcodeType: "Color" | "Brightness";
  title?: string;
}

const BIN_STEP_OPTIONS = [1, 2, 5, 10, 15, 20, 30];

export default function InteractiveHistogram({
  colors,
  brightness,
  barcodeType,
  title = "Distribution",
}: InteractiveHistogramProps) {
  const [binStep, setBinStep] = useState(5);

  const histogramData = useMemo(() => {
    if (barcodeType === "Color" && colors) {
      // Hue histogram (0-360)
      const hues = getHueValues(colors, 0);
      const { binCenters, counts } = computeHistogram(hues, binStep, 360);

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
      };
    } else if (barcodeType === "Brightness" && brightness) {
      // Brightness histogram (0-255)
      const { binCenters, counts } = computeHistogram(brightness, binStep, 255);

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
      };
    }

    return null;
  }, [colors, brightness, barcodeType, binStep]);

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
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-600 dark:text-neutral-400">
            Bin Step:
          </label>
          <select
            value={binStep}
            onChange={(e) => setBinStep(Number(e.target.value))}
            className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
          >
            {BIN_STEP_OPTIONS.map((step) => (
              <option key={step} value={step}>
                {step}
              </option>
            ))}
          </select>
        </div>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          Total samples: {histogramData.y.reduce((a, b) => a + b, 0).toLocaleString()}
        </span>
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700">
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
              filename: `histogram_${barcodeType.toLowerCase()}`,
              height: 600,
              width: 1000,
              scale: 2,
            },
          }}
          useResizeHandler={true}
          style={{ width: "100%", height: "400px" }}
        />
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {barcodeType === "Color"
          ? "Distribution of hue values (0-360°) across all sampled frames. Bars are colored by their corresponding hue."
          : "Distribution of brightness values (0-255) across all sampled frames."}
      </p>
    </div>
  );
}
