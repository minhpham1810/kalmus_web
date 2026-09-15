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
  frameIndexOffset?: number;
  onPreviewFrameChange?: (frameIndex: number | null) => void;
  onPreviewFramePin?: (frameIndex: number) => void;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// added to try to fix strange overhead camera
interface CameraValue {
  eye: Vec3;
  up: Vec3;
  center: Vec3;
}

const DEFAULT_CENTER: Vec3 = { x: 0, y: 0, z: 0 };

const HUE_RESOLUTIONS = [5, 10, 15, 30];
const LIGHT_RESOLUTIONS = [0.01, 0.02, 0.05, 0.1];
const SATURATION_THRESHOLDS = [0, 0.05, 0.1, 0.15, 0.2, 0.3];

const VISIBLE_CAMERA_PRESETS: CameraPreset[] = [
  "Top View",
  "Diagonal View",
  "Hue View",
  "Light View",
];

const DEFAULT_PRESET: CameraPreset = "Diagonal View";

function cameraForPreset(preset: CameraPreset): CameraValue {
  const p = CAMERA_PRESETS[preset];
  const up = "up" in p ? (p as { up: Vec3 }).up : { x: 0, y: 0, z: 1 };
  return { eye: { ...p.eye }, up: { ...up }, center: { ...DEFAULT_CENTER } };
}

function sameVec3(a: Vec3 | undefined, b: Vec3 | undefined): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function sameCamera(a: CameraValue, b: CameraValue): boolean {
  return sameVec3(a.eye, b.eye) && sameVec3(a.up, b.up) && sameVec3(a.center, b.center);
}

export default function InteractiveHueLight3DBar({
  colors,
  title = "Hue vs Light 3D Distribution",
  frameIndexOffset = 0,
  onPreviewFrameChange,
  onPreviewFramePin,
}: InteractiveHueLight3DBarProps) {
  const [hueResolution, setHueResolution] = useState(5);
  const [lightResolution, setLightResolution] = useState(0.01);
  const [saturationThreshold, setSaturationThreshold] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [showAxis, setShowAxis] = useState(true);
  const [rotationSpeed, setRotationSpeed] = useState(5);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>(DEFAULT_PRESET);
  const [camera, setCamera] = useState<CameraValue>(() =>
    cameraForPreset(DEFAULT_PRESET)
  );
  const [cameraRevision, setCameraRevision] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef(camera);
  const rotationSpeedRef = useRef(rotationSpeed);
  const relayoutRafRef = useRef<number | null>(null);
  const pendingCamRef = useRef<{ eye?: Vec3; up?: Vec3; center?: Vec3 } | null>(null);
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const graphDivRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    rotationSpeedRef.current = rotationSpeed;
  }, [rotationSpeed]);

  const getPresetButtonStyle = (isActive: boolean) => ({
    background: isActive ? "var(--foreground)" : "var(--surface-bg-strong)",
    color: isActive ? "var(--background)" : "var(--text-primary)",
    borderColor: isActive ? "var(--foreground)" : "var(--input-border)",
  });

  const barData = useMemo(
    () =>
      computeHueLightBins(colors, hueResolution, lightResolution, saturationThreshold),
    [colors, hueResolution, lightResolution, saturationThreshold]
  );

  const markerSizes = useMemo(() => {
    if (barData.maxCount === 0) return barData.counts.map(() => 5);
    return barData.counts.map((c) => 5 + (c / barData.maxCount) * 25);
  }, [barData]);

  const handleInitialized = useCallback((_figure: unknown, gd: HTMLElement) => {
    graphDivRef.current = gd;
  }, []);

  const handlePresetChange = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
    setCamera(cameraForPreset(preset));
    setCameraRevision((n) => n + 1);

    // Force the drag tool back to orbit whenever a preset is chosen
    const gd = graphDivRef.current;
    if (gd) {
      import("plotly.js/dist/plotly")
        .then((mod) => mod.default.relayout(gd, { "scene.dragmode": "orbit" } as never))
        .catch((err) => console.error("Unable to reset dragmode", err));
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        document.activeElement.tagName !== "BODY" &&
        !containerRef.current?.contains(document.activeElement)
      ) {
        return;
      }

      let azimuthDelta = 0;
      let elevationDelta = 0;
      const speed = rotationSpeedRef.current;

      switch (e.key) {
        case "ArrowLeft":
          azimuthDelta = speed;
          break;
        case "ArrowRight":
          azimuthDelta = -speed;
          break;
        case "ArrowUp":
          elevationDelta = -speed;
          break;
        case "ArrowDown":
          elevationDelta = speed;
          break;
        default:
          return;
      }

      e.preventDefault();
      const current = cameraRef.current;
      const newEye = rotateCamera(current.eye, azimuthDelta, elevationDelta);
      setCamera({ eye: newEye, up: current.up, center: current.center });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (relayoutRafRef.current !== null) {
        cancelAnimationFrame(relayoutRafRef.current);
        relayoutRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const el = chartWrapperRef.current;
    if (!el) return;

    // Stops the page from scrolling while the pointer is over the chart
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <div className="space-y-4" ref={containerRef} tabIndex={0}>
      <div
        ref={chartWrapperRef}
        className="panel-bg rounded border border-neutral-200 dark:border-neutral-700"
        style={{ overscrollBehavior: "contain" }}
      >
        <PlotlyWrapper
          onInitialized={handleInitialized}
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
                line: { color: "rgba(0,0,0,0.2)", width: 0.5 },
              },
              customdata: barData.representativeFrameIndices,
              hovertemplate:
                "Hue: %{x:.0f}°<br>Light: %{y:.2f}<br>Count: %{z}<extra></extra>",
            },
          ]}
          layout={{
            title: { text: title, font: { size: 14 } },
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
              camera,
              aspectmode: "manual",
              aspectratio: { x: 1.5, y: 1, z: 0.8 },
            },
            margin: { l: 0, r: 0, t: 50, b: 0 },
            paper_bgcolor: "transparent",
            font: { color: "#666" },
            autosize: true,
            uirevision: `hue-light-3d-${cameraRevision}`,
          }}
          config={{
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: [
              "lasso2d",
              "select2d",
              "resetCameraDefault3d",
              "resetCameraLastSave3d",
              "tableRotation",
            ],
            toImageButtonOptions: {
              format: "png",
              filename: title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_|_$/g, ""),
              height: 800,
              width: 1000,
              scale: 2,
            },
          }}
          onRelayout={(event: Record<string, unknown>) => {
            const cam = event["scene.camera"] as
              | { eye?: Vec3; up?: Vec3; center?: Vec3 }
              | undefined;
            if (!cam?.eye) return;

            pendingCamRef.current = cam;
            if (relayoutRafRef.current !== null) return;

            relayoutRafRef.current = requestAnimationFrame(() => {
              relayoutRafRef.current = null;
              const pending = pendingCamRef.current;
              if (!pending?.eye) return;

              const next: CameraValue = {
                eye: { ...pending.eye },
                up: pending.up ? { ...pending.up } : cameraRef.current.up,
                center: pending.center ? { ...pending.center } : cameraRef.current.center,
              };

              setCamera((prev) => (sameCamera(prev, next) ? prev : next));
            });
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
          style={{ width: "100%", height: "550px" }}
        />
      </div>

      <div className="bg-neutral-100 dark:bg-neutral-900 rounded p-4 space-y-4">
        <h4 className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
          Plot Configuration
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

          <div className="space-y-2">
            <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-1">
              Camera Views:
            </div>
            <div className="grid grid-cols-2 gap-1">
              {VISIBLE_CAMERA_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => handlePresetChange(preset)}
                  className="px-2 py-1 text-xs rounded border transition-colors hover:bg-[var(--surface-hover)]"
                  style={getPresetButtonStyle(cameraPreset === preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

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
          <span className="text-xs kalmus-text-secondary w-8">{rotationSpeed}°</span>
          <span className="text-xs kalmus-text-muted ml-4">
            Use arrow keys to rotate view
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <span>
          Showing {barData.counts.length.toLocaleString()} bins with{" "}
          {barData.counts.reduce((a, b) => a + b, 0).toLocaleString()} total samples
        </span>
        <span>Max count per bin: {barData.maxCount.toLocaleString()}</span>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        3D visualization showing color distribution by Hue (x-axis), Lightness
        (y-axis), and frequency (z-axis/size). Marker size represents the count of
        colors in each bin. Drag to rotate, scroll to zoom.
      </p>
    </div>
  );
}