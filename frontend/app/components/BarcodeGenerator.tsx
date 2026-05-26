"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AnalysisConfig,
  buildAnalysisConfigPayload,
  createAnalysisConfig,
  findDuplicateAnalysisSignatures,
  getNextAvailableAnalysisConfig,
  getInitialAnalysisConfigs,
} from "@/lib/multi-analysis";
import FileUpload from "./FileUpload";
import ConfigPanel from "./ConfigPanel";
import MovieSearchInput, { MovieInfo } from "./MovieSearchInput";

export interface SharedBarcodeConfig {
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

interface DuplicateState {
  analyses: ExistingAnalysis[];
  exactMatch: ExistingAnalysis | null;
  loading: boolean;
}

interface BatchSubmitResponse {
  success: boolean;
  batchId?: string;
  error?: string;
}

export default function BarcodeGenerator() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sharedConfig, setSharedConfig] = useState<SharedBarcodeConfig>({
    sampled_rate: 1,
    skip_over: 0,
    total_frames: 100000000,
    seconds_per_column: 8,
    save_thumbnails: true,
    partition: "short",
    email: "",
  });
  const [analysisConfigs, setAnalysisConfigs] = useState<AnalysisConfig[]>(
    getInitialAnalysisConfigs(),
  );
  const [duplicateStates, setDuplicateStates] = useState<Record<string, DuplicateState>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [movieInfo, setMovieInfo] = useState<MovieInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const router = useRouter();

  const movieStepComplete = movieInfo !== null;
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const framesPerColumn = Math.round(
    (sharedConfig.seconds_per_column * 24) / sharedConfig.sampled_rate,
  );

  const duplicateCheckLoading = useMemo(
    () => analysisConfigs.some((config) => duplicateStates[config.clientId]?.loading),
    [analysisConfigs, duplicateStates],
  );
  const duplicateMetrics = useMemo(
    () => findDuplicateAnalysisSignatures(analysisConfigs),
    [analysisConfigs],
  );
  const canAddAnalysisConfig = useMemo(
    () => getNextAvailableAnalysisConfig(analysisConfigs) !== null,
    [analysisConfigs],
  );

  const getDuplicateCheckUrl = useCallback(
    (movie: MovieInfo | null, currentConfig: AnalysisConfig) => {
      if (!movie || !("imdb_id" in movie) || !movie.imdb_id) {
        return null;
      }

      return `/api/duplicate-check?imdb_id=${encodeURIComponent(
        movie.imdb_id,
      )}&barcode_type=${encodeURIComponent(
        currentConfig.barcode_type,
      )}&frame_type=${encodeURIComponent(
        currentConfig.frame_type,
      )}&color_metric=${encodeURIComponent(currentConfig.color_metric)}`;
    },
    [],
  );

  const fetchDuplicateState = useCallback(
    async (movie: MovieInfo | null, currentConfig: AnalysisConfig) => {
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
    },
    [getDuplicateCheckUrl],
  );

  const resetDuplicateState = useCallback(() => {
    setDuplicateStates({});
  }, []);

  const handleFileSelect = (file: File | null) => {
    setSelectedFile(file);
    setMovieInfo(null);
    resetDuplicateState();
    setError(null);
  };

  const handleMovieChange = (movie: MovieInfo | null) => {
    setMovieInfo(movie);
  };

  const handleSharedConfigChange = (newConfig: Partial<SharedBarcodeConfig>) => {
    setSharedConfig((prev) => ({ ...prev, ...newConfig }));
  };

  const handleAnalysisConfigChange = (
    clientId: string,
    newConfig: Partial<AnalysisConfig>,
  ) => {
    const existingConfig = analysisConfigs.find((config) => config.clientId === clientId);
    if (!existingConfig) {
      return;
    }

    const nextConfig = {
      ...existingConfig,
      ...newConfig,
    };
    const hasDuplicateSignature = analysisConfigs.some(
      (config) =>
        config.clientId !== clientId &&
        config.barcode_type === nextConfig.barcode_type &&
        config.frame_type === nextConfig.frame_type &&
        config.color_metric === nextConfig.color_metric,
    );
    if (hasDuplicateSignature) {
      setError(
        "Each batch option must be unique. Duplicate barcode type, frame type, and metric combination.",
      );
      return;
    }

    setError((currentError) =>
      currentError?.startsWith("Each batch option must be unique") ? null : currentError,
    );
    setAnalysisConfigs((prev) =>
      prev.map((config) =>
        config.clientId === clientId ? { ...config, ...newConfig } : config,
      ),
    );
  };

  const handleAddAnalysisConfig = () => {
    const nextConfig = getNextAvailableAnalysisConfig(analysisConfigs);
    if (!nextConfig) {
      setError("All available barcode combinations are already in this batch.");
      return;
    }

    setError((currentError) =>
      currentError?.startsWith("All available barcode combinations")
        ? null
        : currentError,
    );
    setAnalysisConfigs((prev) => [
      ...prev,
      createAnalysisConfig(
        {
          ...prev[prev.length - 1],
          ...nextConfig,
          forceReprocess: false,
        },
      ),
    ]);
  };

  const handleRemoveAnalysisConfig = (clientId: string) => {
    setAnalysisConfigs((prev) => {
      if (prev.length === 1) {
        return prev;
      }
      return prev.filter((config) => config.clientId !== clientId);
    });

    setDuplicateStates((prev) => {
      const next = { ...prev };
      delete next[clientId];
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;

    if (!movieInfo || !("imdb_id" in movieInfo) || !movieInfo.imdb_id) {
      setDuplicateStates(
        Object.fromEntries(
          analysisConfigs.map((config) => [
            config.clientId,
            {
              analyses: [],
              exactMatch: null,
              loading: false,
            } satisfies DuplicateState,
          ]),
        ),
      );
      return () => {
        cancelled = true;
      };
    }

    setDuplicateStates((prev) =>
      Object.fromEntries(
        analysisConfigs.map((config) => [
          config.clientId,
          {
            analyses: prev[config.clientId]?.analyses || [],
            exactMatch: prev[config.clientId]?.exactMatch || null,
            loading: true,
          } satisfies DuplicateState,
        ]),
      ),
    );

    const runDuplicateChecks = async () => {
      const results = await Promise.all(
        analysisConfigs.map(async (config) => {
          try {
            const duplicateState = await fetchDuplicateState(movieInfo, config);
            return [config.clientId, { ...duplicateState, loading: false }] as const;
          } catch {
            return [
              config.clientId,
              {
                analyses: [],
                exactMatch: null,
                loading: false,
              } satisfies DuplicateState,
            ] as const;
          }
        }),
      );

      if (!cancelled) {
        setDuplicateStates(Object.fromEntries(results));
      }
    };

    void runDuplicateChecks();

    return () => {
      cancelled = true;
    };
  }, [analysisConfigs, fetchDuplicateState, movieInfo]);

  const getOptimalChunkSize = (fileSize: number): number => {
    if (fileSize > 1 * 1024 * 1024 * 1024) return 25 * 1024 * 1024;
    if (fileSize > 500 * 1024 * 1024) return 15 * 1024 * 1024;
    if (fileSize > 100 * 1024 * 1024) return 10 * 1024 * 1024;
    return 5 * 1024 * 1024;
  };

  const uploadChunkWithRetry = async (
    chunkFormData: FormData,
    chunkIndex: number,
    maxRetries = 3,
    signal?: AbortSignal,
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

        if (response.status >= 400 && response.status < 500) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to upload chunk ${chunkIndex}`);
        }
      } catch (uploadError) {
        lastError = uploadError as Error;
      }

      if (attempt < maxRetries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000),
        );
      }
    }

    throw lastError || new Error(`Failed to upload chunk ${chunkIndex}`);
  };

  const uploadChunksParallel = async (
    file: File,
    uploadId: string,
    onProgress: (progress: number) => void,
    signal: AbortSignal,
  ): Promise<void> => {
    const chunkSize = getOptimalChunkSize(file.size);
    const concurrentUploads = 4;
    const totalChunks = Math.ceil(file.size / chunkSize);
    let completedChunks = 0;

    const uploadChunk = async (chunkIndex: number): Promise<void> => {
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      const chunkFormData = new FormData();
      chunkFormData.append("chunk", chunk);
      chunkFormData.append("uploadId", uploadId);
      chunkFormData.append("chunkIndex", chunkIndex.toString());
      chunkFormData.append("totalChunks", totalChunks.toString());
      chunkFormData.append("filename", file.name);

      await uploadChunkWithRetry(chunkFormData, chunkIndex, 3, signal);
      completedChunks += 1;
      onProgress(Math.round((completedChunks / totalChunks) * 100));
    };

    const chunkIndices = Array.from({ length: totalChunks }, (_, index) => index);

    for (let i = 0; i < chunkIndices.length; i += concurrentUploads) {
      if (signal.aborted) throw new Error("Upload was cancelled");
      await Promise.all(chunkIndices.slice(i, i + concurrentUploads).map(uploadChunk));
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      setError("Please select a video file first");
      return;
    }

    if (!sharedConfig.email || !sharedConfig.email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    if (duplicateMetrics.length > 0) {
      setError(
        "Each batch option must be unique. Duplicate barcode type, frame type, and metric combination.",
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setUploadProgress(0);

    const abortController = new AbortController();
    abortRef.current = abortController;
    const analysisPayload = buildAnalysisConfigPayload(analysisConfigs);

    try {
      const useChunkedUpload = selectedFile.size > 50 * 1024 * 1024;

      if (useChunkedUpload) {
        const uploadId = crypto.randomUUID();

        await uploadChunksParallel(
          selectedFile,
          uploadId,
          setUploadProgress,
          abortController.signal,
        );

        const assembleResponse = await fetch(`${API_BASE}/api/assemble-file`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            uploadId,
            filename: selectedFile.name,
            config: {
              sampled_rate: sharedConfig.sampled_rate.toString(),
              skip_over: sharedConfig.skip_over.toString(),
              total_frames: sharedConfig.total_frames.toString(),
              frames_per_column: framesPerColumn.toString(),
              save_thumbnails: String(sharedConfig.save_thumbnails),
              partition: sharedConfig.partition || "short",
              email: sharedConfig.email,
              analysis_configs: analysisPayload,
            },
            movie: movieInfo,
          }),
        });

        if (!assembleResponse.ok) {
          const errorData = await assembleResponse.json();
          throw new Error(errorData.error || "Failed to assemble file and submit jobs");
        }

        const data = (await assembleResponse.json()) as BatchSubmitResponse;
        if (!data.batchId) {
          throw new Error("Batch submission did not return a batch id");
        }

        router.push(`/submitted/batch/${data.batchId}`);
        return;
      }

      const formData = new FormData();
      formData.append("video", selectedFile);
      formData.append("sampled_rate", sharedConfig.sampled_rate.toString());
      formData.append("skip_over", sharedConfig.skip_over.toString());
      formData.append("total_frames", sharedConfig.total_frames.toString());
      formData.append("frames_per_column", framesPerColumn.toString());
      formData.append("save_thumbnails", String(sharedConfig.save_thumbnails));
      formData.append("partition", sharedConfig.partition || "short");
      formData.append("email", sharedConfig.email);
      formData.append("movie", JSON.stringify(movieInfo));
      formData.append("analysis_configs", JSON.stringify(analysisPayload));

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          setUploadProgress(Math.round((event.loaded / event.total) * 100));
        }
      });

      await new Promise<void>((resolve, reject) => {
        xhr.addEventListener("load", () => {
          if (xhr.status !== 200) {
            try {
              const data = JSON.parse(xhr.responseText) as BatchSubmitResponse;
              reject(new Error(data.error || "Failed to submit jobs"));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
            return;
          }

          try {
            const data = JSON.parse(xhr.responseText) as BatchSubmitResponse;
            if (!data.batchId) {
              reject(new Error("Batch submission did not return a batch id"));
              return;
            }

            router.push(`/submitted/batch/${data.batchId}`);
            resolve();
          } catch {
            reject(new Error("Invalid response from server"));
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
    } catch (submitError) {
      if (
        (submitError as Error)?.name === "AbortError" ||
        (submitError as Error)?.message === "Upload was cancelled"
      ) {
        return;
      }

      setError(
        submitError instanceof Error ? submitError.message : "An error occurred",
      );
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

  return (
    <div className="space-y-6">
      <div
        className="panel-bg p-6"
        style={{
          border: "1px solid var(--surface-border)",
          borderLeftWidth: 3,
          borderLeftColor: "var(--accent-crimson)",
        }}
      >
        <h2 className="font-mono text-xs tracking-[0.35em] uppercase kalmus-text-secondary mb-4">
          ▸ Video Upload
        </h2>
        <FileUpload onFileSelect={handleFileSelect} selectedFile={selectedFile} />
      </div>

      {selectedFile && (
        <>
          <div
            className="panel-bg p-6"
            style={{
              border: "1px solid var(--surface-border)",
              borderLeftWidth: 3,
              borderLeftColor: "var(--accent-crimson)",
            }}
          >
            <h2 className="font-mono text-xs tracking-[0.35em] uppercase kalmus-text-secondary mb-1">
              ▸ Movie Title <span style={{ color: "var(--accent-amber)" }}>*</span>
            </h2>
            <p className="font-mono text-xs kalmus-text-muted mb-3">
              Search by title or enter an IMDb ID to attach metadata to your barcode.
            </p>
            <MovieSearchInput key={selectedFile.name} onChange={handleMovieChange} />
          </div>

          {movieStepComplete && (
            <>
              <div
                className="panel-bg p-6"
                style={{
                  border: "1px solid var(--surface-border)",
                  borderLeftWidth: 3,
                  borderLeftColor: "var(--accent-crimson)",
                }}
              >
                <h2 className="font-mono text-xs tracking-[0.35em] uppercase kalmus-text-secondary mb-4">
                  ▸ Configuration
                </h2>
                <ConfigPanel
                  sharedConfig={sharedConfig}
                  analysisConfigs={analysisConfigs}
                  onSharedConfigChange={handleSharedConfigChange}
                  onAnalysisConfigChange={handleAnalysisConfigChange}
                  onAddAnalysisConfig={handleAddAnalysisConfig}
                  onRemoveAnalysisConfig={handleRemoveAnalysisConfig}
                  canAddAnalysisConfig={canAddAnalysisConfig}
                />
              </div>

              {movieInfo &&
                analysisConfigs.map((config, index) => {
                  const duplicateState = duplicateStates[config.clientId];
                  if (
                    !duplicateState ||
                    (!duplicateState.loading && duplicateState.analyses.length === 0)
                  ) {
                    return null;
                  }

                  const exactDuplicate = duplicateState.exactMatch;

                  return (
                    <div
                      key={`duplicate-${config.clientId}`}
                      className="panel-bg p-6"
                      style={{
                        border: "1px solid var(--surface-border)",
                        borderLeftWidth: 3,
                        borderLeftColor:
                          exactDuplicate && !config.forceReprocess
                            ? "var(--accent-amber)"
                            : "var(--accent-crimson)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                          <p className="font-mono text-xs kalmus-text-primary mb-1">
                            Analysis {index + 1}:{" "}
                            {duplicateState.loading
                              ? "Checking existing analyses..."
                              : exactDuplicate && !config.forceReprocess
                                ? "Equivalent analysis already exists for this row."
                                : exactDuplicate && config.forceReprocess
                                  ? "Reprocessing override enabled for this row."
                                  : "This film already has saved analyses."}
                          </p>
                          <p className="font-mono text-xs kalmus-text-secondary">
                            {duplicateState.loading
                              ? "Comparing this configuration against the archive."
                              : exactDuplicate && !config.forceReprocess
                                ? "Submitting will reuse the existing result unless you explicitly reprocess this row."
                                : exactDuplicate && config.forceReprocess
                                  ? "Submitting will create a new job even though an equivalent result exists."
                                  : "These saved analyses may still be useful reference points before you submit."}
                          </p>
                        </div>
                        {exactDuplicate && !duplicateState.loading && (
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => router.push(`/results/${exactDuplicate.job_id}`)}
                              className="px-3 py-1.5 font-mono text-xs tracking-[0.12em] uppercase transition-all hover:opacity-90"
                              style={{
                                background: "var(--accent-amber)",
                                color: "var(--background)",
                              }}
                            >
                              View Existing
                            </button>
                            <button
                              onClick={() =>
                                handleAnalysisConfigChange(config.clientId, {
                                  forceReprocess: !config.forceReprocess,
                                })
                              }
                              className="px-3 py-1.5 font-mono text-xs tracking-[0.12em] uppercase transition-all kalmus-text-secondary hover:text-[var(--text-primary)]"
                              style={{ border: "1px solid var(--input-border)" }}
                            >
                              {config.forceReprocess
                                ? "Cancel Reprocess"
                                : "Reprocess Anyway"}
                            </button>
                          </div>
                        )}
                      </div>

                      {!duplicateState.loading && (
                        <div className="space-y-2">
                          {duplicateState.analyses.map((analysis) => {
                            const isExactMatch = exactDuplicate?.job_id === analysis.job_id;
                            return (
                              <div
                                key={analysis.job_id}
                                className="flex items-center justify-between font-mono text-xs kalmus-text-secondary"
                              >
                                <span>
                                  <span
                                    className="px-1.5 py-0.5 mr-2"
                                    style={{
                                      background: "var(--surface-bg-strong)",
                                      color: isExactMatch
                                        ? "var(--accent-amber)"
                                        : "var(--text-secondary)",
                                    }}
                                  >
                                    {analysis.barcode_type}
                                  </span>
                                  {analysis.frame_type.replace(/_/g, " ")} · {analysis.metric}
                                  {isExactMatch && (
                                    <span className="ml-2" style={{ color: "var(--accent-amber)" }}>
                                      matching config
                                    </span>
                                  )}
                                </span>
                                <button
                                  onClick={() => router.push(`/results/${analysis.job_id}`)}
                                  className="underline transition-colors hover:text-[var(--text-primary)]"
                                  style={{
                                    color: isExactMatch
                                      ? "var(--accent-amber)"
                                      : "var(--text-secondary)",
                                  }}
                                >
                                  View
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

              {isSubmitting && uploadProgress > 0 && (
                <div className="panel-bg p-6" style={{ border: "1px solid var(--surface-border)" }}>
                  <div className="mb-2 flex justify-between items-center">
                    <span className="font-mono text-xs tracking-[0.18em] uppercase kalmus-text-muted">
                      Uploading footage...
                    </span>
                    <span className="font-mono text-sm" style={{ color: "var(--accent-amber)" }}>
                      {uploadProgress}%
                    </span>
                  </div>
                  <div className="w-full h-1.5" style={{ background: "var(--surface-bg-strong)" }}>
                    <div
                      className="h-1.5 transition-all duration-300"
                      style={{
                        width: `${uploadProgress}%`,
                        background: "var(--accent-crimson)",
                      }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="font-mono text-xs kalmus-text-muted">
                      {uploadProgress < 100
                        ? "Please wait while your video is being uploaded..."
                        : "Upload complete! Processing batch submission..."}
                    </p>
                    {uploadProgress < 100 && (
                      <button
                        onClick={handleCancel}
                        className="ml-4 px-3 py-1 font-mono text-xs tracking-wider uppercase transition-colors kalmus-text-secondary hover:text-[var(--text-primary)]"
                        style={{ border: "1px solid var(--input-border)" }}
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
                  disabled={isSubmitting || !sharedConfig.email || duplicateCheckLoading || duplicateMetrics.length > 0}
                  className="kalmus-button-filled px-6 py-2.5 font-mono text-xs tracking-[0.22em] uppercase transition-all hover:brightness-90 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:hover:translate-y-0"
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
                    "Submit Jobs"
                  )}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {error && (
        <div className="p-4 kalmus-surface-strong" style={{ border: "1px solid var(--accent-crimson)" }}>
          <p className="font-mono text-xs kalmus-text-secondary">{error}</p>
        </div>
      )}
    </div>
  );
}
