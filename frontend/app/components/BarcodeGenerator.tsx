"use client";

import { useState } from "react";
import FileUpload from "./FileUpload";
import ConfigPanel from "./ConfigPanel";
import BarcodeDisplay from "./BarcodeDisplay";

export interface BarcodeConfig {
  color_metric: string;
  frame_type: string;
  barcode_type: string;
  sampled_rate: number;
  skip_over: number;
  total_frames: number;
  frames_per_column: number;
}

export interface BarcodeResult {
  success: boolean;
  message: string;
  barcode: any;
  download_filename: string;
  metadata: {
    total_frames: number;
    film_length_in_frames: number;
    color_metric: string;
    frame_type: string;
    barcode_type: string;
    sampled_frame_rate: number;
    barcode_shape: number[];
  };
}

export default function BarcodeGenerator() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [config, setConfig] = useState<BarcodeConfig>({
    color_metric: "Average",
    frame_type: "Whole_frame",
    barcode_type: "Color",
    sampled_rate: 2,
    skip_over: 0,
    total_frames: 100000000,
    frames_per_column: 50,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<BarcodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setResult(null);
    setError(null);
  };

  const handleConfigChange = (newConfig: Partial<BarcodeConfig>) => {
    setConfig((prev) => ({ ...prev, ...newConfig }));
  };

  const handleGenerate = async () => {
    if (!selectedFile) {
      setError("Please select a video file first");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("video", selectedFile);
    formData.append("color_metric", config.color_metric);
    formData.append("frame_type", config.frame_type);
    formData.append("barcode_type", config.barcode_type);
    formData.append("sampled_rate", config.sampled_rate.toString());
    formData.append("skip_over", config.skip_over.toString());
    formData.append("total_frames", config.total_frames.toString());
    formData.append("frames_per_column", config.frames_per_column.toString());

    const API_BASE =
      process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:5000";

    try {
      const response = await fetch(`${API_BASE}/api/generate-barcode`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate barcode");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-semibold mb-4 text-slate-800 dark:text-slate-100">
          Upload Video
        </h2>
        <FileUpload
          onFileSelect={handleFileSelect}
          selectedFile={selectedFile}
        />
      </div>

      {selectedFile && (
        <>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-slate-800 dark:text-slate-100">
              Configuration
            </h2>
            <ConfigPanel config={config} onConfigChange={handleConfigChange} />
          </div>

          <div className="flex justify-center">
            <button
              onClick={handleGenerate}
              disabled={isProcessing}
              className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Processing...
                </span>
              ) : (
                "Generate Barcode"
              )}
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {result && <BarcodeDisplay result={result} />}
    </div>
  );
}
