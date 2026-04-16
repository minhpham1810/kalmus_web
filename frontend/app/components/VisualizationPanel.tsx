"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import InteractiveHistogram from "./InteractiveHistogram";
import InteractiveRGBCube from "./InteractiveRGBCube";
import InteractiveHueLightScatter from "./InteractiveHueLightScatter";
import InteractiveHueLight3DBar from "./InteractiveHueLight3DBar";
import BarcodeComparison from "./BarcodeComparison";
import ColorStatsDashboard from "./ColorStatsDashboard";
import CSVExportButton from "./CSVExportButton";
import BarcodePreview from "./BarcodePreview";
import { RGB, BarcodeData, ThumbnailManifest } from "@/lib/barcode-utils";

interface FilmSearchResult {
  job_id: string;
  title: string;
  imdb_id: string | null;
  poster: string | null;
  director: string | null;
  runtime_minutes: string | null;
  country: string | null;
  released: string | null;
  barcode_type: string;
  frame_type: string;
  metric: string;
  process_date: string;
}

interface VisualizationPanelProps {
  jobId: string;
  videoFilename?: string;
  compareJobId?: string;
}

type VisualizationTab =
  | "histogram"
  | "colorcube"
  | "huelightscatter"
  | "huelight3d"
  | "stats"
  | "comparison";

interface LoadedBarcodeData {
  colors?: RGB[];
  brightness?: number[];
  barcode_type: "Color" | "Brightness";
  sampled_frame_rate: number;
  skip_over: number;
  color_metric?: string;
  frame_type?: string;
  total_frames?: number;
  fps?: number;
  barcodeImageUrl?: string;
  barcodeImage?: RGB[][] | number[][];
  thumbnails?: ThumbnailManifest | null;
}

function FilmSearch({
  currentJobId,
  compareJobId,
  onSelect,
  onClear,
}: {
  currentJobId: string;
  compareJobId: string | null;
  onSelect: (job_id: string, title: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FilmSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    fetch(`/api/search-films?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results || []);
        setOpen(true);
      })
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 300);
  };

  const handleSelect = (r: FilmSearchResult) => {
    setQuery(r.title);
    setOpen(false);
    onSelect(r.job_id, r.title);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    onClear();
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="block font-mono text-[9px] tracking-[0.3em] uppercase kalmus-text-secondary mb-2">
        Compare with another film
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={handleChange}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search films in database…"
            className="kalmus-input w-full px-3 py-2 font-mono text-xs focus:outline-none"
            style={{ borderRadius: 0 }}
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <svg className="animate-spin h-4 w-4 kalmus-text-muted" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}
        </div>
        {compareJobId && (
          <button
            onClick={handleClear}
            className="px-3 py-2 font-mono text-xs transition-all hover:opacity-80 hover:scale-[1.02]"
            style={{ border: '1px solid var(--input-border)', color: 'var(--accent-crimson)', background: 'transparent', borderRadius: 0 }}
            title="Clear comparison"
          >
            ✕
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto" style={{ background: 'var(--panel-gradient)', border: '1px solid var(--input-border)' }}>
          {results.map((r) => (
            <button
              key={r.job_id}
              onClick={() => handleSelect(r)}
              className={`w-full text-left px-4 py-3 transition-colors ${r.job_id === currentJobId ? "opacity-40" : ""}`}
              style={{ borderBottom: '1px solid var(--surface-border)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs kalmus-text-primary truncate">
                  {r.title}
                </span>
                <span className="font-mono text-[10px] kalmus-text-secondary shrink-0">
                  {r.released ? r.released.slice(0, 4) : ""}
                </span>
              </div>
              <div className="flex gap-2 mt-0.5">
                <span className="font-mono text-[10px] kalmus-text-secondary">{r.barcode_type}</span>
                <span style={{ color: 'var(--accent-crimson)' }}>·</span>
                <span className="font-mono text-[10px] kalmus-text-secondary">{r.frame_type}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && results.length === 0 && !searching && query.trim() && (
        <div className="absolute z-50 mt-1 w-full px-4 py-3" style={{ background: 'var(--panel-gradient)', border: '1px solid var(--input-border)' }}>
          <p className="font-mono text-xs kalmus-text-secondary">No films found.</p>
        </div>
      )}
    </div>
  );
}

export default function VisualizationPanel({
  jobId,
  videoFilename = "Video",
  compareJobId: initialCompareJobId,
}: VisualizationPanelProps) {
  const [activeTab, setActiveTab] = useState<VisualizationTab>("histogram");
  const [barcodeData, setBarcodeData] = useState<LoadedBarcodeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [compareJobId, setCompareJobId] = useState<string | null>(initialCompareJobId || null);
  const [compareTitle, setCompareTitle] = useState<string>("");
  const [compareData, setCompareData] = useState<LoadedBarcodeData | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const loadBarcodeData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/job-result/${jobId}`);
      if (!response.ok) {
        throw new Error("Failed to load barcode data");
      }

      const data = await response.json();

      if (data.success && data.barcode) {
        const barcode = data.barcode;
        setBarcodeData({
          colors: barcode.colors as RGB[],
          brightness: barcode.brightness,
          barcode_type: barcode.barcode_type || "Color",
          sampled_frame_rate: barcode.sampled_frame_rate || 1,
          skip_over: barcode.skip_over || 0,
          color_metric: barcode.color_metric,
          frame_type: barcode.frame_type,
          total_frames: barcode.total_frames,
          fps: barcode.fps,
          barcodeImage: barcode.barcode as RGB[][] | number[][],
          thumbnails: data.thumbnails,
        });
      } else {
        throw new Error("Invalid barcode data");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    loadBarcodeData();
  }, [loadBarcodeData]);

  const loadCompareData = async (cJobId: string) => {
    setCompareLoading(true);
    setCompareData(null);
    try {
      const res = await fetch(`/api/job-result/${cJobId}`);
      if (!res.ok) throw new Error("Failed to load comparison barcode");
      const data = await res.json();
      if (data.success && data.barcode) {
        const b = data.barcode;
        setCompareData({
          colors: b.colors as RGB[],
          brightness: b.brightness,
          barcode_type: b.barcode_type || "Color",
          sampled_frame_rate: b.sampled_frame_rate || 1,
          skip_over: b.skip_over || 0,
          color_metric: b.color_metric,
          frame_type: b.frame_type,
          total_frames: b.total_frames,
          fps: b.fps,
          barcodeImage: b.barcode as RGB[][] | number[][],
          thumbnails: data.thumbnails,
        });
      }
    } catch {
      // compareData stays null
    } finally {
      setCompareLoading(false);
    }
  };

  const isColorBarcode = barcodeData?.barcode_type === "Color";

  const tabs: Array<{ id: VisualizationTab; label: string; icon: string; colorOnly?: boolean }> = [
    { id: "histogram", label: isColorBarcode ? "Hue Histogram" : "Brightness Histogram", icon: "M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" },
    { id: "colorcube", label: "RGB Cube", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4", colorOnly: true },
    { id: "huelightscatter", label: "Hue/Light Scatter", icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", colorOnly: true },
    { id: "huelight3d", label: "Hue/Light 3D", icon: "M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5", colorOnly: true },
    { id: "stats", label: "Statistics", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
    { id: "comparison", label: "Compare", icon: "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" },
  ];

  const availableTabs = tabs.filter((tab) => !tab.colorOnly || isColorBarcode);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="panel-bg p-6" style={{ border: '1px solid var(--surface-border)' }}>
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3">
                <svg
                className="animate-spin h-5 w-5 kalmus-text-secondary"
                  viewBox="0 0 24 24"
                >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="font-mono text-xs tracking-[0.18em] uppercase kalmus-text-secondary">
                Loading barcode data...
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="panel-bg p-6" style={{ border: '1px solid var(--accent-crimson)' }}>
          <div className="p-4 text-center kalmus-surface-strong">
            <p className="font-mono text-xs kalmus-text-secondary mb-3">{error}</p>
            <button
              onClick={loadBarcodeData}
              className="px-4 py-1.5 font-mono text-[10px] tracking-wider uppercase transition-all bg-[var(--accent-crimson)] text-[var(--foreground)] hover:brightness-110 hover:-translate-y-px hover:shadow-md"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="panel-bg p-6" style={{ border: '1px solid var(--surface-border)', borderLeftWidth: 3, borderLeftColor: 'var(--accent-crimson)' }}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="font-mono text-[9px] tracking-[0.35em] uppercase kalmus-text-secondary mb-1">
              ▸ BARCODE VISUALIZATIONS
            </div>
            <h2 className="font-display text-lg kalmus-text-primary">
              {videoFilename}
            </h2>
            <p className="font-mono text-[10px] kalmus-text-secondary mt-0.5">
              {barcodeData?.barcode_type} Barcode
            </p>
          </div>

          <div className="flex items-center gap-3">
            {barcodeData && (
              <CSVExportButton
                barcodeData={barcodeData as BarcodeData}
                jobId={jobId}
                title={`${barcodeData.barcode_type}_barcode_${videoFilename}`}
              />
            )}
          </div>
        </div>
      </div>

      {/* Barcode Preview (Collapsible) */}
      {barcodeData?.barcodeImage && activeTab !== "comparison" && (
        <BarcodePreview
          barcode={barcodeData.barcodeImage}
          barcodeType={barcodeData.barcode_type}
          title={`${barcodeData.barcode_type} Barcode - ${videoFilename}`}
          fps={barcodeData.fps}
          sampledFrameRate={barcodeData.sampled_frame_rate}
          skipOver={barcodeData.skip_over}
          totalFrames={barcodeData.total_frames}
          thumbnails={barcodeData.thumbnails}
        />
      )}

      {/* Tab Navigation */}
      <div className="panel-bg" style={{ border: '1px solid var(--surface-border)' }}>
        <div className="overflow-x-auto" style={{ borderBottom: '1px solid rgba(100,100,100,0.25)' }}>
          <nav className="flex min-w-max" aria-label="Tabs">
            {availableTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="group flex items-center gap-2 py-3 px-4 font-mono text-[10px] tracking-[0.15em] uppercase whitespace-nowrap transition-all border-b-2"
                style={{
                  borderBottomColor: activeTab === tab.id ? 'var(--accent-amber)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: activeTab === tab.id ? 'var(--surface-bg-strong)' : 'transparent',
                  boxShadow: activeTab === tab.id ? 'inset 0 -2px 0 var(--accent-amber)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.background = 'var(--surface-bg)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                    e.currentTarget.style.borderBottomColor = 'var(--accent-crimson)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                    e.currentTarget.style.borderBottomColor = 'transparent';
                  }
                }}
              >
                <svg
                  className="w-3.5 h-3.5 transition-transform group-hover:scale-110"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={tab.icon}
                  />
                </svg>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">

          {activeTab === "histogram" && barcodeData && (
            <InteractiveHistogram
              colors={barcodeData.colors}
              brightness={barcodeData.brightness}
              barcodeType={barcodeData.barcode_type}
              title={
                barcodeData.barcode_type === "Color"
                  ? `Hue Distribution - ${videoFilename}`
                  : `Brightness Distribution - ${videoFilename}`
              }
            />
          )}

          {activeTab === "colorcube" && barcodeData?.colors && (
            <InteractiveRGBCube
              colors={barcodeData.colors}
              title={`RGB Color Cube - ${videoFilename}`}
              maxSamples={20000}
            />
          )}

          {activeTab === "huelightscatter" && barcodeData?.colors && (
            <InteractiveHueLightScatter
              colors={barcodeData.colors}
              title={`Hue vs Lightness - ${videoFilename}`}
              maxSamples={20000}
            />
          )}

          {activeTab === "huelight3d" && barcodeData?.colors && (
            <InteractiveHueLight3DBar
              colors={barcodeData.colors}
              title={`Hue/Light 3D Distribution - ${videoFilename}`}
            />
          )}

          {activeTab === "stats" && (
            <ColorStatsDashboard jobId={jobId} title={`Statistics for ${videoFilename}`} />
          )}

          {activeTab === "comparison" && barcodeData && (
            <div className="space-y-6">
              <FilmSearch
                currentJobId={jobId}
                compareJobId={compareJobId}
                onSelect={(job_id, title) => {
                  setCompareJobId(job_id);
                  setCompareTitle(title);
                  loadCompareData(job_id);
                }}
                onClear={() => {
                  setCompareJobId(null);
                  setCompareData(null);
                  setCompareTitle("");
                }}
              />

              {barcodeData.barcodeImage && (
                <BarcodePreview
                  barcode={barcodeData.barcodeImage}
                  barcodeType={barcodeData.barcode_type}
                  title={`${barcodeData.barcode_type} Barcode — ${videoFilename}`}
                  fps={barcodeData.fps}
                  sampledFrameRate={barcodeData.sampled_frame_rate}
                  skipOver={barcodeData.skip_over}
                  totalFrames={barcodeData.total_frames}
                  thumbnails={barcodeData.thumbnails}
                />
              )}

              {compareLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-3">
                    <svg className="animate-spin h-4 w-4 kalmus-text-secondary" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="font-mono text-xs tracking-[0.15em] uppercase kalmus-text-secondary">Loading comparison barcode...</span>
                  </div>
                </div>
              )}

              {!compareLoading && compareData?.barcodeImage && (
                <BarcodePreview
                  barcode={compareData.barcodeImage}
                  barcodeType={compareData.barcode_type}
                  title={`${compareData.barcode_type} Barcode — ${compareTitle}`}
                  fps={compareData.fps}
                  sampledFrameRate={compareData.sampled_frame_rate}
                  skipOver={compareData.skip_over}
                  totalFrames={compareData.total_frames}
                  thumbnails={compareData.thumbnails}
                />
              )}

              {compareJobId && (
                <BarcodeComparison
                  jobId1={jobId}
                  jobId2={compareJobId}
                  title1={videoFilename}
                  title2={compareTitle}
                />
              )}

              {!compareJobId && (
                <p className="font-mono text-xs text-center kalmus-text-muted py-6 tracking-wider">
                  Search for a film above to compare barcodes side by side.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Info Panel */}
      <div className="p-4 kalmus-surface">
        <h4 className="font-mono text-[9px] tracking-[0.3em] uppercase kalmus-text-secondary mb-2">
          ▸ About These Visualizations
        </h4>
        <ul className="font-mono text-[10px] kalmus-text-secondary space-y-1">
          <li>
            <strong>Statistics:</strong> Overview of barcode metadata, dominant colors, and
            brightness distribution
          </li>
          <li>
            <strong>Histogram:</strong>{" "}
            {isColorBarcode
              ? "Distribution of color hues (0-360°) across all frames"
              : "Distribution of brightness values (0-255) across all frames"}
          </li>
          {isColorBarcode && (
            <>
              <li>
                <strong>RGB Cube:</strong> 3D scatter plot of RGB colors in the barcode (drag to
                rotate)
              </li>
              <li>
                <strong>Hue/Light Scatter:</strong> 2D scatter plot showing hue vs lightness
                distribution
              </li>
              <li>
                <strong>Hue/Light 3D:</strong> 3D visualization of color distribution with
                adjustable resolution and camera controls
              </li>
            </>
          )}
          <li>
            <strong>Compare:</strong> Side-by-side barcode comparison with similarity metrics
            (SSIM, NRMSE, cross-correlation, sequence alignment)
          </li>
          <li>
            <strong>Export CSV:</strong> Download per-frame color/brightness data with frame
            indices
          </li>
        </ul>
      </div>
    </div>
  );
}
