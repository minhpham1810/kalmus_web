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
    sampled_rate: 1,
    skip_over: 0,
    total_frames: 100000000,
    seconds_per_column: 8,
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
          <div className="panel border border-amber-500/20 rounded p-6 relative overflow-hidden">
            {/* Decorative corners */}
            <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-amber-500/40" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-amber-500/40" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-amber-500/40" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-amber-500/40" />
            
            <h2 className="text-xs font-mono mb-4 text-amber-500/80 uppercase tracking-widest flex items-center gap-2">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              VIDEO_UPLOAD
            </h2>
            <FileUpload
              onFileSelect={handleFileSelect}
              selectedFile={selectedFile}
            />
          </div>

          {selectedFile && (
            <>
              <div className="panel border border-amber-500/20 rounded p-6 relative overflow-hidden">
                {/* Decorative corners */}
                <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-amber-500/40" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-amber-500/40" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-amber-500/40" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-amber-500/40" />
                
                <h2 className="text-xs font-mono mb-1 text-amber-500/80 uppercase tracking-widest flex items-center gap-2">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                  </svg>
                  FILM_METADATA <span className="text-red-400">*</span>
                </h2>
                <p className="text-xs text-neutral-500 font-mono mb-4">
                  // Search by title or IMDb ID to attach metadata
                </p>
                <MovieSearchInput key={selectedFile.name} onChange={handleMovieChange} />
              </div>

              {/* Already-in-DB prompt */}
              {movieInfo && existingAnalyses.length > 0 && (
                <div className="panel border border-cyan-500/20 rounded p-6 relative overflow-hidden">
                  {/* Decorative corners */}
                  <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-cyan-500/40" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-cyan-500/40" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-cyan-500/40" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-cyan-500/40" />
                  
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(78,205,196,0.6)] animate-pulse" />
                    <p className="text-sm font-mono text-cyan-400/90">
                      EXISTING_ANALYSIS_DETECTED
                    </p>
                  </div>
                  <p className="text-xs text-neutral-400 font-mono mb-4">
                    // View existing dashboard or continue with new upload
                  </p>
                  <div className="space-y-2 mb-5">
                    {existingAnalyses.map((a) => (
                      <div key={a.id} className="flex items-center justify-between text-xs font-mono">
                        <span className="text-neutral-400">
                          <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400/80 rounded mr-2">
                            {a.barcode_type}
                          </span>
                          {a.frame_type.replace(/_/g, " ")} // {a.metric}
                        </span>
                        <button
                          onClick={() => router.push(`/results/${a.id}`)}
                          className="text-cyan-400/80 hover:text-cyan-300 transition-colors tracking-wider"
                        >
                          [VIEW]
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setExistingAnalyses([])}
                    className="text-xs font-mono text-amber-500/50 hover:text-amber-400 transition-colors"
                  >
                    // UPLOAD_ANYWAY
                  </button>
                </div>
              )}

              {movieStepComplete && (
                <>
                  <div className="panel border border-amber-500/20 rounded p-6 relative overflow-hidden">
                    {/* Decorative corners */}
                    <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-amber-500/40" />
                    <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-amber-500/40" />
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-amber-500/40" />
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-amber-500/40" />
                    
                    <h2 className="text-xs font-mono mb-4 text-amber-500/80 uppercase tracking-widest flex items-center gap-2">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      CONFIGURATION
                    </h2>
                    <ConfigPanel config={config} onConfigChange={handleConfigChange} />
                  </div>

                  {isSubmitting && uploadProgress > 0 && (
                    <div className="panel border border-amber-500/30 rounded p-6 relative overflow-hidden">
                      {/* Decorative corners */}
                      <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-amber-500/50" />
                      <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-amber-500/50" />
                      <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-amber-500/50" />
                      <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-amber-500/50" />
                      
                      <div className="mb-3 flex justify-between items-center">
                        <span className="text-sm font-mono text-amber-500/80 uppercase tracking-wider flex items-center gap-2">
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          UPLOADING...
                        </span>
                        <span className="text-sm font-mono text-amber-400">
                          {uploadProgress}%
                        </span>
                      </div>
                      <div className="w-full bg-black/40 rounded h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-amber-600 to-amber-500 h-2 transition-all duration-300 shadow-[0_0_10px_rgba(212,165,116,0.5)]"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <p className="text-xs text-neutral-500 font-mono">
                          {uploadProgress < 100
                            ? "// Transmitting video data..."
                            : "// Upload complete! Processing submission..."}
                        </p>
                        {uploadProgress < 100 && (
                          <button
                            onClick={handleCancel}
                            className="px-3 py-1.5 text-xs font-mono border border-red-500/30 rounded text-red-400/80 hover:bg-red-500/10 hover:border-red-500/50 transition-all duration-200"
                          >
                            [CANCEL]
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={handleSubmit}
                      disabled={isSubmitting || !config.email}
                      className="group px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-700 text-black text-sm font-mono font-medium tracking-wider rounded border border-amber-500/30 hover:shadow-[0_0_25px_rgba(212,165,116,0.3)] transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none flex items-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          {uploadProgress < 100 ? `UPLOADING_${uploadProgress}%` : "SUBMITTING..."}
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          SUBMIT_JOB
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </>
      ) : (
        <div className="panel border border-cyan-500/20 rounded p-8 relative overflow-hidden">
          {/* Decorative corners */}
          <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-cyan-500/40" />
          <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-cyan-500/40" />
          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-cyan-500/40" />
          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-cyan-500/40" />
          
          <div>
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-cyan-500/10 border border-cyan-500/30 rounded-full mb-4">
                <svg
                  className="w-7 h-7 text-cyan-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-mono text-cyan-400/90 mb-2">
                JOB_SUBMITTED
              </h2>
              <p className="text-sm text-neutral-400 font-mono">
                // Video queued for HPC cluster processing
              </p>
            </div>

            <div className="border-l-2 border-amber-500/30 pl-4 mb-6 space-y-3 font-mono">
              {movieInfo && (
                <div className="text-sm">
                  <span className="text-amber-500/60">FILM:</span>{" "}
                  <span className="text-amber-100/90">
                    {movieInfo.title}{"year" in movieInfo ? ` (${movieInfo.year})` : ""}
                  </span>
                </div>
              )}
              <div className="text-sm">
                <span className="text-amber-500/60">PARTITION:</span>{" "}
                <span className="text-amber-100/90">{config.partition}</span>
              </div>
              <div className="text-sm">
                <span className="text-amber-500/60">EMAIL:</span>{" "}
                <span className="text-cyan-400/80">{config.email}</span>
              </div>
              <div className="text-sm">
                <span className="text-amber-500/60">ETA:</span>{" "}
                <span className="text-amber-100/90">1-10 MINUTES</span>
              </div>
              {jobId && (
                <div className="text-sm">
                  <span className="text-amber-500/60">JOB_ID:</span>{" "}
                  <code className="text-xs text-cyan-400/80">
                    {jobId.substring(0, 8)}
                  </code>
                </div>
              )}
            </div>

            <div className="bg-black/40 border border-amber-500/10 rounded p-4 mb-6">
              <p className="text-xs text-neutral-400 font-mono">
                // Email notification will include barcode image, data file, and processing statistics. You may close this interface.
              </p>
            </div>

            <button
              onClick={handleNewUpload}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 text-black text-sm font-mono font-medium tracking-wider rounded border border-amber-500/30 hover:shadow-[0_0_20px_rgba(212,165,116,0.2)] transition-all duration-300"
            >
              PROCESS_ANOTHER
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-black/40 border border-red-500/30 rounded p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-red-500/50" />
          <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-red-500/50" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-red-500/50" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-red-500/50" />
          <p className="text-sm text-red-400/90 font-mono">// ERROR: {error}</p>
        </div>
      )}
    </div>
  );
}
