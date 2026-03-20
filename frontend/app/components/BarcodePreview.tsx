"use client";

import { useRef, useEffect, useState } from "react";
import { RGB } from "@/lib/barcode-utils";

interface BarcodePreviewProps {
  barcode: RGB[][] | number[][];
  barcodeType: "Color" | "Brightness";
  title?: string;
  fps?: number;
  sampledFrameRate?: number;
  skipOver?: number;
  totalFrames?: number;
}

export default function BarcodePreview({
  barcode,
  barcodeType,
  title = "Barcode Preview",
}: BarcodePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const check = () => setIsDark(root.classList.contains('dark'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // Render barcode to canvas
  useEffect(() => {
    if (!canvasRef.current || !barcode || barcode.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get barcode dimensions
    const height = barcode.length;
    const width = barcode[0]?.length || 0;

    if (width === 0 || height === 0) return;

    // Set canvas dimensions
    canvas.width = width;
    canvas.height = height;
    setDimensions({ width, height });

    // Create image data
    const imageData = ctx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const pixel = barcode[y][x];

        if (barcodeType === "Color" && Array.isArray(pixel)) {
          // RGB color
          const [r, g, b] = pixel as RGB;
          imageData.data[idx] = r;
          imageData.data[idx + 1] = g;
          imageData.data[idx + 2] = b;
          imageData.data[idx + 3] = 255;
        } else {
          // Brightness (grayscale)
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

  const zoomLevels = [0.5, 1, 2, 4, 8];

  return (
    <div className="panel border border-amber-500/20 rounded-lg overflow-hidden relative">
      {/* Decorative corners */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-amber-500/40 z-10" />
      <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-amber-500/40 z-10" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-amber-500/40 z-10" />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-amber-500/40 z-10" />
      
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/20 bg-black/40">
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-amber-500/70"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <div>
            <h3 className="text-sm font-mono text-amber-100/90">
              {title.toUpperCase().replace(/ /g, '_')}
            </h3>
            <p className="text-xs text-amber-500/50 font-mono">
              {dimensions.width} x {dimensions.height} px
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 mr-2">
            <span className="text-xs text-amber-500/50 font-mono mr-1">
              ZOOM:
            </span>
            {zoomLevels.map((level) => (
              <button
                key={level}
                onClick={() => setZoom(level)}
                className={`px-2 py-1 text-xs font-mono rounded transition-all duration-200 ${
                  zoom === level
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                    : "bg-black/40 text-neutral-400 border border-amber-500/10 hover:border-amber-500/30 hover:text-amber-400/80"
                }`}
              >
                {level}x
              </button>
            ))}
          </div>

          {/* Download Button */}
          <button
            onClick={handleDownload}
            className="p-2 text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10 border border-transparent hover:border-cyan-500/30 rounded transition-all duration-200"
            title="Download PNG"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </button>

        </div>
      </div>

      {/* Canvas Container */}
      <div
        ref={containerRef}
        className="overflow-x-auto overflow-y-hidden bg-black/60 p-4"
        style={{ maxHeight: "400px" }}
      >
        <div
          className="inline-block border border-amber-500/20 shadow-[0_0_20px_rgba(212,165,116,0.1)]"
          style={{
            imageRendering: zoom >= 2 ? "pixelated" : "auto",
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              width: dimensions.width * zoom,
              height: dimensions.height * zoom,
              display: "block",
              imageRendering: zoom >= 2 ? "pixelated" : "auto",
            }}
          />
        </div>
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2 border-t border-amber-500/20 bg-black/40">
        <p className="text-xs text-neutral-500 font-mono">
          // {barcodeType === "Color"
            ? "Color barcode showing temporal color distribution. Each column = frames, each row = time segment."
            : "Brightness barcode showing temporal brightness distribution."}
        </p>
      </div>
    </div>
  );
}
