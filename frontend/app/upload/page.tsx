"use client";

import Link from "next/link";
import BarcodeGenerator from "../components/BarcodeGenerator";

export default function UploadPage() {
  return (
    <div className="min-h-screen">
      {/* Top Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-40 border-b border-amber-500/10 bg-black/40 backdrop-blur-md">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-amber-500/60 hover:text-amber-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="text-xs font-mono tracking-wider">[BACK]</span>
            </Link>
          </div>
          <div className="flex items-center gap-2 text-xs text-amber-500/60 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(212,165,116,0.6)] animate-pulse" />
            <span>UPLOAD_MODULE</span>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="max-w-3xl mx-auto">
          <header className="mb-10 opacity-0 animate-[fade-in-up_0.6s_ease-out_forwards]">
            <Link
              href="/"
              className="text-2xl font-light tracking-tight text-amber-400/90 mb-2 hover:text-amber-300 transition-colors inline-block font-mono"
            >
              KALMUS://
            </Link>
            <h1 className="text-sm text-amber-500/60 font-mono tracking-widest uppercase mt-2">
              Video Upload Interface
            </h1>
            <p className="text-xs text-neutral-500 font-mono mt-1">
              // Initialize new barcode generation sequence
            </p>
          </header>

          <div className="opacity-0 animate-[fade-in-up_0.6s_ease-out_0.1s_forwards]">
            <BarcodeGenerator />
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
