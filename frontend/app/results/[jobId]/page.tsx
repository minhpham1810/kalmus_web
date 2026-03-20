"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import VisualizationPanel from "@/app/components/VisualizationPanel";

interface JobMetadata {
  success: boolean;
  message?: string;
  metadata?: {
    videoFilename: string;
    submittedAt: string;
    color_metric: string;
    frame_type: string;
    barcode_type: string;
    movie?: {
      title: string;
      year?: string;
      imdb_id?: string;
    };
  };
  summary?: {
    total_frames: number;
    film_length_in_frames: number;
    barcode_shape: number[];
  };
}

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  const [jobData, setJobData] = useState<JobMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadJobData();
  }, [jobId]);

  const loadJobData = async () => {
    try {
      const response = await fetch(`/api/job-result/${jobId}`);
      if (!response.ok) {
        throw new Error("Failed to load job results");
      }

      const data = await response.json();
      setJobData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleProcessAnother = () => {
    router.push("/upload");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center opacity-0 animate-[fade-in-up_0.6s_ease-out_forwards]">
          <div className="inline-flex items-center justify-center w-20 h-20 panel border border-amber-500/20 rounded-full mb-6">
            <svg
              className="animate-spin h-10 w-10 text-amber-500"
              viewBox="0 0 24 24"
            >
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
          </div>
          <p className="text-sm text-amber-500/80 font-mono tracking-wider">
            LOADING_ANALYSIS_DATA...
          </p>
          <p className="text-xs text-neutral-500 font-mono mt-2">
            // Retrieving barcode information
          </p>
        </div>
      </div>
    );
  }

  if (error || !jobData?.success) {
    return (
      <div className="min-h-screen">
        <main className="container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto opacity-0 animate-[fade-in-up_0.6s_ease-out_forwards]">
            <div className="panel border border-red-500/20 rounded p-8 relative overflow-hidden">
              {/* Decorative corners */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-red-500/30" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-red-500/30" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-red-500/30" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-red-500/30" />
              
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-red-500/10 border border-red-500/30 rounded-full mb-4">
                  <svg
                    className="w-7 h-7 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-mono text-red-400/90 mb-2">
                  ERROR_LOADING_RESULTS
                </h2>
                <p className="text-sm text-neutral-400 font-mono mb-6">
                  // {error || "Job not found or still processing"}
                </p>
                <div className="bg-black/40 border border-amber-500/10 rounded p-3 mb-6">
                  <span className="text-xs text-amber-500/60 font-mono">JOB_ID: </span>
                  <code className="text-xs font-mono text-cyan-400/80">{jobId}</code>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => router.push("/")}
                    className="px-5 py-2.5 border border-amber-500/30 text-amber-500/80 text-sm font-mono tracking-wider rounded hover:bg-amber-500/10 hover:border-amber-500/50 transition-all duration-300"
                  >
                    [BACK_TO_SEARCH]
                  </button>
                  <button
                    onClick={handleProcessAnother}
                    className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 text-black text-sm font-mono font-medium tracking-wider rounded border border-amber-500/30 hover:shadow-[0_0_20px_rgba(212,165,116,0.2)] transition-all duration-300"
                  >
                    UPLOAD_NEW
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Top Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-40 border-b border-amber-500/10 bg-black/40 backdrop-blur-md">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 text-amber-500/60 hover:text-amber-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="text-xs font-mono tracking-wider">[SEARCH]</span>
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-cyan-400/80 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(78,205,196,0.6)] animate-pulse" />
            <span>ANALYSIS_COMPLETE</span>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 opacity-0 animate-[fade-in-up_0.6s_ease-out_forwards]">
            <div>
              <h1 className="text-2xl font-light tracking-tight text-amber-100/90 mb-1 font-mono">
                {jobData.metadata?.movie?.title
                  ? `${jobData.metadata.movie.title}${jobData.metadata.movie.year ? ` (${jobData.metadata.movie.year})` : ""}`
                  : jobData.metadata?.videoFilename || "ANALYSIS_RESULTS"}
              </h1>
              <p className="text-sm text-amber-500/60 font-mono tracking-wider">
                // Barcode Analysis Dashboard
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/")}
                className="px-4 py-2.5 border border-amber-500/30 text-amber-500/80 text-sm font-mono tracking-wider rounded hover:bg-amber-500/10 hover:border-amber-500/50 transition-all duration-300 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                SEARCH
              </button>
              <button
                onClick={handleProcessAnother}
                className="px-4 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 text-black text-sm font-mono font-medium tracking-wider rounded border border-amber-500/30 hover:shadow-[0_0_20px_rgba(212,165,116,0.2)] transition-all duration-300 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                UPLOAD
              </button>
            </div>
          </div>

          {/* Visualization Panel */}
          <div className="opacity-0 animate-[fade-in-up_0.6s_ease-out_0.1s_forwards]">
            <VisualizationPanel
              jobId={jobId}
              videoFilename={
                jobData.metadata?.movie?.title
                  ? `${jobData.metadata.movie.title}${jobData.metadata.movie.year ? ` (${jobData.metadata.movie.year})` : ""}`
                  : jobData.metadata?.videoFilename || "Video"
              }
            />
          </div>

          {/* Job Metadata Card */}
          <div className="panel border border-amber-500/20 rounded p-6 mb-6 opacity-0 animate-[fade-in-up_0.6s_ease-out_0.2s_forwards] relative overflow-hidden">
            {/* Decorative corners */}
            <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-amber-500/40" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-amber-500/40" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-amber-500/40" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-amber-500/40" />
            
            <h2 className="text-xs font-mono mb-6 text-amber-500/80 uppercase tracking-widest flex items-center gap-2">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              JOB_METADATA
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="space-y-1">
                <div className="text-xs text-amber-500/50 font-mono uppercase tracking-wide">
                  TOTAL_FRAMES
                </div>
                <div className="text-lg font-medium text-amber-100/90 font-mono">
                  {jobData.summary?.total_frames.toLocaleString() || "N/A"}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-amber-500/50 font-mono uppercase tracking-wide">
                  COLOR_METRIC
                </div>
                <div className="text-lg font-medium text-cyan-400/80 font-mono">
                  {jobData.metadata?.color_metric || "N/A"}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-amber-500/50 font-mono uppercase tracking-wide">
                  FRAME_TYPE
                </div>
                <div className="text-lg font-medium text-amber-100/90 font-mono">
                  {jobData.metadata?.frame_type?.replace(/_/g, " ") || "N/A"}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-amber-500/50 font-mono uppercase tracking-wide">
                  BARCODE_TYPE
                </div>
                <div className="text-lg font-medium text-amber-100/90 font-mono">
                  {jobData.metadata?.barcode_type || "N/A"}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-amber-500/10">
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-amber-500/50">JOB_ID:</span>
                <code className="text-cyan-400/80">{jobId}</code>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-8 border-t border-amber-500/10">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-neutral-500">
            <p>
              POWERED_BY{" "}
              <a
                href="https://github.com/KALMUS-Color-Toolkit/KALMUS"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-500/60 hover:text-amber-400 transition-colors"
              >
                KALMUS_TOOLKIT
              </a>
            </p>
            <p className="text-neutral-600">
              v2.0.0 // FILM_COLOR_ANALYSIS_SYSTEM
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
