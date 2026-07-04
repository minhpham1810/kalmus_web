"use client";

import { useEffect, useRef } from "react";

export type BarcodePixel = [number, number, number] | number;

/** film metadata for film of the dat */
export interface FilmOfDayBarcode {
  barcode: BarcodePixel[][];
  barcodeType: "Color" | "Brightness";
}

/**
 * show film of the dat
 */
export default function BarcodeImagePreview({
  data,
  fixed,
}: {
  data: FilmOfDayBarcode;
  fixed?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const barcode = data.barcode;
    if (!canvas || barcode.length === 0) return;

    const height = barcode.length;
    const width = barcode[0]?.length || 0;
    if (width === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;
    const imageData = ctx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = barcode[y][x];
        const idx = (y * width + x) * 4;
        if (data.barcodeType === "Color" && Array.isArray(pixel)) {
          imageData.data[idx] = pixel[0];
          imageData.data[idx + 1] = pixel[1];
          imageData.data[idx + 2] = pixel[2];
        } else {
          const gray = typeof pixel === "number" ? pixel : pixel[0] || 0;
          imageData.data[idx] = gray;
          imageData.data[idx + 1] = gray;
          imageData.data[idx + 2] = gray;
        }
        imageData.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [data]);

  return (
    <div className="pt-5">
      <canvas
        ref={canvasRef}
        aria-label="Film of the Day barcode preview"
        className={fixed ? "block" : "block w-full h-auto"}
        style={{
          ...(fixed ? { width: "100%", height: "100%" } : {}),
          border: "1px solid rgba(100,100,100,0.25)",
          imageRendering: "auto",
        }}
      />
    </div>
  );
}