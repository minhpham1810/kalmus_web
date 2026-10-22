"use client";
import { useEffect, useRef, useState } from "react";
import { isWatermarkExempt } from "@/lib/watermark";
interface CanvasZoomScatterProps {
  jobId: string;
  title?: string;
}
interface OSDViewer {
  drawer: { canvas: HTMLCanvasElement };
  addTiledImage(options: Record<string, unknown>): void;
  destroy(): void;
}
type Status = "loading" | "ready" | "missing" | "error";
export default function CanvasZoomScatter({
  jobId,
  title = "Canvas Zoom Scatter",
}: CanvasZoomScatterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OSDViewer | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  useEffect(() => {
    let cancelled = false;
    let viewer: OSDViewer | null = null;
    async function init() {
      const OpenSeadragonModule = await import("openseadragon");
      const OpenSeadragon = OpenSeadragonModule.default as unknown as (
        options: Record<string, unknown>
      ) => OSDViewer;
      if (cancelled || !containerRef.current) return;
      const base = `/api/frame-scatter-tiles/${jobId}`;
      let loadedCount = 0;
      let anyFailed = false;
      const totalToLoad = 2; // frames + axis
      viewer = OpenSeadragon({
        element: containerRef.current,
        prefixUrl: "https://cdn.jsdelivr.net/gh/Benomrans/openseadragon-icons@main/images/",
        showNavigator: true,
        // OSD min + max zoom on canvas
        minZoomLevel: 0.98,
        maxZoomLevel: 40,
        visibilityRatio: 1,
        constrainDuringPan: true,
        drawer: "canvas",
      });
      viewerRef.current = viewer;
      function checkDone() {
        loadedCount++;
        if (loadedCount >= totalToLoad && !cancelled) {
          setStatus(anyFailed ? "missing" : "ready");
        }
      }
      viewer.addTiledImage({
        tileSource: `${base}/axis/layer.dzi`,
        opacity: 1,
        x: 0,
        y: 0,
        width: 1,
        success: checkDone,
        error: checkDone,
      });

      // axis backgorund
      viewer.addTiledImage({
        tileSource: `${base}/frames/layer.dzi`,
        opacity: 1,
        x: 0,
        y: 0,
        width: 1,
        success: checkDone,
        error: () => {
          anyFailed = true;
          checkDone();
        },
      });
    }
    init().catch((err) => {
      console.error("Canvas zoom viewer failed to initialize", err);
      if (!cancelled) setStatus("error");
    });
    return () => {
      cancelled = true;
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [jobId]);
  const handleDownload = async () => {
    setDownloadError(null);
    // The canvas is too large to watermark in the browser, so generate_layers.py
    // writes a watermarked copy next to it.
    const file = isWatermarkExempt() ? "canvas.png" : "canvas_watermarked.png";
    const url = `/api/frame-scatter-tiles/${jobId}/frames/${file}`;
    console.log("Download URL: ", url);

    try {
      const res = await fetch(url, {method: "HEAD"});
      if (!res.ok) {
        console.error(`Download failed: server returned ${res.status} for ${url}`);
        setDownloadError("Couldn't download canvas. Please try again");
        return
      }

      const filmTitle = title.replace(/^Canvas Zoom\s*-\s*/i, "");
      const safeTitle = filmTitle.replace(/[\\/:*?"<>|]/g, "").trim() || jobId;

      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeTitle}-canvas_zoom.png`;
      link.click();
    } catch (err) {
      console.error("Download failed", err);
      setDownloadError("Couldn't download canvas. Please try again");
    }
  };
  return (
    <div className="space-y-4">
      <div className="panel-bg rounded border border-neutral-200 dark:border-neutral-700 p-4">
        <div className="relative flex items-center justify-center mb-3">
          <p className="text-sm font-medium" style={{ color: "#444" }}>
            {title}
          </p>
          {status === "ready" && (
            <>
            <button
              onClick={handleDownload}
              className="absolute right-0 px-2.5 py-1 font-mono text-xs uppercase tracking-wider border border-[var(--input-border)] hover:border-[var(--accent-amber)] hover:text-[var(--text-primary)] transition-colors"
            >
              Download
            </button>
            {downloadError && (
              <p
                role = "alert"
                className="max-w-xs text-right font-mono text-xs kalmus-text-secondary"
              >
                {downloadError}
              </p>
            )}
          </>
        )}
      </div>
        {status === "missing" && (
          <div className="py-16 text-center">
            <p className="font-mono text-xs kalmus-text-secondary">
              Frame scatter tiles haven&apos;t been generated for this film yet.
            </p>
          </div>
        )}
        {status === "error" && (
          <div className="py-16 text-center">
            <p className="font-mono text-xs kalmus-text-secondary">
              The layer viewer failed to load.
            </p>
          </div>
        )}
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: 550,
            display: status === "ready" || status === "loading" ? "block" : "none",
            background: "#111",
          }}
        />
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        tbd description
      </p>
    </div>
  );
}