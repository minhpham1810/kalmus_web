"use client";

import BarcodeGenerator from "./components/BarcodeGenerator";

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900">
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <header className="mb-8">
            <h1 className="text-3xl font-light tracking-tight text-neutral-900 dark:text-neutral-100 mb-2">
              KALMUS
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 font-light">
              Movie Barcode Generator
            </p>
          </header>

          <BarcodeGenerator />
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-neutral-400 dark:text-neutral-600">
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
