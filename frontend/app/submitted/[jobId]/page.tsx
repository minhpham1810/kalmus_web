"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function SubmittedPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  const [copied, setCopied] = useState(false);
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jobId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-xl space-y-6 opacity-0 animate-[fade-in-up_0.6s_ease-out_forwards]">
        {/* Success Card */}
        <div className="panel border border-amber-500/20 rounded-lg p-8 text-center relative overflow-hidden">
          {/* Decorative corner accents */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-amber-500/30" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-amber-500/30" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-amber-500/30" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-amber-500/30" />
          
          {/* Status indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-cyan-400/80 font-mono mb-6">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(78,205,196,0.6)] animate-pulse" />
            <span>JOB_SUBMITTED</span>
            <span className="text-neutral-500 ml-2">{time}</span>
          </div>

          {/* Icon */}
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-full mb-6">
            <svg
              className="w-8 h-8 text-amber-500"
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

          <h1 className="text-2xl font-light tracking-tight text-amber-100/90 mb-2 font-mono">
            TRANSMISSION_COMPLETE
          </h1>
          <p className="text-sm text-neutral-400 mb-8 font-mono">
            // Video queued for HPC cluster processing
          </p>

          {/* Job ID */}
          <div className="bg-black/40 border border-amber-500/20 rounded-lg p-4 mb-8 text-left">
            <div className="text-xs text-amber-500/60 mb-2 uppercase tracking-widest font-mono flex items-center gap-2">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              JOB_IDENTIFIER
            </div>
            <div className="flex items-center justify-between gap-3">
              <code className="text-sm font-mono text-cyan-400/90 break-all">
                {jobId}
              </code>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 p-2 text-amber-500/60 hover:text-amber-400 hover:bg-amber-500/10 rounded transition-all duration-200"
                title="Copy job ID"
              >
                {copied ? (
                  <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <div className="text-left space-y-4 mb-8">
            <h2 className="text-xs font-mono text-amber-500/60 uppercase tracking-widest flex items-center gap-2">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              SEQUENCE_PROTOCOL
            </h2>
            <ol className="space-y-3">
              {[
                "KALMUS generates color/brightness barcode via HPC cluster",
                "Email notification dispatched with barcode attachment",
                "Analytics dashboard link included in transmission",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded bg-amber-500/10 border border-amber-500/20 text-xs font-mono text-amber-500">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-sm text-neutral-400 font-mono">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href={`/results/${jobId}`}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-600 to-amber-700 text-black text-sm font-mono font-medium tracking-wider rounded border border-amber-500/30 hover:shadow-[0_0_25px_rgba(212,165,116,0.3)] transition-all duration-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              VIEW_ANALYTICS
            </Link>
            <button
              onClick={() => router.push("/")}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-transparent border border-amber-500/30 text-amber-500/80 text-sm font-mono tracking-wider rounded hover:bg-amber-500/10 hover:border-amber-500/50 hover:text-amber-400 transition-all duration-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              SUBMIT_ANOTHER
            </button>
          </div>
        </div>

        {/* Note */}
        <div className="text-center">
          <p className="text-xs font-mono text-neutral-500">
            // Preserve JOB_ID for dashboard access at{" "}
            <code className="text-amber-500/60">
              /results/{"{JOB_ID}"}
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}
