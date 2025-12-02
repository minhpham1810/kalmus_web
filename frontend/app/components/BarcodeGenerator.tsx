"use client";

import { useState, useEffect, useRef } from "react";
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
  partition?: string;
  email?: string;
}

export interface JobStatus {
  status: string;
  slurmJobId: string;
  submittedAt: string;
  timeUsed?: string;
  timeLeft?: string;
  reason?: string;
  completed: boolean;
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
    partition: "short",
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [result, setResult] = useState<BarcodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

  // Poll for job status
  const pollJobStatus = async (jobId: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/job-status/${jobId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to check job status");
      }

      setJobStatus(data);

      // If job is completed, fetch the result
      if (data.completed) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }

        if (data.status === "SUCCESS" || data.status.includes("COMPLETED")) {
          await fetchJobResult(jobId);
        } else {
          setError(`Job failed with status: ${data.status}`);
          setIsProcessing(false);
        }
      }
    } catch (err) {
      console.error("Error polling job status:", err);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      setError(
        err instanceof Error ? err.message : "Failed to check job status"
      );
      setIsProcessing(false);
    }
  };

  // Fetch job result
  const fetchJobResult = async (jobId: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/job-result/${jobId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get job result");
      }

      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || "Job processing failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get job result");
    } finally {
      setIsProcessing(false);
    }
  };

  // Cancel job
  const handleCancelJob = async () => {
    if (!currentJobId) return;

    try {
      const response = await fetch(`${API_BASE}/api/job/${currentJobId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to cancel job");
      }

      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }

      setIsProcessing(false);
      setJobStatus(null);
      setCurrentJobId(null);
      setError("Job cancelled by user");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel job");
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setResult(null);
    setError(null);
    setJobStatus(null);
    setCurrentJobId(null);
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
    setJobStatus(null);

    const formData = new FormData();
    formData.append("video", selectedFile);
    formData.append("color_metric", config.color_metric);
    formData.append("frame_type", config.frame_type);
    formData.append("barcode_type", config.barcode_type);
    formData.append("sampled_rate", config.sampled_rate.toString());
    formData.append("skip_over", config.skip_over.toString());
    formData.append("total_frames", config.total_frames.toString());
    formData.append("frames_per_column", config.frames_per_column.toString());

    if (config.partition) {
      formData.append("partition", config.partition);
    }

    if (config.email) {
      formData.append("email", config.email);
    }

    try {
      const response = await fetch(`${API_BASE}/api/generate-barcode`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit job");
      }

      // Job submitted successfully, start polling
      setCurrentJobId(data.jobId);

      // Start polling for job status every 5 seconds
      pollingIntervalRef.current = setInterval(() => {
        pollJobStatus(data.jobId);
      }, 5000);

      // Poll immediately for initial status
      await pollJobStatus(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
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
                "Submit Job"
              )}
            </button>
          </div>
        </>
      )}

      {isProcessing && jobStatus && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-blue-900 dark:text-blue-300">
              Job Status
            </h3>
            <button
              onClick={handleCancelJob}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
            >
              Cancel Job
            </button>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-blue-700 dark:text-blue-300">Job ID:</span>
              <span className="font-mono text-blue-900 dark:text-blue-100">
                {currentJobId?.substring(0, 8)}...
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-blue-700 dark:text-blue-300">
                SLURM Job ID:
              </span>
              <span className="font-mono text-blue-900 dark:text-blue-100">
                {jobStatus.slurmJobId}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-blue-700 dark:text-blue-300">Status:</span>
              <span className="font-semibold text-blue-900 dark:text-blue-100">
                {jobStatus.status}
              </span>
            </div>

            {jobStatus.timeUsed && (
              <div className="flex justify-between">
                <span className="text-blue-700 dark:text-blue-300">
                  Time Used:
                </span>
                <span className="text-blue-900 dark:text-blue-100">
                  {jobStatus.timeUsed}
                </span>
              </div>
            )}

            {jobStatus.timeLeft && (
              <div className="flex justify-between">
                <span className="text-blue-700 dark:text-blue-300">
                  Time Left:
                </span>
                <span className="text-blue-900 dark:text-blue-100">
                  {jobStatus.timeLeft}
                </span>
              </div>
            )}

            {jobStatus.reason && (
              <div className="flex justify-between">
                <span className="text-blue-700 dark:text-blue-300">
                  Reason:
                </span>
                <span className="text-blue-900 dark:text-blue-100">
                  {jobStatus.reason}
                </span>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 text-blue-800 dark:text-blue-200">
              <svg
                className="animate-spin h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>
                {jobStatus.status === "PENDING"
                  ? "Waiting in queue..."
                  : jobStatus.status === "RUNNING"
                  ? "Processing video on compute node..."
                  : "Checking status..."}
              </span>
            </div>
          </div>
        </div>
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
