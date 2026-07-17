"use client";

import { useRef, useEffect, useState, useCallback, type ReactNode } from "react";
import {
  buildPreviewFromFrameIndex,
  type BarcodePreviewData,
  RGB,
  ThumbnailManifest,
} from "@/lib/barcode-utils";

export interface BarcodePreviewMovie {
  title: string;
  year?: string;
  posterUrl?: string | null;
  metadata: string[];
}

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

interface BarcodePreviewProps {
  barcode: RGB[][] | number[][];
  barcodeType: "Color" | "Brightness";
  movie?: BarcodePreviewMovie | null;
  detailLines?: string[];
  fallbackTitle?: string;
  downloadTitle?: string;
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
  movie = null,
  detailLines = [],
  fallbackTitle = "Video",
  downloadTitle = "barcode_preview",
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
  const [dragging, setDragging] = useState<"start" | "end" | "window" | null>(null);
  // save shift-hold state
  const windowDragRef = useRef<{
    grabFrac: number;
    startIdx: number;
    endIdx: number;
  } | null>(null);

  const [lastHandle, setLastHandle] = useState<"start" | "end">("start");

  const [shiftHeld, setShiftHeld] = useState(false);

  const getZoomButtonStyle = (isActive: boolean) => ({
    background: isActive ? "var(--foreground)" : "var(--surface-bg-strong)",
    color: isActive ? "var(--background)" : "var(--text-primary)",
    borderColor: isActive ? "var(--foreground)" : "var(--input-border)",
  });

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

    setLastHandle(handle);

    if (e.shiftKey && frameRange && overlayRef.current) {
      // remmebrs drga window
      const rect = overlayRef.current.getBoundingClientRect();
      const grabFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      windowDragRef.current = {
        grabFrac,
        startIdx: frameRange[0],
        endIdx: frameRange[1],
      };
      setDragging("window");
    } else {
      setDragging(handle);
    }
  };

  // wf
const keyStateRef = useRef({ frameRange, totalColorFrames, lastHandle, onFrameRangeChange });
useEffect(() => {
  keyStateRef.current = { frameRange, totalColorFrames, lastHandle, onFrameRangeChange };
}, [frameRange, totalColorFrames, lastHandle, onFrameRangeChange]);

useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

    const { frameRange, totalColorFrames, lastHandle, onFrameRangeChange } = keyStateRef.current;
    if (!onFrameRangeChange || !frameRange || !totalColorFrames) return;

    const maxIdx = totalColorFrames - 1;
    const STEP = 960;
    const dir = e.key === "ArrowRight" ? STEP : -STEP;
    const [start, end] = frameRange;

    e.preventDefault();

    if (e.shiftKey) {
      const width = end - start;
      let newStart = start + dir;
      newStart = Math.max(0, Math.min(newStart, maxIdx - width));
      onFrameRangeChange([newStart, newStart + width]);
    } else {
      if (lastHandle === "start") {
        const newStart = Math.max(0, Math.min(start + dir, end));
        onFrameRangeChange([newStart, end]);
      } else {
        const newEnd = Math.max(start, Math.min(end + dir, maxIdx));
        onFrameRangeChange([start, newEnd]);
      }
    }
  };

  const el = containerRef.current;
  if (!el) return;
  el.addEventListener("keydown", onKeyDown);
  return () => el.removeEventListener("keydown", onKeyDown);
}, []);

  useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Shift") setShiftHeld(true);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === "Shift") setShiftHeld(false);
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  };
}, []);

  const rafRef = useRef<number | null>(null);

useEffect(() => {
  if (!dragging || !onFrameRangeChange || !frameRange) return;

  const onMove = (e: MouseEvent) => {
    if (rafRef.current !== null) return;
    const clientX = e.clientX;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;

      const overlay = overlayRef.current;
      if (!overlay) return;
      const rect = overlay.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

      if (dragging === "window" && windowDragRef.current) {
        const { grabFrac, startIdx, endIdx } = windowDragRef.current;
        const currentIdx = fractionToIndex(f);
        const grabIdx = fractionToIndex(grabFrac);
        const width = endIdx - startIdx;
        const maxIdx = (totalColorFrames ?? 1) - 1;

        let delta = currentIdx - grabIdx;
        const newStart = startIdx + delta;
        if (newStart < 0) delta = -startIdx;
        const newEnd = endIdx + delta;
        if (newEnd > maxIdx) delta = maxIdx - endIdx;

        const finalStart = startIdx + delta;
        onFrameRangeChange([finalStart, finalStart + width]);
        return;
      }

      const idx = fractionToIndex(f);
      if (dragging === "start") {
        onFrameRangeChange([Math.min(idx, frameRange[1]), frameRange[1]]);
      } else {
        onFrameRangeChange([frameRange[0], Math.max(idx, frameRange[0])]);
      }
    });
  };

  const onUp = () => {
    setDragging(null);
    windowDragRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
  return () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };
}, [dragging, frameRange, onFrameRangeChange, fractionToIndex, totalColorFrames]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const slug = downloadTitle
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

      return buildPreviewFromFrameIndex({
        barcode,
        barcodeType,
        thumbnails,
        frameIndex: barcodeX * dimensions.height + barcodeY,
        sampledFrameRate,
        skipOver,
      });
    },
    [barcode, barcodeType, dimensions.height, dimensions.width, sampledFrameRate, skipOver, thumbnails]
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

  const zoomLevels = [1, 2, 4, 8];

  const isAtFullRange =
    !showRange ||
    (frameRange![0] === 0 && frameRange![1] === totalColorFrames! - 1);

  return (
    <div className="panel-bg border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-4 px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          {movie ? (
            <div className="kalmus-surface flex items-start gap-3 p-3">
              {movie.posterUrl ? (
                <img
                  src={movie.posterUrl}
                  alt={movie.title}
                  className="w-20 flex-shrink-0"
                  style={{
                    // maxHeight: "60px",
                    objectFit: "cover",
                    border: "1px solid var(--surface-border)",
                  }}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="font-mono text-base kalmus-text-primary truncate">
                  {movie.title}{" "}
                  {movie.year ? (
                    <span style={{ color: "var(--accent-amber)" }}>
                      ({movie.year})
                    </span>
                  ) : null}
                </p>
                {/* {movie.metadata.length > 0 && (
                  <p className="font-mono text-xs kalmus-text-secondary truncate mt-0.5">
                    {movie.metadata.join(" · ")}
                  </p>
                )} */}
                {detailLines.map((line) => (
                  <p
                    key={line}
                    className="font-mono text-sm kalmus-text-secondary truncate mt-0.5"
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div className="kalmus-surface px-3 py-2.5">
              <p className="font-mono text-xs tracking-[0.24em] uppercase kalmus-text-secondary">
                Barcode Preview
              </p>
              <p className="font-mono text-xs kalmus-text-primary truncate mt-1">
                {fallbackTitle}
              </p>
              {detailLines.map((line) => (
                <p
                  key={line}
                  className="font-mono text-xs kalmus-text-secondary truncate mt-0.5"
                >
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-end">
          <div className="flex items-center gap-1">
            <span className="text-xs text-neutral-500 dark:text-neutral-400 mr-1">
              Zoom:
            </span>
            {zoomLevels.map((level) => (
              <button
                key={level}
                onClick={() => setZoom(level)}
                className="px-2 py-1 text-xs rounded border transition-colors hover:bg-[var(--surface-hover)]"
                style={getZoomButtonStyle(zoom === level)}
              >
                {level}x
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded border border-[var(--surface-border)] bg-[var(--surface-bg)] p-1">
            {headerActions}
            <button
              onClick={handleDownload}
              className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
              title="Download PNG"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
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
      </div>

      {/* Canvas Container */}
      <div
        ref={containerRef}
        tabIndex = {0}
        className="overflow-x-auto overflow-y-hidden bg-neutral-100 dark:bg-neutral-900 p-4"
        style={{ maxHeight: "400px", outline: "none"}}
        onScroll={handleCanvasScroll}
      >
        {/* Overlay wrapper: positions dim overlays and drag handles relative to the canvas */}
        <div
          ref={overlayRef}
          style ={{
            position: "relative",
            display: "inline-block",
            cursor: dragging === "window" ? "grabbing" : dragging ? "ew-resize" : "default",
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

          {/* draggable range*/}
          {showRange && (
            <div
              onMouseDown={(e) => {
                if (!e.shiftKey || !frameRange || !overlayRef.current) return;
                e.preventDefault();
                e.stopPropagation();
                const rect = overlayRef.current.getBoundingClientRect();
                const grabFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                windowDragRef.current = {
                  grabFrac,
                  startIdx: frameRange[0],
                  endIdx: frameRange[1],
                };
                setDragging("window");
              }}
              title="Shift+drag to move the selected range"
              style={{
                position: "absolute",
                top: 0,
                left: `${startFrac * 100}%`,
                width: `${(endFrac - startFrac) * 100}%`,
                height: "100%",
                cursor: shiftHeld ? "grab" : "default",
                pointerEvents: shiftHeld ? "auto" : "none",
                zIndex: 1,
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
            <span className="font-mono text-xs kalmus-text-secondary flex-shrink-0">
              ▸
            </span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              defaultValue={frameRange?.[0] ?? 0}
              key={`start-${frameRange?.[0]}-${frameRange?.[1]}`}
              onBlur={(e) => commitStart(e.currentTarget.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && commitStart(e.currentTarget.value)
              }
              title="Start frame"
              className="font-mono text-xs bg-transparent text-center flex-shrink-0"
              style={{
                width: "4.5rem",
                border: "1px solid var(--input-border)",
                color: "var(--accent-amber)",
                padding: "1px 4px",
                outline: "none",
              }}
            />
            {fps && sampledFrameRate && (
              <span className="font-mono text-xs kalmus-text-muted truncate">
                {indexToTime(frameRange[0])}
              </span>
            )}
          </div>

          {/* Center */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="font-mono text-xs kalmus-text-muted tracking-wider uppercase whitespace-nowrap">
              {(frameRange[1] - frameRange[0] + 1).toLocaleString()} frames
            </span>
            {!isAtFullRange && (
              <button
                onClick={() => onFrameRangeChange!([0, totalColorFrames! - 1])}
                className="px-2 py-0.5 font-mono text-xs tracking-wider uppercase transition-colors hover:opacity-80"
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
              <span className="font-mono text-xs kalmus-text-muted truncate">
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
              onKeyDown={(e) =>
                e.key === "Enter" && commitEnd(e.currentTarget.value)
              }
              title="End frame"
              className="font-mono text-xs bg-transparent text-center flex-shrink-0"
              style={{
                width: "4.5rem",
                border: "1px solid var(--input-border)",
                color: "var(--accent-amber)",
                padding: "1px 4px",
                outline: "none",
              }}
            />
            <span className="font-mono text-xs kalmus-text-secondary flex-shrink-0">
              ◂
            </span>
          </div>
        </div>
      )}

      {/* Footer Info
      <div className="px-4 py-2 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
        <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {barcodeType === "Color"
              ? "Color barcode showing the temporal color distribution of the video. Each column represents frames, each row a time segment."
              : "Brightness barcode showing the temporal brightness distribution of the video."}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            <span>
              {dimensions.width} x {dimensions.height} pixels
            </span>
            {thumbnails?.enabled && thumbnails.count > 0 && (
              <span>Hover the barcode to preview captured thumbnails.</span>
            )}
            {showRange && (
              <span style={{ color: "var(--accent-amber)" }}>
                Drag the handles to select a frame range.
              </span>
            )}
          </div>
        </div>
      </div> */}
    </div>
  );
}
