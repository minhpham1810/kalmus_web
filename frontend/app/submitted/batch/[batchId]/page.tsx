"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { SubmissionBatchRecord } from "@/lib/submission-batches";

interface BatchResponse {
  success: boolean;
  batch?: SubmissionBatchRecord;
  error?: string;
}

export default function SubmittedBatchPage() {
  const params = useParams();
  const batchId = params.batchId as string;

  const [batch, setBatch] = useState<SubmissionBatchRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadBatch = async () => {
      try {
        const response = await fetch(`/api/submission-batches/${batchId}`);
        const data = (await response.json()) as BatchResponse;

        if (!response.ok || !data.batch) {
          throw new Error(data.error || "Failed to load submission batch");
        }

        if (!cancelled) {
          setBatch(data.batch);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load submission batch",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadBatch();

    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const summary = useMemo(() => {
    if (!batch) {
      return { submitted: 0, reused: 0 };
    }

    return batch.jobs.reduce(
      (counts, job) => {
        if (job.status === "submitted") {
          counts.submitted += 1;
        } else {
          counts.reused += 1;
        }
        return counts;
      },
      { submitted: 0, reused: 0 },
    );
  }, [batch]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-mono text-xs tracking-[0.18em] uppercase kalmus-text-secondary">
          Loading submission batch...
        </p>
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div className="min-h-screen">
        <main className="container mx-auto px-4 py-12">
          <div
            className="max-w-2xl mx-auto panel-bg p-8"
            style={{ border: "1px solid var(--accent-crimson)", borderLeftWidth: 3 }}
          >
            <h1 className="font-display text-xl kalmus-text-primary mb-2">
              Unable to Load Submission Batch
            </h1>
            <p className="font-mono text-xs kalmus-text-secondary mb-6">
              {error || "The requested batch could not be found."}
            </p>
            <Link
              href="/upload"
              className="kalmus-button-filled inline-flex items-center px-5 py-2 font-mono text-xs tracking-[0.18em] uppercase transition-all hover:brightness-90"
            >
              Back to Upload
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <header className="mb-8">
            <Link href="/" className="inline-block mb-3">
              <Image
                src="/kalmus-logo.png"
                alt="KALMUS"
                width={240}
                height={80}
                className="dark:invert"
                priority
              />
            </Link>
            <p className="font-mono text-xs tracking-[0.28em] uppercase kalmus-text-secondary">
              Upload batch recorded
            </p>
          </header>

          <div
            className="panel-bg p-8 mb-6"
            style={{ border: "1px solid var(--accent-crimson)", borderLeftWidth: 3 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="flex items-center justify-center w-10 h-10 font-mono text-sm"
                style={{ border: "1px solid var(--accent-amber)", color: "var(--accent-amber)" }}
              >
                ✓
              </div>
              <div>
                <div className="font-mono text-xs tracking-[0.35em] uppercase kalmus-text-secondary mb-0.5">
                  ▸ TRANSMISSION LOGGED
                </div>
                <h1 className="font-display text-xl tracking-wide kalmus-text-primary">
                  Batch Submitted
                </h1>
              </div>
            </div>

            <p className="font-mono text-xs kalmus-text-secondary mb-6 leading-relaxed">
              One upload produced {batch.jobs.length} barcode requests. {summary.submitted} new
              job{summary.submitted === 1 ? "" : "s"}
              {summary.reused
                ? ` and ${summary.reused} reused result${summary.reused === 1 ? "" : "s"}`
                : ""}.
            </p>

            <div className="space-y-3">
              {batch.jobs.map((job, index) => {
                const href =
                  job.status === "duplicate"
                    ? `/results/${job.existingJobId}`
                    : `/submitted/${job.jobId}`;

                return (
                  <div
                    key={job.clientId}
                    className="panel-bg p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                    style={{ border: "1px solid var(--surface-border)" }}
                  >
                    <div>
                      <div className="font-mono text-xs tracking-[0.28em] uppercase kalmus-text-secondary mb-2">
                        Analysis {index + 1}
                      </div>
                      <p className="font-mono text-xs kalmus-text-primary">
                        {job.config.barcode_type} · {job.config.frame_type.replace(/_/g, " ")} ·{" "}
                        {job.config.color_metric}
                      </p>
                      <p className="font-mono text-xs kalmus-text-secondary mt-1">
                        {job.status === "duplicate"
                          ? `Reused existing result ${job.existingJobId?.slice(0, 8)}`
                          : `Queued as job ${job.jobId?.slice(0, 8)}`}
                      </p>
                    </div>

                    <Link
                      href={href}
                      className="kalmus-button-filled inline-flex items-center justify-center px-4 py-2 font-mono text-xs tracking-[0.18em] uppercase transition-all hover:brightness-90"
                    >
                      {job.status === "duplicate" ? "Open Result" : "Track Job"}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3">
            <Link
              href="/upload"
              className="inline-flex items-center px-5 py-2 font-mono text-xs tracking-[0.18em] uppercase transition-all kalmus-text-secondary border border-[var(--accent-crimson)] hover:bg-[var(--surface-bg-strong)] hover:text-[var(--text-primary)]"
            >
              Submit Another Video
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
