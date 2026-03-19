"use client";

import { useState, useEffect } from "react";
import InteractiveHistogram from "./InteractiveHistogram";
import InteractiveRGBCube from "./InteractiveRGBCube";
import InteractiveHueLightScatter from "./InteractiveHueLightScatter";
import InteractiveHueLight3DBar from "./InteractiveHueLight3DBar";
import BarcodeComparison from "./BarcodeComparison";
import ColorStatsDashboard from "./ColorStatsDashboard";
import CSVExportButton from "./CSVExportButton";
import BarcodePreview from "./BarcodePreview";
import { RGB, BarcodeData } from "@/lib/barcode-utils";

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
  | "stats";

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
  barcodeImage?: RGB[][] | number[][];  // 2D array for rendering
}

export default function VisualizationPanel({
  jobId,
  videoFilename = "Video",
  compareJobId,
}: VisualizationPanelProps) {
  const [activeTab, setActiveTab] = useState<VisualizationTab>("histogram");
  const [barcodeData, setBarcodeData] = useState<LoadedBarcodeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load barcode data on mount
  useEffect(() => {
    loadBarcodeData();
  }, [jobId]);

  const loadBarcodeData = async () => {
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
          barcodeImage: barcode.barcode as RGB[][] | number[][],  // 2D barcode array
        });
      } else {
        throw new Error("Invalid barcode data");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Define tabs based on barcode type
  const isColorBarcode = barcodeData?.barcode_type === "Color";

  const tabs: Array<{ id: VisualizationTab; label: string; icon: string; colorOnly?: boolean }> = [
    { id: "histogram", label: isColorBarcode ? "Hue Histogram" : "Brightness Histogram", icon: "M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" },
    { id: "colorcube", label: "RGB Cube", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4", colorOnly: true },
    { id: "huelightscatter", label: "Hue/Light Scatter", icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01", colorOnly: true },
    { id: "huelight3d", label: "Hue/Light 3D", icon: "M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5", colorOnly: true },
    { id: "stats", label: "Statistics", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  ];

  // // Add comparison tab if needed
  // if (compareJobId || showComparison) {
  //   tabs.push({ id: "comparison", label: "Comparison", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" });
  // }

  // Filter tabs based on barcode type
  const availableTabs = tabs.filter((tab) => !tab.colorOnly || isColorBarcode);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="panel-bg border border-neutral-200 dark:border-neutral-700 rounded p-6">
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3">
              <svg
                className="animate-spin h-5 w-5 text-neutral-600 dark:text-neutral-400"
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
              <span className="text-sm text-neutral-600 dark:text-neutral-400">
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
        <div className="panel-bg border border-neutral-200 dark:border-neutral-700 rounded p-6">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-4 text-center">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            <button
              onClick={loadBarcodeData}
              className="mt-3 px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
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
      <div className="panel-bg border border-neutral-200 dark:border-neutral-700 rounded p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-light text-neutral-900 dark:text-neutral-100 mb-1">
              Barcode Visualizations
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {videoFilename} ({barcodeData?.barcode_type} Barcode)
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
      {barcodeData?.barcodeImage && (
        <BarcodePreview
          barcode={barcodeData.barcodeImage}
          barcodeType={barcodeData.barcode_type}
          title={`${barcodeData.barcode_type} Barcode - ${videoFilename}`}
          fps={barcodeData.fps}
          sampledFrameRate={barcodeData.sampled_frame_rate}
          skipOver={barcodeData.skip_over}
          totalFrames={barcodeData.total_frames}
        />
      )}

      {/* Tab Navigation */}
      <div className="panel-bg border border-neutral-200 dark:border-neutral-700 rounded">
        <div className="border-b border-neutral-200 dark:border-neutral-700 overflow-x-auto">
          <nav className="flex -mb-px min-w-max" aria-label="Tabs">
            {availableTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 py-4 px-4 text-center text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                  ${
                    activeTab === tab.id
                      ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100"
                      : "border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-600"
                  }
                `}
              >
                <svg
                  className="w-4 h-4"
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
              maxSamples={10000}
            />
          )}

          {activeTab === "huelightscatter" && barcodeData?.colors && (
            <InteractiveHueLightScatter
              colors={barcodeData.colors}
              title={`Hue vs Lightness - ${videoFilename}`}
              maxSamples={10000}
            />
          )}

          {activeTab === "huelight3d" && barcodeData?.colors && (
            <InteractiveHueLight3DBar
              colors={barcodeData.colors}
              title={`Hue/Light 3D Distribution - ${videoFilename}`}
            />
          )}

          {/* {activeTab === "comparison" && compareJobId && (
            <BarcodeComparison
              jobId1={jobId}
              jobId2={compareJobId}
              title1={videoFilename}
              title2="Comparison Video"
            />
          )} */}
          {activeTab === "stats" && (
            <ColorStatsDashboard jobId={jobId} title={`Statistics for ${videoFilename}`} />
          )}
          {/* {activeTab === "comparison" && !compareJobId && showComparison && (
            <div className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded p-6 text-center">
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                Enter a job ID to compare with:
              </p>
              <ComparisonInput
                currentJobId={jobId}
                onCompare={(newJobId) => {
                  // Navigate to comparison page or update state
                  window.location.href = `/results/${jobId}?compare=${newJobId}`;
                }}
              />
            </div>
          )} */}
        </div>
      </div>

      {/* Info Panel */}
      <div className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded p-4">
        <h4 className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2 uppercase tracking-wide">
          About These Visualizations
        </h4>
        <ul className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
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
            <strong>Export CSV:</strong> Download per-frame color/brightness data with frame
            indices
          </li>
        </ul>
      </div>
    </div>
  );
}

// function ComparisonInput({
//   currentJobId,
//   onCompare,
// }: {
//   currentJobId: string;
//   onCompare: (jobId: string) => void;
// }) {
//   const [inputJobId, setInputJobId] = useState("");

//   const handleSubmit = (e: React.FormEvent) => {
//     e.preventDefault();
//     if (inputJobId && inputJobId !== currentJobId) {
//       onCompare(inputJobId);
//     }
//   };

//   return (
//     <form onSubmit={handleSubmit} className="max-w-md mx-auto">
//       <div className="flex gap-2">
//         <input
//           type="text"
//           value={inputJobId}
//           onChange={(e) => setInputJobId(e.target.value)}
//           placeholder="Enter Job ID (e.g., a1b2c3d4-...)"
//           className="flex-1 px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400"
//         />
//         <button
//           type="submit"
//           disabled={!inputJobId || inputJobId === currentJobId}
//           className="px-4 py-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium rounded hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
//         >
//           Compare
//         </button>
//       </div>
//       {inputJobId === currentJobId && (
//         <p className="text-xs text-red-600 dark:text-red-400 mt-2">
//           Cannot compare a barcode with itself
//         </p>
//       )}
//     </form>
//   );
// }
