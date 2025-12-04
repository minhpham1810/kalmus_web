"use client";

import { useState } from "react";
import FileUpload from "./FileUpload";
import ConfigPanel from "./ConfigPanel";

export interface BarcodeConfig {
  color_metric: string;
  frame_type: string;
  barcode_type: string;
  sampled_rate: number;
  skip_over: number;
  total_frames: number;
  frames_per_column: number;
  partition?: string;
  email?: string;
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
    partition: "short",
    email: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setSubmitted(false);
    setError(null);
    setJobId(null);
  };

  const handleConfigChange = (newConfig: Partial<BarcodeConfig>) => {
    setConfig((prev) => ({ ...prev, ...newConfig }));
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      setError("Please select a video file first");
      return;
    }

    if (!config.email || !config.email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append("video", selectedFile);
    formData.append("color_metric", config.color_metric);
    formData.append("frame_type", config.frame_type);
    formData.append("barcode_type", config.barcode_type);
    formData.append("sampled_rate", config.sampled_rate.toString());
    formData.append("skip_over", config.skip_over.toString());
    formData.append("total_frames", config.total_frames.toString());
    formData.append("frames_per_column", config.frames_per_column.toString());
    formData.append("partition", config.partition || "short");
    formData.append("email", config.email);

    try {
      const response = await fetch(`${API_BASE}/api/generate-barcode`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit job");
      }

      setJobId(data.jobId);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewUpload = () => {
    setSelectedFile(null);
    setSubmitted(false);
    setJobId(null);
    setError(null);
    setConfig({
      ...config,
      email: config.email, // Keep email
    });
  };

  return (
    <div className="space-y-6">
      {!submitted ? (
        <>
          <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded p-6">
            <h2 className="text-sm font-medium mb-4 text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
              Video Upload
            </h2>
            <FileUpload
              onFileSelect={handleFileSelect}
              selectedFile={selectedFile}
            />
          </div>

          {selectedFile && (
            <>
              <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded p-6">
                <h2 className="text-sm font-medium mb-4 text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
                  Configuration
                </h2>
                <ConfigPanel config={config} onConfigChange={handleConfigChange} />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !config.email}
                  className="px-6 py-2.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium rounded hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-neutral-900 dark:disabled:hover:bg-neutral-100"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
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
                      Submitting...
                    </span>
                  ) : (
                    "Submit Job"
                  )}
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded p-8">
          <div>
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-10 h-10 bg-neutral-900 dark:bg-neutral-100 rounded-full mb-4">
                <svg
                  className="w-5 h-5 text-white dark:text-neutral-900"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-light text-neutral-900 dark:text-neutral-100 mb-2">
                Job Submitted
              </h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Your video is being processed on the HPC cluster.
              </p>
            </div>

            <div className="border-l-2 border-neutral-300 dark:border-neutral-600 pl-4 mb-6 space-y-3">
              <div className="text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">Partition:</span>{" "}
                <span className="text-neutral-900 dark:text-neutral-100">{config.partition}</span>
              </div>
              <div className="text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">Email:</span>{" "}
                <span className="text-neutral-900 dark:text-neutral-100">{config.email}</span>
              </div>
              <div className="text-sm">
                <span className="text-neutral-500 dark:text-neutral-400">Expected time:</span>{" "}
                <span className="text-neutral-900 dark:text-neutral-100">1-10 minutes</span>
              </div>
              {jobId && (
                <div className="text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">Job ID:</span>{" "}
                  <code className="text-xs font-mono text-neutral-900 dark:text-neutral-100">
                    {jobId.substring(0, 8)}
                  </code>
                </div>
              )}
            </div>

            <div className="bg-neutral-100 dark:bg-neutral-900 rounded p-4 mb-6">
              <p className="text-sm text-neutral-600 dark:text-neutral-300">
                You'll receive an email with your barcode image, data file, and processing statistics. You can close this page.
              </p>
            </div>

            <button
              onClick={handleNewUpload}
              className="px-5 py-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium rounded hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
            >
              Process Another Video
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded p-4">
          <p className="text-sm text-neutral-900 dark:text-neutral-100">{error}</p>
        </div>
      )}
    </div>
  );
}
