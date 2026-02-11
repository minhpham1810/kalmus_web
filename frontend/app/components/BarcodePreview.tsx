"use client";

import { useRef, useEffect, useState } from "react";
import { RGB } from "@/lib/barcode-utils";

interface BarcodePreviewProps {
  barcode: RGB[][] | number[][];
  barcodeType: "Color" | "Brightness";
  title?: string;
  onClose?: () => void;
}

export default function BarcodePreview({
  barcode,
  barcodeType,
  title = "Barcode Preview",
  onClose,
}: BarcodePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

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
    const link = document.createElement("a");
    link.download = `barcode_${barcodeType.toLowerCase()}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  const zoomLevels = [0.5, 1, 2, 4, 8];

  return (
    <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
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
          </div>
        </div>

        <div className="flex items-center gap-2">
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

          {/* Close Button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
              title="Hide barcode"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Canvas Container */}
      <div
        ref={containerRef}
        className="overflow-auto bg-neutral-100 dark:bg-neutral-900 p-4"
        style={{ maxHeight: "400px" }}
      >
        <div
          className="inline-block border border-neutral-300 dark:border-neutral-600 shadow-sm"
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
