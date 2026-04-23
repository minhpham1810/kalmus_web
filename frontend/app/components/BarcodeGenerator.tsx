"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  save_thumbnails: boolean;
  partition?: string;
  email?: string;
}

interface ExistingAnalysis {
  job_id: string;
  barcode_type: string;
  frame_type: string;
  metric: string;
}

type DuplicateCheckConfig = Pick<
  BarcodeConfig,
  "barcode_type" | "color_metric" | "frame_type"
>;

export default function BarcodeGenerator() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [config, setConfig] = useState<BarcodeConfig>({
    color_metric: "Average",
    frame_type: "Whole_frame",
    barcode_type: "Color",
    sampled_rate: 1,
    skip_over: 0,
    total_frames: 100000000,
    seconds_per_column: 8,
    save_thumbnails: true,
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
    ExistingAnalysis[]
  >([]);
  const [exactDuplicate, setExactDuplicate] = useState<ExistingAnalysis | null>(null);
  const [duplicateCheckLoading, setDuplicateCheckLoading] = useState(false);
  const [forceReprocess, setForceReprocess] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const router = useRouter();

  const movieStepComplete = movieInfo !== null;
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const framesPerColumn = Math.round((config.seconds_per_column * 24) / config.sampled_rate);

  const resetDuplicateState = () => {
    setExistingAnalyses([]);
    setExactDuplicate(null);
    setDuplicateCheckLoading(false);
    setForceReprocess(false);
  };

  const getDuplicateCheckUrl = useCallback((movie: MovieInfo | null, currentConfig: DuplicateCheckConfig) => {
    if (!movie || !("imdb_id" in movie) || !movie.imdb_id) {
      return null;
    }

    return `/api/duplicate-check?imdb_id=${encodeURIComponent(movie.imdb_id)}&barcode_type=${encodeURIComponent(currentConfig.barcode_type)}&frame_type=${encodeURIComponent(currentConfig.frame_type)}&color_metric=${encodeURIComponent(currentConfig.color_metric)}`;
  }, []);

  const fetchDuplicateState = useCallback(async (movie: MovieInfo | null, currentConfig: DuplicateCheckConfig) => {
    const url = getDuplicateCheckUrl(movie, currentConfig);
    if (!url) {
      return {
        analyses: [] as ExistingAnalysis[],
        exactMatch: null as ExistingAnalysis | null,
      };
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Failed to check for existing analyses");
    }

    const data = await response.json();
    return {
      analyses: (data.analyses || []) as ExistingAnalysis[],
      exactMatch: (data.exactMatch || null) as ExistingAnalysis | null,
    };
  }, [getDuplicateCheckUrl]);

  const handleFileSelect = (file: File | null) => {
    setSelectedFile(file);
    setMovieInfo(null);
    resetDuplicateState();
    setSubmitted(false);
    setError(null);
    setJobId(null);
  };

  const handleMovieChange = async (movie: MovieInfo | null) => {
    setMovieInfo(movie);
    setForceReprocess(false);
  };

  const handleConfigChange = (newConfig: Partial<BarcodeConfig>) => {
    setConfig((prev) => ({ ...prev, ...newConfig }));
    setForceReprocess(false);
  };

  useEffect(() => {
    let cancelled = false;
    const duplicateCheckConfig: DuplicateCheckConfig = {
      barcode_type: config.barcode_type,
      color_metric: config.color_metric,
      frame_type: config.frame_type,
    };

    const runDuplicateCheck = async () => {
      const url = getDuplicateCheckUrl(movieInfo, duplicateCheckConfig);
      if (!url) {
        if (!cancelled) {
          setExistingAnalyses([]);
          setExactDuplicate(null);
          setDuplicateCheckLoading(false);
        }
        return;
      }

      setDuplicateCheckLoading(true);

      try {
        const duplicateState = await fetchDuplicateState(movieInfo, duplicateCheckConfig);
        if (!cancelled) {
          setExistingAnalyses(duplicateState.analyses);
          setExactDuplicate(duplicateState.exactMatch);
        }
      } catch {
        if (!cancelled) {
          setExistingAnalyses([]);
          setExactDuplicate(null);
        }
      } finally {
        if (!cancelled) {
          setDuplicateCheckLoading(false);
        }
      }
    };

    void runDuplicateCheck();

    return () => {
      cancelled = true;
    };
  }, [
    movieInfo,
    config.barcode_type,
    config.color_metric,
    config.frame_type,
    fetchDuplicateState,
    getDuplicateCheckUrl,
  ]);

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
      const duplicateState = await fetchDuplicateState(movieInfo, {
        barcode_type: config.barcode_type,
        color_metric: config.color_metric,
        frame_type: config.frame_type,
      });
      setExistingAnalyses(duplicateState.analyses);
      setExactDuplicate(duplicateState.exactMatch);

      if (duplicateState.exactMatch && !forceReprocess) {
        setError("An equivalent analysis already exists. View the existing result or choose Reprocess anyway.");
        return;
      }

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
              frames_per_column: framesPerColumn.toString(),
              save_thumbnails: "true",
              partition: config.partition || "short",
              email: config.email,
              force_reprocess: forceReprocess.toString(),
            },
            movie: movieInfo,
          }),
        });

        if (!assembleResponse.ok) {
          const errorData = await assembleResponse.json();
          throw new Error(errorData.error || "Failed to assemble file and submit job");
        }

        const data = await assembleResponse.json();
        if (data.duplicate && data.existingJobId) {
          router.push(`/results/${data.existingJobId}`);
          return;
        }

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
        formData.append("frames_per_column", framesPerColumn.toString());
        formData.append("save_thumbnails", "true");
        formData.append("partition", config.partition || "short");
        formData.append("email", config.email);
        formData.append("movie", JSON.stringify(movieInfo));
        formData.append("force_reprocess", forceReprocess.toString());

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
                if (data.duplicate && data.existingJobId) {
                  router.push(`/results/${data.existingJobId}`);
                  resolve();
                  return;
                }
                setJobId(data.jobId);
                setSubmitted(true);
                router.push(`/submitted/${data.jobId}`);
                resolve();
              } catch {
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
    resetDuplicateState();
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
          <div className="panel-bg p-6" style={{ border: '1px solid var(--surface-border)', borderLeftWidth: 3, borderLeftColor: 'var(--accent-crimson)' }}>
            <h2 className="font-mono text-[9px] tracking-[0.35em] uppercase kalmus-text-secondary mb-4">
              ▸ Video Upload
            </h2>
            <FileUpload
              onFileSelect={handleFileSelect}
              selectedFile={selectedFile}
            />
          </div>

          {selectedFile && (
            <>
              <div className="panel-bg p-6" style={{ border: '1px solid var(--surface-border)', borderLeftWidth: 3, borderLeftColor: 'var(--accent-crimson)' }}>
                <h2 className="font-mono text-[9px] tracking-[0.35em] uppercase kalmus-text-secondary mb-1">
                  ▸ Movie Title <span style={{ color: 'var(--accent-amber)' }}>*</span>
                </h2>
                <p className="font-mono text-[10px] kalmus-text-muted mb-3">
                  Search by title or enter an IMDb ID to attach metadata to your barcode.
                </p>
                <MovieSearchInput key={selectedFile.name} onChange={handleMovieChange} />
              </div>

              {movieStepComplete && (
                <>
                  <div className="panel-bg p-6" style={{ border: '1px solid var(--surface-border)', borderLeftWidth: 3, borderLeftColor: 'var(--accent-crimson)' }}>
                    <h2 className="font-mono text-[9px] tracking-[0.35em] uppercase kalmus-text-secondary mb-4">
                      ▸ Configuration
                    </h2>
                    <ConfigPanel config={config} onConfigChange={handleConfigChange} />
                  </div>

                  {movieInfo && existingAnalyses.length > 0 && (
                    <div className="panel-bg p-6" style={{ border: '1px solid var(--surface-border)', borderLeftWidth: 3, borderLeftColor: exactDuplicate && !forceReprocess ? 'var(--accent-amber)' : 'var(--accent-crimson)' }}>
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <p className="font-mono text-xs kalmus-text-primary mb-1">
                            {exactDuplicate && !forceReprocess
                              ? "An equivalent analysis already exists for these settings."
                              : exactDuplicate && forceReprocess
                                ? "Reprocessing override enabled for an existing analysis."
                                : "This film already has analyses in the database."}
                          </p>
                          <p className="font-mono text-[10px] kalmus-text-secondary">
                            {duplicateCheckLoading
                              ? "Checking current settings against saved analyses..."
                              : exactDuplicate && !forceReprocess
                                ? "Reuse the existing dashboard by default, or explicitly choose to reprocess."
                                : exactDuplicate && forceReprocess
                                  ? "Submitting now will generate a new run for the same movie and configuration."
                                  : "Existing analyses are listed below; different settings can still be submitted normally."}
                          </p>
                        </div>
                        {exactDuplicate && (
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => router.push(`/results/${exactDuplicate.job_id}`)}
                              className="px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-all hover:opacity-90"
                              style={{ background: 'var(--accent-amber)', color: 'var(--background)' }}
                            >
                              View Existing
                            </button>
                            <button
                              onClick={() => setForceReprocess((prev) => !prev)}
                              className="px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-all kalmus-text-secondary hover:text-[var(--text-primary)]"
                              style={{ border: '1px solid var(--input-border)' }}
                            >
                              {forceReprocess ? "Cancel Reprocess" : "Reprocess Anyway"}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        {existingAnalyses.map((a) => {
                          const isExactMatch = exactDuplicate?.job_id === a.job_id;
                          return (
                            <div key={a.job_id} className="flex items-center justify-between font-mono text-[10px] kalmus-text-secondary">
                              <span>
                                <span className="px-1.5 py-0.5 mr-2" style={{ background: 'var(--surface-bg-strong)', color: isExactMatch ? 'var(--accent-amber)' : 'var(--text-secondary)' }}>
                                  {a.barcode_type}
                                </span>
                                {a.frame_type.replace(/_/g, " ")} · {a.metric}
                                {isExactMatch && (
                                  <span className="ml-2" style={{ color: 'var(--accent-amber)' }}>
                                    matching config
                                  </span>
                                )}
                              </span>
                              <button
                                onClick={() => router.push(`/results/${a.job_id}`)}
                                className="underline transition-colors hover:text-[var(--text-primary)]"
                                style={{ color: isExactMatch ? 'var(--accent-amber)' : 'var(--text-secondary)' }}
                              >
                                View
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {isSubmitting && uploadProgress > 0 && (
                    <div className="panel-bg p-6" style={{ border: '1px solid var(--surface-border)' }}>
                      <div className="mb-2 flex justify-between items-center">
                        <span className="font-mono text-[10px] tracking-[0.18em] uppercase kalmus-text-muted">
                          Uploading footage...
                        </span>
                        <span className="font-mono text-sm" style={{ color: 'var(--accent-amber)' }}>
                          {uploadProgress}%
                        </span>
                      </div>
                      <div className="w-full h-1.5" style={{ background: 'var(--surface-bg-strong)' }}>
                        <div
                          className="h-1.5 transition-all duration-300"
                          style={{ width: `${uploadProgress}%`, background: 'var(--accent-crimson)' }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="font-mono text-[10px] kalmus-text-muted">
                          {uploadProgress < 100
                            ? "Please wait while your video is being uploaded..."
                            : "Upload complete! Processing job submission..."}
                        </p>
                        {uploadProgress < 100 && (
                          <button
                            onClick={handleCancel}
                            className="ml-4 px-3 py-1 font-mono text-[10px] tracking-wider uppercase transition-colors kalmus-text-secondary hover:text-[var(--text-primary)]"
                            style={{ border: '1px solid var(--input-border)' }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={handleSubmit}
                      disabled={isSubmitting || !config.email || duplicateCheckLoading || (!!exactDuplicate && !forceReprocess)}
                      className="px-6 py-2.5 font-mono text-[11px] tracking-[0.22em] uppercase transition-all hover:opacity-90 hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: 'var(--accent-crimson)', color: 'var(--foreground)', borderRadius: 0 }}
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
                        exactDuplicate && !forceReprocess ? "Existing Analysis Found" : "Submit Job"
                      )}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <div className="panel-bg p-8" style={{ border: '1px solid var(--surface-border)', borderLeftWidth: 3, borderLeftColor: 'var(--accent-crimson)' }}>
          <div>
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="inline-flex items-center justify-center w-10 h-10 font-mono text-sm"
                  style={{ border: '1px solid var(--accent-amber)', color: 'var(--accent-amber)' }}
                >
                  ✓
                </div>
                <div className="font-mono text-[9px] tracking-[0.35em] uppercase kalmus-text-secondary">
                  ▸ TRANSMISSION LOGGED
                </div>
              </div>
              <h2 className="font-display text-xl kalmus-text-primary mb-1">
                Job Submitted
              </h2>
              <p className="font-mono text-xs kalmus-text-secondary">
                Your video is being processed on the HPC cluster.
              </p>
            </div>

            <div className="pl-4 mb-6 space-y-2" style={{ borderLeft: '2px solid var(--surface-border)' }}>
              {movieInfo && (
                <div className="font-mono text-xs">
                  <span className="kalmus-text-secondary">Movie: </span>
                  <span className="kalmus-text-primary">
                    {movieInfo.title}{"year" in movieInfo ? ` (${movieInfo.year})` : ""}
                  </span>
                </div>
              )}
              <div className="font-mono text-xs">
                <span className="kalmus-text-secondary">Partition: </span>
                <span className="kalmus-text-primary">{config.partition}</span>
              </div>
              <div className="font-mono text-xs">
                <span className="kalmus-text-secondary">Email: </span>
                <span className="kalmus-text-primary">{config.email}</span>
              </div>
              <div className="font-mono text-xs">
                <span className="kalmus-text-secondary">Expected time: </span>
                <span className="kalmus-text-primary">1-10 minutes</span>
              </div>
              {jobId && (
                <div className="font-mono text-xs">
                  <span className="kalmus-text-secondary">Job ID: </span>
                  <code className="kalmus-text-secondary">
                    {jobId.substring(0, 8)}
                  </code>
                </div>
              )}
            </div>

            <div className="p-4 mb-6 kalmus-surface">
              <p className="font-mono text-[10px] kalmus-text-secondary leading-relaxed">
                You&apos;ll receive an email when the job completes, fails, or reuses an existing analysis. The message includes a direct link to the result page.
              </p>
            </div>

            <button
              onClick={handleNewUpload}
              className="px-5 py-2 font-mono text-[11px] tracking-[0.22em] uppercase transition-all hover:opacity-90 hover:-translate-y-0.5"
              style={{ background: 'var(--accent-crimson)', color: 'var(--foreground)', borderRadius: 0 }}
            >
              Process Another Video
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 kalmus-surface-strong" style={{ border: '1px solid var(--accent-crimson)' }}>
          <p className="font-mono text-xs kalmus-text-secondary">{error}</p>
        </div>
      )}
    </div>
  );
}
