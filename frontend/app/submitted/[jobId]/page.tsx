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
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex items-center justify-center p-4">
      <div className="w-full max-w-xl space-y-6">
        {/* Success Card */}
        <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-8 text-center">
          {/* Icon */}
          <div className="inline-flex items-center justify-center w-14 h-14 bg-neutral-100 dark:bg-neutral-700 rounded-full mb-5">
            <svg
              className="w-7 h-7 text-neutral-700 dark:text-neutral-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-light tracking-tight text-neutral-900 dark:text-neutral-100 mb-2">
            Job Submitted
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
            Your video has been queued for barcode generation on the HPC cluster.
          </p>

          {/* Job ID */}
          <div className="bg-neutral-100 dark:bg-neutral-900 rounded-lg p-4 mb-6 text-left">
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1 uppercase tracking-wide">
              Job ID
            </div>
            <div className="flex items-center justify-between gap-3">
              <code className="text-sm font-mono text-neutral-800 dark:text-neutral-200 break-all">
                {jobId}
              </code>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 p-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded transition-colors"
                title="Copy job ID"
              >
                {copied ? (
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <h2 className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
              What happens next
            </h2>
            <ol className="space-y-2">
              {[
                "KALMUS generates your color or brightness barcode on the HPC cluster.",
                "You'll receive an email with your barcode image attached.",
                "The email includes a direct link to your analytics dashboard.",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-xs font-medium text-neutral-700 dark:text-neutral-300 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={`/results/${jobId}`}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium rounded hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              View Analytics Dashboard
            </Link>
            <button
              onClick={() => router.push("/")}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 text-sm font-medium rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Submit Another Video
            </button>
          </div>
        </div>

        {/* Note */}
        <p className="text-xs text-center text-neutral-400 dark:text-neutral-500">
          Save your Job ID — you can use it to access your dashboard at any time from{" "}
          <code className="font-mono">
            {typeof window !== "undefined" ? window.location.origin : ""}/results/{"{jobId}"}
          </code>
        </p>
      </div>
    </div>
  );
}
