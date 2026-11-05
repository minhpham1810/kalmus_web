"use client";

import { useState } from "react";
import { buildPosterKit } from "@/lib/poster-kit";
import { downloadBlob } from "@/lib/watermark";

interface PosterKitButtonProps {
  jobId: string;
  title: string;
}

export default function PosterKitButton({ jobId, title }: PosterKitButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const kit = await buildPosterKit(jobId, title);
      downloadBlob(kit.blob, kit.filename);
    } catch (err) {
      console.error("Poster kit failed:", err);
      setError(err instanceof Error ? err.message : "Poster kit failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2 shrink-0">
      <button
        onClick={handleClick}
        disabled={busy}
        title="Download barcode, canvas zoom, histogram and hue/lightness scatter as a .zip"
        className="font-mono text-xs tracking-wider uppercase transition-colors"
        style={{
          padding: "4px 10px",
          background: "transparent",
          color: "var(--text-muted)",
          cursor: busy ? "wait" : "pointer",
        }}
      >
        {busy ? "Building…" : "Poster kit"}
      </button>
      {error && (
        <span className="font-mono text-xs" style={{ color: "var(--accent-crimson)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
