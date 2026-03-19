"use client";

import Link from "next/link";
import BarcodeGenerator from "../components/BarcodeGenerator";

export default function UploadPage() {
  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <header className="mb-8">
            <Link
              href="/"
              className="text-3xl font-light tracking-tight text-neutral-900 dark:text-neutral-100 mb-2 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors inline-block"
            >
              KALMUS
            </Link>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 font-light">
              Upload a new video for barcode generation
            </p>
            <Link
              href="/"
              className="inline-flex items-center mt-3 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
            >
              <span aria-hidden="true">&larr;</span>
              <span className="ml-1">Back to Search</span>
            </Link>
          </header>

          <BarcodeGenerator />
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-neutral-600 dark:text-neutral-400">
        <p>
          Powered by{" "}
          <a
            href="https://github.com/KALMUS-Color-Toolkit/KALMUS"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-neutral-600 dark:hover:text-neutral-400"
          >
            KALMUS
          </a>
        </p>
      </footer>
    </div>
  );
}
