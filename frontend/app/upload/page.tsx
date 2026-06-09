"use client";

import Link from "next/link";
import Image from "next/image";
import {useSearchParams} from "next/navigation";
import {Suspense} from "react";
import BarcodeGenerator from "../components/BarcodeGenerator";

function UploadPageContent() {
  const searchParams = useSearchParams();
  const fromAdmin = searchParams.get("from") === "admin"; // checks if admin
  const backHref = fromAdmin ? "/admin" : "/"

  return (
    <div className="min-h-screen">
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <header className="mb-8">
            <Link href = {backHref} className="inline-block mb-3">
              <Image
                src="/kalmus-logo.png"
                alt="KALMUS"
                width={240}
                height={80}
                className="dark:invert"
                priority
              />
            </Link>
            <p className="text-sm kalmus-text-secondary font-mono tracking-wide">
              Upload a new video for barcode generation
            </p>
            <Link
              href= {backHref}
              className="inline-flex items-center mt-3 font-mono text-xs tracking-[0.18em] uppercase kalmus-text-secondary hover:text-[var(--text-primary)] transition-colors"
            >
              <span aria-hidden="true">&larr;</span>
              <span className="ml-1">Back to Archive</span>
            </Link>
          </header>

          <BarcodeGenerator />
        </div>
      </main>

      <footer className="py-6 text-center">
        <p className="font-mono text-xs tracking-[0.28em] uppercase kalmus-text-muted">
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

export default function UploadPage() {
  return (
    <Suspense fallback = {null}>
      <UploadPageContent/>
    </Suspense>
  )
}
