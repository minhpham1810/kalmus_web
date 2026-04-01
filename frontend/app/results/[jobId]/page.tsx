"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
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
        <div className="text-center">
          <div
            className="inline-flex items-center justify-center w-16 h-16 panel-bg mb-4"
            style={{ border: '1px solid var(--accent-crimson)' }}
          >
            <svg
              className="animate-spin h-6 w-6"
              style={{ color: 'var(--accent-amber)' }}
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
          <p className="font-mono text-xs tracking-[0.18em] uppercase kalmus-text-secondary">
            Retrieving barcode analysis...
          </p>
        </div>
      </div>
    );
  }

  if (error || !jobData?.success) {
    return (
      <div className="min-h-screen">
        <main className="container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto">
            <div className="panel-bg p-8" style={{ border: '1px solid var(--accent-crimson)', borderLeftWidth: 3 }}>
              <div className="text-center">
                <div
                  className="inline-flex items-center justify-center w-12 h-12 mb-4"
                  style={{ border: '1px solid var(--accent-crimson)', color: 'var(--accent-crimson)' }}
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <div className="font-mono text-[9px] tracking-[0.3em] uppercase kalmus-text-secondary mb-2">
                  ▸ RETRIEVAL FAILED
                </div>
                <h2 className="font-display text-xl kalmus-text-primary mb-2">
                  Unable to Load Results
                </h2>
                <p className="font-mono text-xs kalmus-text-primary mb-6 leading-relaxed">
                  {error || "The requested job could not be found or has not completed yet."}
                </p>
                <div className="space-y-3">
                  <p className="font-mono text-xs kalmus-text-secondary">
                    Job ID: <code className="font-mono kalmus-text-muted">{jobId}</code>
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => router.push("/")}
                      className="px-5 py-2 font-mono text-[11px] tracking-[0.18em] uppercase kalmus-text-secondary transition-all border border-[var(--input-border)] hover:bg-[var(--surface-bg-strong)] hover:text-[var(--text-primary)] hover:border-[var(--accent-amber)] hover:shadow-sm"
                    >
                      Back to Search
                    </button>
                    <button
                      onClick={handleProcessAnother}
                      className="px-5 py-2 font-mono text-[11px] tracking-[0.18em] uppercase transition-all bg-[var(--accent-crimson)] text-[var(--foreground)] hover:brightness-110 hover:-translate-y-0.5 hover:shadow-md"
                    >
                      Upload New Video
                    </button>
                  </div>
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
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Logo */}
          <div className="mb-8">
            <Link href="/" className="inline-block">
              <Image
                src="/kalmus-logo.png"
                alt="KALMUS"
                width={240}
                height={80}
                className="dark:invert"
                priority
              />
            </Link>
          </div>

          {/* Header */}
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="font-mono text-[9px] tracking-[0.35em] uppercase kalmus-text-secondary mb-1">
                ▸ BARCODE ANALYSIS
              </div>
              <h1 className="font-display text-2xl tracking-wide kalmus-text-primary mb-1">
                {jobData.metadata?.movie?.title
                  ? `${jobData.metadata.movie.title}${jobData.metadata.movie.year ? ` (${jobData.metadata.movie.year})` : ""}`
                  : jobData.metadata?.videoFilename || "Video Analysis Results"}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/")}
                className="px-5 py-2 font-mono text-[10px] tracking-[0.18em] uppercase kalmus-text-secondary transition-all border border-[var(--surface-border)] hover:bg-[var(--surface-bg-strong)] hover:text-[var(--text-primary)] hover:border-[var(--accent-amber)] hover:shadow-sm flex items-center gap-2"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                Back to Search
              </button>
              <button
                onClick={handleProcessAnother}
                className="px-5 py-2 font-mono text-[10px] tracking-[0.18em] uppercase transition-all bg-[var(--accent-crimson)] text-[var(--foreground)] hover:brightness-110 hover:-translate-y-0.5 hover:shadow-md flex items-center gap-2"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Process Another Video
              </button>
            </div>
          </div>

          {/* Visualization Panel */}
          <VisualizationPanel
            jobId={jobId}
            videoFilename={
              jobData.metadata?.movie?.title
                ? `${jobData.metadata.movie.title}${jobData.metadata.movie.year ? ` (${jobData.metadata.movie.year})` : ""}`
                : jobData.metadata?.videoFilename || "Video"
            }
          />

          {/* Job Metadata Card */}
          <div className="panel-bg p-6 mb-6 mt-6" style={{ border: '1px solid var(--surface-border)', borderLeftWidth: 3, borderLeftColor: 'var(--accent-crimson)' }}>
            <div className="font-mono text-[9px] tracking-[0.3em] uppercase kalmus-text-secondary mb-4">
              ▸ Job Information
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="font-mono text-[9px] tracking-[0.2em] uppercase kalmus-text-secondary mb-1">
                  Total Frames
                </div>
                <div className="font-mono text-sm kalmus-text-primary">
                  {jobData.summary?.total_frames.toLocaleString() || "N/A"}
                </div>
              </div>
              <div>
                <div className="font-mono text-[9px] tracking-[0.2em] uppercase kalmus-text-secondary mb-1">
                  Color Metric
                </div>
                <div className="font-mono text-sm kalmus-text-primary">
                  {jobData.metadata?.color_metric || "N/A"}
                </div>
              </div>
              <div>
                <div className="font-mono text-[9px] tracking-[0.2em] uppercase kalmus-text-secondary mb-1">
                  Frame Type
                </div>
                <div className="font-mono text-sm kalmus-text-primary">
                  {jobData.metadata?.frame_type?.replace(/_/g, " ") || "N/A"}
                </div>
              </div>
              <div>
                <div className="font-mono text-[9px] tracking-[0.2em] uppercase kalmus-text-secondary mb-1">
                  Barcode Type
                </div>
                <div className="font-mono text-sm kalmus-text-primary">
                  {jobData.metadata?.barcode_type || "N/A"}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(100,100,100,0.2)' }}>
              <div className="font-mono text-[9px] tracking-[0.2em] uppercase kalmus-text-secondary mb-1">
                Job ID
              </div>
              <code className="font-mono text-xs kalmus-text-muted">
                {jobId}
              </code>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-6 text-center">
        <p className="font-mono text-[9px] tracking-[0.28em] uppercase kalmus-text-muted">
          Powered by{" "}
          <a
            href="https://github.com/KALMUS-Color-Toolkit/KALMUS"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--text-secondary)] transition-colors"
          >
            KALMUS
          </a>
        </p>
      </footer>
    </div>
  );
}
