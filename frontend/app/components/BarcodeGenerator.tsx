"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "./FileUpload";
import ConfigPanel from "./ConfigPanel";
import MovieSearchInput, { MovieInfo } from "./MovieSearchInput";

export interface BarcodeConfig {
  color_metric: string;
  frame_type: string;
  barcode_type: string;
  sampled_rate: number;
  skip_over: number;
  total_frames: number;
  seconds_per_column: number;
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
    seconds_per_column: 2,
    partition: "short",
    email: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [movieInfo, setMovieInfo] = useState<MovieInfo | null>(null);
  const [existingAnalyses, setExistingAnalyses] = useState<
    { id: string; barcode_type: string; frame_type: string; metric: string }[]
  >([]);
  const abortRef = useRef<AbortController | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const router = useRouter();

  const movieStepComplete = movieInfo !== null && existingAnalyses.length === 0;
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setMovieInfo(null);
    setExistingAnalyses([]);
    setSubmitted(false);
    setError(null);
    setJobId(null);
  };

  const handleMovieChange = async (movie: MovieInfo | null) => {
    setMovieInfo(movie);
    setExistingAnalyses([]);
    if (!movie || !("imdb_id" in movie) || !movie.imdb_id) return;
    try {
      const res = await fetch(
        `/api/search-films?q=${encodeURIComponent(movie.imdb_id)}`
      );
      const data = await res.json();
      if (data.results?.length > 0) {
        setExistingAnalyses(data.results);
      }
    } catch {
      // silently ignore — don't block the upload flow
    }
  };

  const handleConfigChange = (newConfig: Partial<BarcodeConfig>) => {
    setConfig((prev) => ({ ...prev, ...newConfig }));
  };

  // Helper: Determine optimal chunk size based on file size
  const getOptimalChunkSize = (fileSize: number): number => {
    if (fileSize > 1 * 1024 * 1024 * 1024) return 25 * 1024 * 1024; // >1GB: 25MB chunks
    if (fileSize > 500 * 1024 * 1024) return 15 * 1024 * 1024;      // >500MB: 15MB chunks
    if (fileSize > 100 * 1024 * 1024) return 10 * 1024 * 1024;      // >100MB: 10MB chunks
    return 5 * 1024 * 1024;                                          // default: 5MB chunks
  };

  // Helper: Upload a single chunk with retry logic
  const uploadChunkWithRetry = async (
    chunkFormData: FormData,
    chunkIndex: number,
    maxRetries = 3,
    signal?: AbortSignal
  ): Promise<void> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(`${API_BASE}/api/upload-chunk`, {
          method: "POST",
          body: chunkFormData,
          signal,
        });

        if (response.ok) return;

        // Don't retry client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to upload chunk ${chunkIndex}`);
        }
      } catch (error) {
        lastError = error as Error;
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }

    throw lastError || new Error(`Failed to upload chunk ${chunkIndex} after ${maxRetries} retries`);
  };

  // Helper: Upload chunks in parallel with concurrency limit
  const uploadChunksParallel = async (
    file: File,
    uploadId: string,
    onProgress: (progress: number) => void,
    signal: AbortSignal
  ): Promise<number> => {
    const CHUNK_SIZE = getOptimalChunkSize(file.size);
    const CONCURRENT_UPLOADS = 4; // Upload 4 chunks at a time

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let completedChunks = 0;

    const uploadChunk = async (chunkIndex: number): Promise<void> => {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const chunkFormData = new FormData();
      chunkFormData.append("chunk", chunk);
      chunkFormData.append("uploadId", uploadId);
      chunkFormData.append("chunkIndex", chunkIndex.toString());
      chunkFormData.append("totalChunks", totalChunks.toString());
      chunkFormData.append("filename", file.name);

      await uploadChunkWithRetry(chunkFormData, chunkIndex, 3, signal);

      completedChunks++;
      onProgress(Math.round((completedChunks / totalChunks) * 100));
    };

    // Process chunks in batches
    const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i);

    for (let i = 0; i < chunkIndices.length; i += CONCURRENT_UPLOADS) {
      if (signal.aborted) throw new Error("Upload was cancelled");
      const batch = chunkIndices.slice(i, i + CONCURRENT_UPLOADS);
      await Promise.all(batch.map(uploadChunk));
    }

    return totalChunks;
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
    setUploadProgress(0);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      // Use chunked upload for files larger than 50MB
      const useChunkedUpload = selectedFile.size > 50 * 1024 * 1024;

      if (useChunkedUpload) {
        // Chunked upload with parallel processing
        const uploadId = crypto.randomUUID();

        await uploadChunksParallel(selectedFile, uploadId, setUploadProgress, abortController.signal);

        // After all chunks uploaded, assemble and submit job
        const assembleResponse = await fetch(`${API_BASE}/api/assemble-file`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uploadId,
            filename: selectedFile.name,
            config: {
              color_metric: config.color_metric,
              frame_type: config.frame_type,
              barcode_type: config.barcode_type,
              sampled_rate: config.sampled_rate.toString(),
              skip_over: config.skip_over.toString(),
              total_frames: config.total_frames.toString(),
              frames_per_column: Math.round(config.seconds_per_column * 24 / config.sampled_rate).toString(),
              partition: config.partition || "short",
              email: config.email,
            },
            movie: movieInfo,
          }),
        });

        if (!assembleResponse.ok) {
          const errorData = await assembleResponse.json();
          throw new Error(errorData.error || "Failed to assemble file and submit job");
        }

        const data = await assembleResponse.json();
        setJobId(data.jobId);
        setSubmitted(true);
        router.push(`/submitted/${data.jobId}`);
      } else {
        // Regular upload for smaller files
        const formData = new FormData();
        formData.append("video", selectedFile);
        formData.append("color_metric", config.color_metric);
        formData.append("frame_type", config.frame_type);
        formData.append("barcode_type", config.barcode_type);
        formData.append("sampled_rate", config.sampled_rate.toString());
        formData.append("skip_over", config.skip_over.toString());
        formData.append("total_frames", config.total_frames.toString());
        formData.append("frames_per_column", Math.round(config.seconds_per_column * 24 / config.sampled_rate).toString());
        formData.append("partition", config.partition || "short");
        formData.append("email", config.email);
        formData.append("movie", JSON.stringify(movieInfo));

        // Use XMLHttpRequest for upload progress tracking
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percentComplete);
          }
        });

        await new Promise<void>((resolve, reject) => {
          xhr.addEventListener("load", () => {
            if (xhr.status === 200) {
              try {
                const data = JSON.parse(xhr.responseText);
                setJobId(data.jobId);
                setSubmitted(true);
                router.push(`/submitted/${data.jobId}`);
                resolve();
              } catch (err) {
                reject(new Error("Invalid response from server"));
              }
            } else {
              try {
                const data = JSON.parse(xhr.responseText);
                reject(new Error(data.error || "Failed to submit job"));
              } catch {
                reject(new Error(`Upload failed with status ${xhr.status}`));
              }
            }
          });

          xhr.addEventListener("error", () => {
            reject(new Error("Network error occurred during upload"));
          });

          xhr.addEventListener("abort", () => {
            reject(new Error("Upload was cancelled"));
          });

          xhr.open("POST", `${API_BASE}/api/generate-barcode`);
          xhrRef.current = xhr;
          xhr.send(formData);
        });
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError" || (err as Error)?.message === "Upload was cancelled") {
        // Cancelled — do not show error
      } else {
        setError(err instanceof Error ? err.message : "An error occurred");
      }
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
      abortRef.current = null;
      xhrRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    xhrRef.current?.abort();
    setIsSubmitting(false);
    setUploadProgress(0);
  };

  const handleNewUpload = () => {
    setSelectedFile(null);
    setMovieInfo(null);
    setSubmitted(false);
    setJobId(null);
    setError(null);
    setUploadProgress(0);
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
                <h2 className="text-sm font-medium mb-1 text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
                  Movie Title <span className="text-neutral-900 dark:text-neutral-100">*</span>
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
                  Search by title or enter an IMDb ID to attach metadata to your barcode.
                </p>
                <MovieSearchInput key={selectedFile.name} onChange={handleMovieChange} />
              </div>

              {/* Already-in-DB prompt */}
              {movieInfo && existingAnalyses.length > 0 && (
                <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded p-6">
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1">
                    This film has already been analyzed.
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
                    Would you like to view its analytics dashboard, or continue uploading?
                  </p>
                  <div className="space-y-2 mb-5">
                    {existingAnalyses.map((a) => (
                      <div key={a.id} className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400">
                        <span>
                          <span className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-700 rounded mr-2">
                            {a.barcode_type}
                          </span>
                          {a.frame_type.replace(/_/g, " ")} · {a.metric}
                        </span>
                        <button
                          onClick={() => router.push(`/results/${a.id}`)}
                          className="underline text-neutral-900 dark:text-neutral-100 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                        >
                          View
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setExistingAnalyses([])}
                    className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 underline"
                  >
                    Upload anyway
                  </button>
                </div>
              )}

              {movieStepComplete && (
                <>
                  <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded p-6">
                    <h2 className="text-sm font-medium mb-4 text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
                      Configuration
                    </h2>
                    <ConfigPanel config={config} onConfigChange={handleConfigChange} />
                  </div>

                  {isSubmitting && uploadProgress > 0 && (
                    <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded p-6">
                      <div className="mb-2 flex justify-between items-center">
                        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          Uploading video...
                        </span>
                        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          {uploadProgress}%
                        </span>
                      </div>
                      <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2.5">
                        <div
                          className="bg-neutral-900 dark:bg-neutral-100 h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {uploadProgress < 100
                            ? "Please wait while your video is being uploaded..."
                            : "Upload complete! Processing job submission..."}
                        </p>
                        {uploadProgress < 100 && (
                          <button
                            onClick={handleCancel}
                            className="ml-4 px-3 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                          >
                            Cancel Upload
                          </button>
                        )}
                      </div>
                    </div>
                  )}

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
                          {uploadProgress < 100 ? `Uploading ${uploadProgress}%` : "Submitting..."}
                        </span>
                      ) : (
                        "Submit Job"
                      )}
                    </button>
                  </div>
                </>
              )}
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
              {movieInfo && (
                <div className="text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">Movie:</span>{" "}
                  <span className="text-neutral-900 dark:text-neutral-100">
                    {movieInfo.title}{"year" in movieInfo ? ` (${movieInfo.year})` : ""}
                  </span>
                </div>
              )}
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
