"use client";

import { BarcodeResult } from "./BarcodeGenerator";
import { useEffect, useRef, useState } from "react";

interface BarcodeDisplayProps {
  result: BarcodeResult;
}

export default function BarcodeDisplay({ result }: BarcodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageUrl, setImageUrl] = useState<string>("");

  useEffect(() => {
    if (!result.barcode || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      const barcodeData = result.barcode.barcode;

      if (!barcodeData || barcodeData.length === 0) {
        console.error("No barcode data available");
        return;
      }

      const height = barcodeData.length;
      const width = barcodeData[0].length;
      const channels = barcodeData[0][0].length;

      canvas.width = width;
      canvas.height = height;

      const imageData = ctx.createImageData(width, height);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pixelIndex = (y * width + x) * 4;
          if (channels === 3) {
            imageData.data[pixelIndex] = barcodeData[y][x][0]; // R
            imageData.data[pixelIndex + 1] = barcodeData[y][x][1]; // G
            imageData.data[pixelIndex + 2] = barcodeData[y][x][2]; // B
            imageData.data[pixelIndex + 3] = 255; // A
          } else if (channels === 1) {
            const gray = barcodeData[y][x][0];
            imageData.data[pixelIndex] = gray;
            imageData.data[pixelIndex + 1] = gray;
            imageData.data[pixelIndex + 2] = gray;
            imageData.data[pixelIndex + 3] = 255;
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      setImageUrl(canvas.toDataURL());
    } catch (error) {
      console.error("Error rendering barcode:", error);
    }
  }, [result]);

  const handleDownloadJSON = () => {
    const dataStr = JSON.stringify(result.barcode, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.download_filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadImage = () => {
    if (!imageUrl) return;
    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = result.download_filename.replace(".json", ".png");
    link.click();
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
          Generated Barcode
        </h2>
        <div className="flex gap-3">
          <button
            onClick={handleDownloadJSON}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Download JSON
          </button>
          <button
            onClick={handleDownloadImage}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            disabled={!imageUrl}
          >
            <svg
              className="w-5 h-5"
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
            Download Image
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-3">
            Barcode Visualization
          </h3>
          <div className="border-2 border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-900">
            <canvas
              ref={canvasRef}
              className="w-full h-auto"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-3">
            Metadata
          </h3>
          <div className="space-y-3 bg-slate-50 dark:bg-slate-900 rounded-lg p-4">
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">
                Color Metric:
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {result.metadata.color_metric}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">
                Frame Type:
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {result.metadata.frame_type.replace(/_/g, " ")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">
                Barcode Type:
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {result.metadata.barcode_type}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">
                Sampled Rate:
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                1:{result.metadata.sampled_frame_rate}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">
                Total Frames Processed:
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {result.metadata.total_frames.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">
                Film Length:
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {result.metadata.film_length_in_frames.toLocaleString()} frames
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">
                Barcode Shape:
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {result.metadata.barcode_shape.join(" × ")}
              </span>
            </div>
          </div>

          <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-green-800 dark:text-green-200 text-sm">
              ✓ {result.message}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
