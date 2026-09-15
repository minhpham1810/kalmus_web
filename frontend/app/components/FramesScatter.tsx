"use client";
import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { toPng } from "html-to-image";
import {
  RGB,
  rgbToHsv,
  ThumbnailManifest,
  findClosestThumbnail,
} from "@/lib/barcode-utils";
interface FramesScatterProps {
  colors: RGB[];
  thumbnails?: ThumbnailManifest | null;
  title?: string;
  frameIndexOffset?: number;
  sampledFrameRate?: number;
  skipOver?: number;
}
const SATURATION_THRESHOLD = 0.3;
// Hue bucket (degees)
const HUE_BIN_DEGREES = 10;
// Max frames per ligthness*hue
const MAX_PER_CELL = 3;
const FRAME_W = 36;
const FRAME_H = 21;
const HOVER_SCALE = 10;
const JITTER_PCT = 2.2;
const PAD_LEFT = 64;
const PAD_BOTTOM = 52;
const PAD_TOP = 16;
const PAD_RIGHT = 16;
interface PlottedFrame {
  key: string;
  hue: number;
  light: number;
  jitterX: number;
  jitterY: number;
  frameIndex: number;
  sheetUrl: string;
  sheetW: number;
  sheetH: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}
// random seed
function seededRandom(seed: number): number {
  let h = (seed + 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
function seededJitter(seed: number): { jx: number; jy: number } {
  let h = (seed + 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  const a = ((h >>> 0) % 1000) / 1000;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  const b = ((h >>> 0) % 1000) / 1000;
  return { jx: (a * 2 - 1) * JITTER_PCT, jy: (b * 2 - 1) * JITTER_PCT };
}
export default function FramesScatter({
  colors,
  thumbnails = null,
  title = "Frames Scatter",
  frameIndexOffset = 0,
  sampledFrameRate,
  skipOver = 0,
}: FramesScatterProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [plotSize, setPlotSize] = useState({ w: 0, h: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [exportState, setExportState] = useState<"idle" | "working" | "done" | "error">("idle");
  // randomized seed
  const [randomSeed, setRandomSeed] = useState(() => Math.floor(Math.random() * 1_000_000));

  /*
  * Frame picker for plotting
  *  - filtering --> if above SATURATION_THRESHOLD
  *  - bucketing --> hue is rounded to nearest HUE_BIN_DEGREE; lightness to the
  *                  nearest .1
  *  - capping -->
  */
  const frames = useMemo<PlottedFrame[]>(() => {
    if (!thumbnails?.enabled || thumbnails.count === 0) return [];
    // saturaation filnter
    const survivors: number[] = [];
    colors.forEach((rgb, index) => {
      const [, s] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      if (s >= SATURATION_THRESHOLD) survivors.push(index);
    });
    const cells = new Map<string, number[]>();
    for (const index of survivors) {
      const rgb = colors[index];
      const [h, , v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      const hueGrade = Math.round(h / HUE_BIN_DEGREES);
      const lightBand = Math.floor(v * 10);
      const key = `${hueGrade}:${lightBand}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key)!.push(index);
    }
    const capped: number[] = [];
    for (const indices of cells.values()) {
      if (indices.length <= MAX_PER_CELL) {
        capped.push(...indices);
      } else {
        const pool = [...indices];
        const seedBase = indices[0] + randomSeed;
        for (let k = 0; k < MAX_PER_CELL; k++) {
          const r = Math.floor(seededRandom(seedBase + k) * pool.length);
          capped.push(pool[r]);
          pool.splice(r, 1);
        }
      }
    }
    // plot thumbnail
    const result: PlottedFrame[] = [];
    for (const index of capped) {
      const rgb = colors[index];
      const [h, , v] = rgbToHsv(rgb[0], rgb[1], rgb[2]);
      const absoluteIndex = index + frameIndexOffset;
      const sourceFrameIndex =
        sampledFrameRate !== undefined
          ? skipOver + absoluteIndex * sampledFrameRate
          : absoluteIndex;
      const thumb = findClosestThumbnail(thumbnails, sourceFrameIndex);
      if (!thumb) continue;
      const sheet = thumbnails.sheets.find((s) => s.index === thumb.sheet_index);
      if (!sheet?.url) continue;
      const { jx, jy } = seededJitter(absoluteIndex);
      result.push({
        key: `${absoluteIndex}`,
        hue: h,
        light: v,
        jitterX: jx,
        jitterY: jy,
        frameIndex: absoluteIndex,
        sheetUrl: sheet.url,
        sheetW: sheet.width,
        sheetH: sheet.height,
        sx: thumb.x,
        sy: thumb.y,
        sw: thumb.width,
        sh: thumb.height,
      });
    }
    return result;
  }, [colors, thumbnails, sampledFrameRate, skipOver, frameIndexOffset, randomSeed]);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setPlotSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [frames.length]);

  //re-randomized frame picks --> come back to it after talking to Faden
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setRandomSeed(Math.floor(Math.random() * 1_000_000));
    });
    return () => cancelAnimationFrame(id);
  }, [frameIndexOffset, colors.length]);
  // PNG export
  const handleExport = useCallback(async () => {
    if (!exportRef.current) return;
    setExportState("working");
    try {
      const dataUrl = await toPng(exportRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        fetchRequestInit: {mode: "cors", credentials: "same-origin"},
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      });
      const link = document.createElement("a");
      link.download = `${title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")}.png`;
      link.href = dataUrl;
      link.click();
      setExportState("done");
      setTimeout(() => setExportState("idle"), 2500);
    } catch (e) {
      console.error("Export failed", e);
      setExportState("error");
      setTimeout(() => setExportState("idle"), 4000);
    }
  }, [title]);
  const hueTicks = [0, 60, 120, 180, 240, 300, 360];
  const lightTicks = [0, 0.25, 0.5, 0.75, 1];
  const spriteStyle = (
    f: PlottedFrame,
    scaleW: number,
    scaleH: number
  ): React.CSSProperties => {
    const ratioX = scaleW / f.sw;
    const ratioY = scaleH / f.sh;
    return {
      backgroundImage: `url(${f.sheetUrl})`,
      backgroundSize: `${f.sheetW * ratioX}px ${f.sheetH * ratioY}px`,
      backgroundPosition: `-${f.sx * ratioX}px -${f.sy * ratioY}px`,
      backgroundRepeat: "no-repeat",
    };
  };
  const iconButtonClass =
    "p-1.5 rounded transition-colors border border-[var(--input-border)] kalmus-text-secondary hover:border-[var(--accent-amber)] hover:text-[var(--text-primary)]";
  return (
    <div className="space-y-4">
      <div
        ref={containerRef}
        className="panel-bg rounded border border-neutral-200 dark:border-neutral-700 p-4"
      >
        {/* Header */}
        <div className="relative flex items-center justify-center mb-3">
          <p className="text-sm font-medium" style={{ color: "#444" }}>
            {title}
          </p>
          <div className="absolute right-0 flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled = {exportState === "working"}
              aria-label="Download PNG"
              title="Download PNG"
              className={iconButtonClass}
              style = {{opacity: exportState === "working" ? 0.5: 1}}
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
        {frames.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-mono text-xs kalmus-text-secondary">
              {thumbnails?.enabled
                ? "No frames passed the saturation filter."
                : "Frame thumbnails are not available for this visualization."}
            </p>
          </div>
        ) : (
          <div
            ref={exportRef}
            className="relative w-full"
            style={{
              height: 520,
              paddingLeft: PAD_LEFT,
              paddingRight: PAD_RIGHT,
              paddingTop: PAD_TOP,
              paddingBottom: PAD_BOTTOM,
            }}
          >
            <div ref={plotRef} className="relative w-full h-full">
              {/* Lightness (Y) gridlines + ticks */}
              {lightTicks.map((t) => (
                <div
                  key={`y-${t}`}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: `${t * 100}%`,
                    height: 1,
                    background: "rgba(128,128,128,0.18)",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: -PAD_LEFT + 30,
                      top: -6,
                      fontFamily: "monospace",
                      fontSize: 10,
                      color: "rgba(130,130,130,0.8)",
                    }}
                  >
                    {t.toFixed(2)}
                  </span>
                </div>
              ))}
              {/* Hue (X) gridlines + ticks */}
              {hueTicks.map((t) => (
                <div
                  key={`x-${t}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${(t / 360) * 100}%`,
                    width: 1,
                    background: "rgba(128,128,128,0.18)",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      bottom: -PAD_BOTTOM + 24,
                      left: -8,
                      fontFamily: "monospace",
                      fontSize: 10,
                      color: "rgba(130,130,130,0.8)",
                    }}
                  >
                    {t}
                  </span>
                </div>
              ))}
              {/* Frames */}
              {frames.map((f) => {
                const isHovered = hovered === f.key;
                const xPct = Math.max(0, Math.min(100, (f.hue / 360) * 100 + f.jitterX));
                const yPct = Math.max(0, Math.min(100, f.light * 100 + f.jitterY));
                const dx = ((50 - xPct) / 100) * plotSize.w;
                const dy = (-(50 - yPct) / 100) * plotSize.h;
                return (
                  <div
                    key={f.key}
                    onMouseEnter={() => setHovered(f.key)}
                    onMouseLeave={() =>
                      setHovered((cur) => (cur === f.key ? null : cur))
                    }
                    style={{
                      position: "absolute",
                      left: `${xPct}%`,
                      bottom: `${yPct}%`,
                      width: FRAME_W,
                      height: FRAME_H,
                      marginLeft: -FRAME_W / 2,
                      marginBottom: -FRAME_H / 2,
                      zIndex: isHovered ? 50 : 1,
                      cursor: "pointer",
                    }}
                    title={`Frame ${f.frameIndex} · Hue ${Math.round(
                      f.hue
                    )}° · Light ${f.light.toFixed(2)}`}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        ...spriteStyle(f, FRAME_W, FRAME_H),
                        transform: isHovered
                          ? `translate(${dx}px, ${dy}px) scale(${HOVER_SCALE})`
                          : "scale(1)",
                        transformOrigin: "center center",
                        transition: "transform 200ms ease",
                        pointerEvents: "none",
                      }}
                    />
                  </div>
                );
              })}
            </div>
            {/* Axis labels */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: PAD_LEFT,
                right: PAD_RIGHT,
                textAlign: "center",
                fontFamily: "monospace",
                fontSize: 11,
                color: "rgba(130,130,130,0.9)",
              }}
            >
              Hue (0 - 360°)
            </div>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: PAD_TOP,
                bottom: PAD_BOTTOM,
                width: 14,
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
                textAlign: "center",
                fontFamily: "monospace",
                fontSize: 11,
                color: "rgba(130,130,130,0.9)",
              }}
            >
              Lightness (0 - 1)
            </div>
          </div>
        )}
      </div>
      {/* pgress bar for png*/}
      {exportState !== "idle" && (
      <div
        style={{
          height: 28,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 4px",
        }}
      >
        <div
          style={{
            flex: 1,
            height: 4,
            background: "rgba(128,128,128,0.2)",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: exportState === "working" ? "40%" : "100%",
              background:
                exportState === "error"
                  ? "var(--accent-crimson)"
                  : "var(--text-primary)",
              borderRadius: 2,
              transition: "width 300ms ease",
              animation:
                exportState === "working"
                  ? "framesscatter-indeterminate 1.2s ease-in-out infinite"
                  : "none",
            }}
          />
        </div>
        <span
          className="font-mono text-xs kalmus-text-secondary"
          style={{ whiteSpace: "nowrap" }}
        >
          {exportState === "working"
            ? "Downloading…"
            : exportState === "done"
            ? "Download ready"
            : "Download failed"}
        </span>
      </div>
      )}
      <style>{`
        @keyframes framesscatter-indeterminate {
          0%   { margin-left: -40%; }
          100% { margin-left: 100%; }
        }
      `}</style>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Ask about desc to prof Faden
      </p>
    </div>
  );
}