"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

export default function SubmittedPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jobId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-xl space-y-6">
        {/* Success Card */}
        <div className="panel-bg border p-8" style={{ borderColor: 'var(--accent-crimson)', borderLeftWidth: 3 }}>

          {/* Status header */}
          <div className="flex items-center gap-3 mb-6">
            <div
              className="flex items-center justify-center w-10 h-10 font-mono text-sm"
              style={{ border: '1px solid var(--accent-amber)', color: 'var(--accent-amber)' }}
            >
              ✓
            </div>
            <div>
              <div className="font-mono text-[9px] tracking-[0.35em] uppercase kalmus-text-secondary mb-0.5">
                ▸ TRANSMISSION LOGGED
              </div>
              <h1 className="font-display text-xl tracking-wide kalmus-text-primary">
                Job Submitted
              </h1>
            </div>
          </div>

          <p className="font-mono text-xs kalmus-text-secondary mb-6 leading-relaxed">
            Your video has been queued for barcode generation on the HPC cluster.
          </p>

          {/* Job ID */}
          <div className="p-4 mb-6 kalmus-surface">
            <div className="font-mono text-[9px] tracking-[0.3em] uppercase kalmus-text-secondary mb-2">
              Job ID
            </div>
            <div className="flex items-center justify-between gap-3">
              <code className="text-sm font-mono kalmus-text-primary break-all">
                {jobId}
              </code>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 p-1.5 transition-all hover:opacity-80 hover:scale-105"
                style={{ color: copied ? 'var(--accent-amber)' : 'var(--color-neutral-500)' }}
                title="Copy job ID"
              >
                {copied ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* What happens next */}
          <div className="text-left space-y-3 mb-8">
            <h2 className="font-mono text-[9px] tracking-[0.3em] uppercase kalmus-text-secondary">
              ▸ Processing sequence
            </h2>
            <ol className="space-y-3">
              {[
                "KALMUS generates your color or brightness barcode on the HPC cluster.",
                "You'll receive an email with your barcode image attached.",
                "The email includes a direct link to your analytics dashboard.",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className="flex-shrink-0 font-mono text-[10px] mt-0.5 w-7"
                    style={{ color: 'var(--accent-amber)' }}
                  >
                    [{String(i + 1).padStart(2, '0')}]
                  </span>
                  <span className="font-mono text-xs kalmus-text-muted leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={`/results/${jobId}`}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 font-mono text-[11px] tracking-[0.18em] uppercase transition-all bg-[var(--accent-crimson)] text-[var(--foreground)] hover:brightness-110 hover:-translate-y-0.5 hover:shadow-md"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              View Analytics Dashboard
            </Link>
            <button
              onClick={() => router.push("/")}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 font-mono text-[11px] tracking-[0.18em] uppercase transition-all kalmus-text-secondary border border-[var(--accent-crimson)] hover:bg-[var(--surface-bg-strong)] hover:text-[var(--text-primary)] hover:shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Submit Another Video
            </button>
          </div>
        </div>

        {/* Note */}
        <p className="font-mono text-[9px] text-center kalmus-text-muted leading-relaxed">
          Save your Job ID — you can use it to access your dashboard at any time from{" "}
          <code className="font-mono kalmus-text-secondary">
            {typeof window !== "undefined" ? window.location.origin : ""}/results/{"{jobId}"}
          </code>
        </p>
      </div>
    </div>
  );
}
