"use client";

import { useState, useMemo } from "react";
import PlotlyWrapper from "./PlotlyWrapper";
import { RGB, deterministicSample, prepareRGBCubeData } from "@/lib/barcode-utils";

interface InteractiveRGBCubeProps {
  colors: RGB[];
  title?: string;
  maxSamples?: number;
}

const SAMPLE_SIZE_OPTIONS = [1000, 3000, 6000, 10000];

export default function InteractiveRGBCube({
  colors,
  title = "RGB Color Cube",
  maxSamples = 10000,
}: InteractiveRGBCubeProps) {
  const [sampleSize, setSampleSize] = useState(Math.min(10000, colors.length));

  const cubeData = useMemo(() => {
    const sampled = deterministicSample(colors, sampleSize);
    return prepareRGBCubeData(sampled);
  }, [colors, sampleSize]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-600 dark:text-neutral-400">
            Sample Size:
          </label>
          <select
            value={sampleSize}
            onChange={(e) => setSampleSize(Number(e.target.value))}
            className="kalmus-input px-2 py-1 text-xs"
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
          Showing {cubeData.r.length.toLocaleString()} of {colors.length.toLocaleString()} colors
        </span>
      </div>

      {/* 3D Chart */}
      <div className="panel-bg rounded border border-neutral-200 dark:border-neutral-700">
        <PlotlyWrapper
          data={[
            {
              type: "scatter3d",
              mode: "markers",
              x: cubeData.r,
              y: cubeData.g,
              z: cubeData.b,
              marker: {
                size: 3,
                color: cubeData.colorStrs,
                opacity: 0.8,
              },
              hovertemplate:
                "R: %{x}<br>G: %{y}<br>B: %{z}<extra></extra>",
            },
          ]}
          layout={{
            title: {
              text: title,
              font: { size: 14 },
            },
            scene: {
              xaxis: {
                title: { text: "Red" },
                range: [0, 255],
                tickvals: [0, 64, 128, 192, 255],
                gridcolor: "rgba(128,128,128,0.3)",
              },
              yaxis: {
                title: { text: "Green" },
                range: [0, 255],
                tickvals: [0, 64, 128, 192, 255],
                gridcolor: "rgba(128,128,128,0.3)",
              },
              zaxis: {
                title: { text: "Blue" },
                range: [0, 255],
                tickvals: [0, 64, 128, 192, 255],
                gridcolor: "rgba(128,128,128,0.3)",
              },
              aspectmode: "cube",
              camera: {
                eye: { x: -2.0, y: 2.0, z: 1.3 },
              },
              dragmode: "turntable",
            },
            margin: { l: 0, r: 0, t: 50, b: 0 },
            paper_bgcolor: "transparent",
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
              height: 800,
              width: 800,
              scale: 2,
            },
          }}
          useResizeHandler={true}
          style={{ width: "100%", height: "500px" }}
        />
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        3D scatter plot of RGB colors. Each point represents a color from the barcode.
        Drag to rotate, scroll to zoom, right-click drag to pan.
      </p>
    </div>
  );
}
