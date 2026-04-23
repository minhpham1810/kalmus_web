"use client";

import { useRef, useEffect, useState, useCallback, type ReactNode } from "react";
import { RGB, ThumbnailEntry, ThumbnailManifest, ThumbnailSheet } from "@/lib/barcode-utils";

// ── Time Ruler ────────────────────────────────────────────────────────────────

interface TimeRulerProps {
  totalColorFrames: number;
  sampledFrameRate: number;
  fps: number;
  skipOver: number;
  canvasWidth: number;
  zoom: number;
  startFrac: number;
  endFrac: number;
}

function TimeRuler({
  totalColorFrames,
  sampledFrameRate,
  fps,
  skipOver,
  canvasWidth,
  zoom,
  startFrac,
  endFrac,
}: TimeRulerProps) {
  const startSeconds = skipOver / fps;
  const totalDuration = ((totalColorFrames - 1) * sampledFrameRate) / fps;
  if (totalDuration <= 0 || canvasWidth === 0) return null;

  const pixelWidth = canvasWidth * zoom;

  let majorInterval: number;
  let minorInterval: number;
  if (totalDuration <= 120) {
    majorInterval = 30; minorInterval = 10;
  } else if (totalDuration <= 600) {
    majorInterval = 60; minorInterval = 15;
  } else if (totalDuration <= 3600) {
    majorInterval = 300; minorInterval = 60;
  } else {
    majorInterval = 600; minorInterval = 120;
  }

  const ticks: Array<{ t: number; frac: number; major: boolean }> = [];
  const firstTickOffset =
    Math.ceil(startSeconds / minorInterval) * minorInterval - startSeconds;

  for (
    let offset = firstTickOffset;
    offset <= totalDuration + minorInterval * 0.01;
    offset += minorInterval
  ) {
    const frac = offset / totalDuration;
    if (frac > 1.001) break;
    const absTime = startSeconds + offset;
    ticks.push({
      t: absTime,
      frac: Math.min(frac, 1),
      major: Math.abs(absTime % majorInterval) < minorInterval * 0.02,
    });
  }
  if (Math.abs(startSeconds % majorInterval) < minorInterval * 0.02) {
    ticks.unshift({ t: startSeconds, frac: 0, major: true });
  }

  return (
    <div style={{ position: "relative", width: pixelWidth, height: 28, flexShrink: 0 }}>
      {/* Baseline */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: "rgba(140,140,140,0.3)",
        }}
      />

      {ticks.map((tick, i) => {
        const inRange =
          tick.frac >= startFrac - 0.0005 && tick.frac <= endFrac + 0.0005;
        const lineColor = inRange
          ? "rgba(210,175,90,0.9)"
          : "rgba(140,140,140,0.4)";
        const textColor = inRange
          ? "rgba(210,175,90,0.85)"
          : "rgba(130,130,130,0.5)";

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${tick.frac * 100}%`,
              top: 0,
              bottom: 0,
              transform: "translateX(-50%)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: 1,
                height: tick.major ? 10 : 5,
                background: lineColor,
              }}
            />
            {tick.major && (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontFamily: "monospace",
                  fontSize: 9,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  color: textColor,
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              >
                {formatTimestamp(tick.t)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export interface BarcodePreviewData {
  thumbnail: ThumbnailEntry;
  sheet: ThumbnailSheet;
  rgb: RGB;
  avgRgb: RGB;
}

interface BarcodePreviewProps {
  barcode: RGB[][] | number[][];
  barcodeType: "Color" | "Brightness";
  title?: string;
  headerActions?: ReactNode;
  fps?: number;
  sampledFrameRate?: number;
  skipOver?: number;
  totalFrames?: number;
  thumbnails?: ThumbnailManifest | null;
  // Frame range selection
  frameRange?: [number, number];
  totalColorFrames?: number;
  onFrameRangeChange?: (range: [number, number]) => void;
  onPreviewChange?: (preview: BarcodePreviewData | null) => void;
  onPreviewPin?: (preview: BarcodePreviewData) => void;
}

function formatTimestamp(totalSeconds: number | null): string {
  if (totalSeconds === null || Number.isNaN(totalSeconds)) return "Time unavailable";

  const rounded = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function BarcodePreview({
  barcode,
  barcodeType,
  title = "Barcode Preview",
  headerActions,
  fps,
  sampledFrameRate,
  skipOver,
  thumbnails = null,
  frameRange,
  totalColorFrames,
  onFrameRangeChange,
  onPreviewChange,
  onPreviewPin,
}: BarcodePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const rulerContainerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  const dimensions = {
    width: barcode[0]?.length || 0,
    height: barcode.length || 0,
  };

  // Render barcode to canvas
  useEffect(() => {
    if (!canvasRef.current || !barcode || barcode.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const height = barcode.length;
    const width = barcode[0]?.length || 0;

    if (width === 0 || height === 0) return;

    canvas.width = width;
    canvas.height = height;
    const imageData = ctx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const pixel = barcode[y][x];

        if (barcodeType === "Color" && Array.isArray(pixel)) {
          const [r, g, b] = pixel as RGB;
          imageData.data[idx] = r;
          imageData.data[idx + 1] = g;
          imageData.data[idx + 2] = b;
          imageData.data[idx + 3] = 255;
        } else {
          const gray = typeof pixel === "number" ? pixel : (pixel as number[])[0] || 0;
          imageData.data[idx] = gray;
          imageData.data[idx + 1] = gray;
          imageData.data[idx + 2] = gray;
          imageData.data[idx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [barcode, barcodeType]);

  // Frame range helpers
  const fractionToIndex = useCallback(
    (f: number) =>
      Math.round(
        Math.max(0, Math.min(1, f)) * Math.max(0, (totalColorFrames ?? 1) - 1)
      ),
    [totalColorFrames]
  );

  const indexToFraction = (i: number) =>
    totalColorFrames && totalColorFrames > 1 ? i / (totalColorFrames - 1) : 0;

  const indexToTime = (idx: number): string => {
    if (!fps || !sampledFrameRate) return "";
    const actualFrame = (skipOver ?? 0) + idx * sampledFrameRate;
    return formatTimestamp(actualFrame / fps);
  };

  const commitStart = (value: string) => {
    const val = parseInt(value, 10);
    if (!isNaN(val) && frameRange && onFrameRangeChange) {
      const clamped = Math.max(0, Math.min(val, frameRange[1]));
      onFrameRangeChange([clamped, frameRange[1]]);
    }
  };

  const commitEnd = (value: string) => {
    const val = parseInt(value, 10);
    if (!isNaN(val) && frameRange && onFrameRangeChange) {
      const clamped = Math.max(frameRange[0], Math.min(val, (totalColorFrames ?? 1) - 1));
      onFrameRangeChange([frameRange[0], clamped]);
    }
  };

  const showRange =
    !!onFrameRangeChange && !!frameRange && !!totalColorFrames && totalColorFrames > 1;
  const startFrac = showRange ? indexToFraction(frameRange![0]) : 0;
  const endFrac = showRange ? indexToFraction(frameRange![1]) : 1;

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent, handle: "start" | "end") => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(handle);
  };

  useEffect(() => {
    if (!dragging || !onFrameRangeChange || !frameRange) return;

    const onMove = (e: MouseEvent) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const rect = overlay.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const idx = fractionToIndex(f);
      if (dragging === "start") {
        onFrameRangeChange([Math.min(idx, frameRange[1]), frameRange[1]]);
      } else {
        onFrameRangeChange([frameRange[0], Math.max(idx, frameRange[0])]);
      }
    };

    const onUp = () => setDragging(null);

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragging, frameRange, onFrameRangeChange, fractionToIndex]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    const link = document.createElement("a");
    link.download = `${slug}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  type PreviewPointerEvent = Pick<
    React.PointerEvent<HTMLCanvasElement>,
    "currentTarget" | "clientX" | "clientY"
  >;

  const buildPreview = useCallback(
    (event: PreviewPointerEvent): BarcodePreviewData | null => {
      if (
        !thumbnails?.enabled ||
        thumbnails.count === 0 ||
        dimensions.width === 0 ||
        dimensions.height === 0
      ) {
        return null;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;

      const barcodeX = Math.max(
        0,
        Math.min(
          dimensions.width - 1,
          Math.floor(((event.clientX - rect.left) / rect.width) * dimensions.width)
        )
      );
      const barcodeY = Math.max(
        0,
        Math.min(
          dimensions.height - 1,
          Math.floor(((event.clientY - rect.top) / rect.height) * dimensions.height)
        )
      );

      const normalizedPosition =
        (barcodeX * dimensions.height + barcodeY) / (dimensions.width * dimensions.height);
      const thumbnailIndex = Math.max(
        0,
        Math.min(
          thumbnails.count - 1,
          Math.round(normalizedPosition * Math.max(thumbnails.count - 1, 0))
        )
      );

      const thumbnail = thumbnails.thumbnails[thumbnailIndex];
      const sheet = thumbnails.sheets.find((entry) => entry.index === thumbnail?.sheet_index);
      if (!thumbnail || !sheet?.url) return null;

      const pixel = barcode[barcodeY][barcodeX];
      const rgb: RGB =
        barcodeType === "Color" && Array.isArray(pixel)
          ? (pixel as RGB)
          : [pixel as number, pixel as number, pixel as number];

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      for (let row = 0; row < dimensions.height; row++) {
        const p = barcode[row][barcodeX];
        if (Array.isArray(p)) {
          sumR += p[0];
          sumG += p[1];
          sumB += p[2];
        } else {
          sumR += p as number;
          sumG += p as number;
          sumB += p as number;
        }
      }

      const avgRgb: RGB = [
        Math.round(sumR / dimensions.height),
        Math.round(sumG / dimensions.height),
        Math.round(sumB / dimensions.height),
      ];

      return { thumbnail, sheet, rgb, avgRgb };
    },
    [barcode, barcodeType, dimensions.height, dimensions.width, thumbnails]
  );

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragging) return;
    const preview = buildPreview(event);
    onPreviewChange?.(preview);
  };

  const handlePointerLeave = () => {
    if (dragging) return;
    onPreviewChange?.(null);
  };

  const handlePointerCancel = () => {
    if (dragging) return;
    onPreviewChange?.(null);
  };

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragging) return;
    const preview = buildPreview(event as unknown as PreviewPointerEvent);
    if (preview) onPreviewPin?.(preview);
  };

  // Sync scroll between barcode canvas and ruler
  const handleCanvasScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (rulerContainerRef.current) {
      rulerContainerRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, []);

  const handleRulerScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, []);

  const showRuler =
    showRange &&
    !!fps &&
    !!sampledFrameRate &&
    !!totalColorFrames &&
    totalColorFrames > 1;

  const zoomLevels = [0.5, 1, 2, 4, 8];

  const isAtFullRange =
    !showRange ||
    (frameRange![0] === 0 && frameRange![1] === totalColorFrames! - 1);

  return (
    <div className="panel-bg border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-neutral-600 dark:text-neutral-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <div>
            <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {title}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {dimensions.width} x {dimensions.height} pixels
            </p>
            {thumbnails?.enabled && thumbnails.count > 0 && (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                Hover the barcode to preview captured thumbnails.
              </p>
            )}
            {showRange && (
              <p className="text-[11px] mt-1" style={{ color: "var(--accent-amber)" }}>
                Drag the handles to select a frame range.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {headerActions}

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 mr-2">
            <span className="text-xs text-neutral-500 dark:text-neutral-400 mr-1">
              Zoom:
            </span>
            {zoomLevels.map((level) => (
              <button
                key={level}
                onClick={() => setZoom(level)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  zoom === level
                    ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                    : "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600"
                }`}
              >
                {level}x
              </button>
            ))}
          </div>

          {/* Download Button */}
          <button
            onClick={handleDownload}
            className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
            title="Download PNG"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Canvas Container */}
      <div
        ref={containerRef}
        className="overflow-x-auto overflow-y-hidden bg-neutral-100 dark:bg-neutral-900 p-4"
        style={{ maxHeight: "400px" }}
        onScroll={handleCanvasScroll}
      >
        {/* Overlay wrapper: positions dim overlays and drag handles relative to the canvas */}
        <div
          ref={overlayRef}
          style={{
            position: "relative",
            display: "inline-block",
            cursor: dragging ? "ew-resize" : "default",
          }}
        >
          <div
            className="inline-block border border-neutral-300 dark:border-neutral-600 shadow-sm"
            style={{ imageRendering: zoom >= 2 ? "pixelated" : "auto" }}
          >
            <canvas
              ref={canvasRef}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              onPointerCancel={handlePointerCancel}
              onClick={handleClick}
              style={{
                width: dimensions.width * zoom,
                height: dimensions.height * zoom,
                display: "block",
                imageRendering: zoom >= 2 ? "pixelated" : "auto",
              }}
            />
          </div>

          {/* Left dim overlay */}
          {showRange && startFrac > 0 && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: `${startFrac * 100}%`,
                height: "100%",
                background: "rgba(0,0,0,0.48)",
                pointerEvents: "none",
              }}
            />
          )}

          {/* Right dim overlay */}
          {showRange && endFrac < 1 && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: `${endFrac * 100}%`,
                width: `${(1 - endFrac) * 100}%`,
                height: "100%",
                background: "rgba(0,0,0,0.48)",
                pointerEvents: "none",
              }}
            />
          )}

          {/* Start handle */}
          {showRange && (
            <div
              onMouseDown={(e) => handleMouseDown(e, "start")}
              title="Drag to set start frame"
              style={{
                position: "absolute",
                top: 0,
                left: `${startFrac * 100}%`,
                height: "100%",
                width: 6,
                cursor: "ew-resize",
                background: "var(--accent-amber)",
                transform: "translateX(-50%)",
                zIndex: 2,
                boxShadow: "0 0 4px rgba(0,0,0,0.5)",
              }}
            />
          )}

          {/* End handle */}
          {showRange && (
            <div
              onMouseDown={(e) => handleMouseDown(e, "end")}
              title="Drag to set end frame"
              style={{
                position: "absolute",
                top: 0,
                left: `${endFrac * 100}%`,
                height: "100%",
                width: 6,
                cursor: "ew-resize",
                background: "var(--accent-amber)",
                transform: "translateX(-50%)",
                zIndex: 2,
                boxShadow: "0 0 4px rgba(0,0,0,0.5)",
              }}
            />
          )}
        </div>
      </div>

      {/* Time ruler — scrolls in sync with the canvas */}
      {showRuler && (
        <div
          ref={rulerContainerRef}
          onScroll={handleRulerScroll}
          className="overflow-x-auto overflow-y-hidden bg-neutral-50 dark:bg-neutral-900 px-4"
          style={{
            borderTop: "1px solid rgba(120,120,120,0.15)",
            /* hide scrollbar — canvas scrollbar drives navigation */
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          <TimeRuler
            totalColorFrames={totalColorFrames!}
            sampledFrameRate={sampledFrameRate!}
            fps={fps!}
            skipOver={skipOver ?? 0}
            canvasWidth={dimensions.width}
            zoom={zoom}
            startFrac={startFrac}
            endFrac={endFrac}
          />
        </div>
      )}

      {/* Range label row */}
      {showRange && frameRange && (
        <div
          className="px-4 py-2 flex items-center justify-between gap-3"
          style={{
            borderTop: "1px solid var(--surface-border)",
            background: "var(--surface-bg-strong)",
          }}
        >
          {/* Start */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-[11px] kalmus-text-secondary flex-shrink-0">▸</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              defaultValue={frameRange?.[0] ?? 0}
              key={`start-${frameRange?.[0]}-${frameRange?.[1]}`}
              onBlur={(e) => commitStart(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && commitStart(e.currentTarget.value)}
              title="Start frame"
              className="font-mono text-[11px] bg-transparent text-center flex-shrink-0"
              style={{
                width: "4.5rem",
                border: "1px solid var(--input-border)",
                color: "var(--accent-amber)",
                padding: "1px 4px",
                outline: "none",
              }}
            />
            {fps && sampledFrameRate && (
              <span className="font-mono text-[11px] kalmus-text-muted truncate">
                {indexToTime(frameRange[0])}
              </span>
            )}
          </div>

          {/* Center */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="font-mono text-[10px] kalmus-text-muted tracking-wider uppercase whitespace-nowrap">
              {(frameRange[1] - frameRange[0] + 1).toLocaleString()} frames
            </span>
            {!isAtFullRange && (
              <button
                onClick={() => onFrameRangeChange!([0, totalColorFrames! - 1])}
                className="px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase transition-colors hover:opacity-80"
                style={{
                  border: "1px solid var(--input-border)",
                  color: "var(--accent-amber)",
                  background: "transparent",
                }}
              >
                Reset
              </button>
            )}
          </div>

          {/* End */}
          <div className="flex items-center gap-2 min-w-0 justify-end">
            {fps && sampledFrameRate && (
              <span className="font-mono text-[11px] kalmus-text-muted truncate">
                {indexToTime(frameRange[1])}
              </span>
            )}
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              defaultValue={frameRange?.[1] ?? 0}
              key={`end-${frameRange?.[0]}-${frameRange?.[1]}`}
              onBlur={(e) => commitEnd(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && commitEnd(e.currentTarget.value)}
              title="End frame"
              className="font-mono text-[11px] bg-transparent text-center flex-shrink-0"
              style={{
                width: "4.5rem",
                border: "1px solid var(--input-border)",
                color: "var(--accent-amber)",
                padding: "1px 4px",
                outline: "none",
              }}
            />
            <span className="font-mono text-[11px] kalmus-text-secondary flex-shrink-0">◂</span>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="px-4 py-2 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {barcodeType === "Color"
            ? "Color barcode showing the temporal color distribution of the video. Each column represents frames, each row a time segment."
            : "Brightness barcode showing the temporal brightness distribution of the video."}
        </p>
      </div>
    </div>
  );
}
