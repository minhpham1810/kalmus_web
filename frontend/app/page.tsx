"use client";

import BarcodeGenerator from "./components/BarcodeGenerator";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <header className="text-center mb-12">
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              KALMUS Movie Barcode Generator
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-300">
              Upload a movie file and generate a beautiful color barcode
              visualization
            </p>
          </header>

          <BarcodeGenerator />
        </div>
      </main>

      <footer className="py-8 text-center text-sm text-slate-500">
        <p>
          Powered by{" "}
          <a
            href="https://github.com/KALMUS-Color-Toolkit/KALMUS"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-blue-600"
          >
            KALMUS
          </a>
        </p>
      </footer>
    </div>
  );
}
