"use client";

import { useState } from "react";
import HueHistogram from "./HueHistogram";
import ColorCubeVisualization from "./ColorCubeVisualization";
import BarcodeComparison from "./BarcodeComparison";
import ColorStatsDashboard from "./ColorStatsDashboard";

interface VisualizationPanelProps {
  jobId: string;
  videoFilename?: string;
  compareJobId?: string;
}

type VisualizationTab = "stats" | "histogram" | "colorcube" | "comparison";

export default function VisualizationPanel({
  jobId,
  videoFilename = "Video",
  compareJobId,
}: VisualizationPanelProps) {
  const [activeTab, setActiveTab] = useState<VisualizationTab>("stats");
  const [showComparison, setShowComparison] = useState(false);

  const tabs: Array<{ id: VisualizationTab; label: string; icon: string }> = [
    { id: "stats", label: "Statistics", icon: "📊" },
    { id: "histogram", label: "Hue Distribution", icon: "📈" },
    { id: "colorcube", label: "Color Cube", icon: "🎨" },
  ];

  if (compareJobId || showComparison) {
    tabs.push({ id: "comparison", label: "Comparison", icon: "⚖️" });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-light text-neutral-900 dark:text-neutral-100 mb-1">
              Barcode Visualizations
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {videoFilename}
            </p>
          </div>

          {!compareJobId && (
            <button
              onClick={() => setShowComparison(!showComparison)}
              className="px-4 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors text-neutral-700 dark:text-neutral-300"
            >
              {showComparison ? "Hide Comparison" : "Compare with Another"}
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded">
        <div className="border-b border-neutral-200 dark:border-neutral-700">
          <nav className="flex -mb-px" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex-1 py-4 px-4 text-center text-sm font-medium border-b-2 transition-colors
                  ${
                    activeTab === tab.id
                      ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100"
                      : "border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-600"
                  }
                `}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === "stats" && (
            <ColorStatsDashboard jobId={jobId} title={`Statistics for ${videoFilename}`} />
          )}

          {activeTab === "histogram" && (
            <HueHistogram jobId={jobId} title={`Hue Distribution - ${videoFilename}`} />
          )}

          {activeTab === "colorcube" && (
            <ColorCubeVisualization
              jobId={jobId}
              title={`Color Cube - ${videoFilename}`}
              sampleSize={3000}
            />
          )}

          {activeTab === "comparison" && compareJobId && (
            <BarcodeComparison
              jobId1={jobId}
              jobId2={compareJobId}
              title1={videoFilename}
              title2="Comparison Video"
            />
          )}

          {activeTab === "comparison" && !compareJobId && showComparison && (
            <div className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded p-6 text-center">
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                Enter a job ID to compare with:
              </p>
              <ComparisonInput
                currentJobId={jobId}
                onCompare={(newJobId) => {
                  // This would be handled by parent component
                  console.log("Comparing with:", newJobId);
                }}
              />
            </div>
          )}
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
            <strong>Hue Distribution:</strong> Histogram showing the distribution of color hues
            (0-360°) across all frames
          </li>
          <li>
            <strong>Color Cube:</strong> 3D scatter plot of RGB colors in the barcode (drag to
            rotate)
          </li>
          <li>
            <strong>Comparison:</strong> Six different similarity metrics comparing two barcodes
          </li>
        </ul>
      </div>
    </div>
  );
}

function ComparisonInput({
  currentJobId,
  onCompare,
}: {
  currentJobId: string;
  onCompare: (jobId: string) => void;
}) {
  const [inputJobId, setInputJobId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputJobId && inputJobId !== currentJobId) {
      onCompare(inputJobId);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto">
      <div className="flex gap-2">
        <input
          type="text"
          value={inputJobId}
          onChange={(e) => setInputJobId(e.target.value)}
          placeholder="Enter Job ID (e.g., a1b2c3d4-...)"
          className="flex-1 px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400"
        />
        <button
          type="submit"
          disabled={!inputJobId || inputJobId === currentJobId}
          className="px-4 py-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium rounded hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Compare
        </button>
      </div>
      {inputJobId === currentJobId && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-2">
          Cannot compare a barcode with itself
        </p>
      )}
    </form>
  );
}
