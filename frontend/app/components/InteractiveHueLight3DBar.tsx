"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import PlotlyWrapper from "./PlotlyWrapper";
import {
  RGB,
  computeHueLightBins,
  CAMERA_PRESETS,
  CameraPreset,
  rotateCamera,
} from "@/lib/barcode-utils";

interface InteractiveHueLight3DBarProps {
  colors: RGB[];
  title?: string;
}

const HUE_RESOLUTIONS = [5, 10, 15, 30];
const LIGHT_RESOLUTIONS = [0.01, 0.02, 0.05, 0.1];
const SATURATION_THRESHOLDS = [0, 0.05, 0.10, 0.15, 0.20, 0.30];

export default function InteractiveHueLight3DBar({
  colors,
  title = "Hue vs Light 3D Distribution",
}: InteractiveHueLight3DBarProps) {
  const [hueResolution, setHueResolution] = useState(5);
  const [lightResolution, setLightResolution] = useState(0.01);
  const [saturationThreshold, setSaturationThreshold] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [showAxis, setShowAxis] = useState(true);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("Diag View 2");
  const [rotationSpeed, setRotationSpeed] = useState(5);
  const [camera, setCamera] = useState<{ eye: { x: number; y: number; z: number } }>({
    eye: { x: -2.0, y: -2.0, z: 1.3 },
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Compute binned data
  const barData = useMemo(() => {
    return computeHueLightBins(
      colors,
      hueResolution,
      lightResolution,
      saturationThreshold
    );
  }, [colors, hueResolution, lightResolution, saturationThreshold]);

  // Handle camera preset change
  const handlePresetChange = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
    const presetCamera = CAMERA_PRESETS[preset];
    setCamera({ eye: { ...presetCamera.eye } });
  }, []);

  // Handle keyboard rotation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if container is focused or no other element has focus
      if (document.activeElement &&
          document.activeElement.tagName !== 'BODY' &&
          !containerRef.current?.contains(document.activeElement)) {
        return;
      }

      let azimuthDelta = 0;
      let elevationDelta = 0;

      switch (e.key) {
        case "ArrowLeft":
          azimuthDelta = rotationSpeed;
          break;
        case "ArrowRight":
          azimuthDelta = -rotationSpeed;
          break;
        case "ArrowUp":
          elevationDelta = -rotationSpeed;
          break;
        case "ArrowDown":
          elevationDelta = rotationSpeed;
          break;
        default:
          return;
      }

      e.preventDefault();
      const newEye = rotateCamera(camera.eye, azimuthDelta, elevationDelta);
      setCamera({ eye: newEye });
      setCameraPreset("Diag View 1"); // Reset preset indicator when manually rotating
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [camera, rotationSpeed]);

  // Calculate marker sizes based on counts (for 3D scatter approximation of bar plot)
  const markerSizes = useMemo(() => {
    if (barData.maxCount === 0) return barData.counts.map(() => 5);
    return barData.counts.map((c) => 5 + (c / barData.maxCount) * 25);
  }, [barData]);

  return (
    <div className="space-y-4" ref={containerRef} tabIndex={0}>
      {/* 3D Chart */}
      <div className="panel-bg rounded border border-neutral-200 dark:border-neutral-700">
        <PlotlyWrapper
          data={[
            {
              type: "scatter3d",
              mode: "markers",
              x: barData.hueValues,
              y: barData.lightValues,
              z: barData.counts,
              marker: {
                size: markerSizes,
                color: barData.colors,
                opacity: 0.85,
                line: {
                  color: "rgba(0,0,0,0.2)",
                  width: 0.5,
                },
              },
              hovertemplate:
                "Hue: %{x:.0f}°<br>Light: %{y:.2f}<br>Count: %{z}<extra></extra>",
            },
          ]}
          layout={{
            title: {
              text: title,
              font: { size: 14 },
            },
            scene: {
              xaxis: {
                title: { text: "Hue (0-360°)" },
                range: [0, 360],
                tickvals: [0, 60, 120, 180, 240, 300, 360],
                showgrid: showGrid,
                visible: showAxis,
                gridcolor: "rgba(128,128,128,0.3)",
              },
              yaxis: {
                title: { text: "Light (0-1)" },
                range: [0, 1],
                tickvals: [0, 0.25, 0.5, 0.75, 1],
                showgrid: showGrid,
                visible: showAxis,
                gridcolor: "rgba(128,128,128,0.3)",
              },
              zaxis: {
                title: { text: "Count" },
                showgrid: showGrid,
                visible: showAxis,
                gridcolor: "rgba(128,128,128,0.3)",
              },
              camera: camera,
              aspectmode: "manual",
              aspectratio: { x: 1.5, y: 1, z: 0.8 },
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
              width: 1000,
              scale: 2,
            },
          }}
          useResizeHandler={true}
          style={{ width: "100%", height: "550px" }}
        />
      </div>

      {/* Control Panel */}
      <div className="bg-neutral-100 dark:bg-neutral-900 rounded p-4 space-y-4">
        <h4 className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
          Plot Configuration
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Resolution Controls */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-neutral-600 dark:text-neutral-400 w-28">
                Hue Resolution:
              </label>
              <select
                value={hueResolution}
                onChange={(e) => setHueResolution(Number(e.target.value))}
                className="kalmus-input flex-1 px-2 py-1 text-xs"
              >
                {HUE_RESOLUTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}°
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-neutral-600 dark:text-neutral-400 w-28">
                Light Resolution:
              </label>
              <select
                value={lightResolution}
                onChange={(e) => setLightResolution(Number(e.target.value))}
                className="kalmus-input flex-1 px-2 py-1 text-xs"
              >
                {LIGHT_RESOLUTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-neutral-600 dark:text-neutral-400 w-28">
                Saturation Filter:
              </label>
              <select
                value={saturationThreshold}
                onChange={(e) => setSaturationThreshold(Number(e.target.value))}
                className="kalmus-input flex-1 px-2 py-1 text-xs"
              >
                {SATURATION_THRESHOLDS.map((t) => (
                  <option key={t} value={t}>
                    {t === 0 ? "No filter" : `> ${t}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Display Toggles */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="rounded border-neutral-300 dark:border-neutral-600"
              />
              <span className="text-xs text-neutral-600 dark:text-neutral-400">
                Show Grid
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showAxis}
                onChange={(e) => setShowAxis(e.target.checked)}
                className="rounded border-neutral-300 dark:border-neutral-600"
              />
              <span className="text-xs text-neutral-600 dark:text-neutral-400">
                Show Axis
              </span>
            </label>
          </div>

          {/* Camera Controls */}
          <div className="space-y-2">
            <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-1">
              Camera Views:
            </div>
            <div className="grid grid-cols-2 gap-1">
              {(Object.keys(CAMERA_PRESETS) as CameraPreset[]).map((preset) => (
                <button
                  key={preset}
                  onClick={() => handlePresetChange(preset)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    cameraPreset === preset
                      ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                      : "bg-white dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-600"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Rotation Speed */}
        <div className="flex items-center gap-4 pt-2 border-t border-neutral-200 dark:border-neutral-700">
          <label className="text-xs text-neutral-600 dark:text-neutral-400">
            Rotation Speed (Arrow Keys):
          </label>
          <input
            type="range"
            min={1}
            max={30}
            value={rotationSpeed}
            onChange={(e) => setRotationSpeed(Number(e.target.value))}
            className="w-32"
          />
          <span className="text-xs kalmus-text-secondary w-8">
            {rotationSpeed}°
          </span>
          <span className="text-xs kalmus-text-muted ml-4">
            Use arrow keys to rotate view
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <span>
          Showing {barData.counts.length.toLocaleString()} bins with{" "}
          {barData.counts.reduce((a, b) => a + b, 0).toLocaleString()} total samples
        </span>
        <span>Max count per bin: {barData.maxCount.toLocaleString()}</span>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        3D visualization showing color distribution by Hue (x-axis), Lightness (y-axis), and frequency (z-axis/size).
        Marker size represents the count of colors in each bin. Drag to rotate, scroll to zoom.
      </p>
    </div>
  );
}
