"use client";

import { useEffect, useState } from "react";

interface HueHistogramProps {
  jobId: string;
  title?: string;
}

export default function HueHistogram({ jobId, title = "Hue Distribution" }: HueHistogramProps) {
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadHistogram = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch the histogram from the KALMUS API endpoint
        const response = await fetch(
          `/api/visualization/hue-histogram/${jobId}?binStep=1&saturationThreshold=0`
        );
        if (!response.ok) {
          throw new Error("Failed to generate hue histogram");
        }

        const data = await response.json();

        if (data.success && data.image) {
          setImageData(data.image);
        } else {
          throw new Error("Invalid response from histogram API");
        }
      } catch (error) {
        console.error("Error loading hue histogram:", error);
        setError(error instanceof Error ? error.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    loadHistogram();
  }, [jobId]);

  return (
    <div className="panel-bg border border-neutral-200 dark:border-neutral-700 rounded p-6">
      <h3 className="text-sm font-medium mb-4 text-neutral-700 dark:text-neutral-300 uppercase tracking-wide">
        {title}
      </h3>
      <div className="relative">
        {loading && (
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
                Generating histogram using KALMUS...
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded p-4">
            <p className="text-sm text-neutral-900 dark:text-neutral-100">{error}</p>
          </div>
        )}

        {!loading && !error && imageData && (
          <>
            <img
              src={`data:image/png;base64,${imageData}`}
              alt="Hue Histogram"
              className="w-full h-auto border border-neutral-200 dark:border-neutral-700 rounded"
            />
            <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
              Distribution of hue values (0-360°) generated using KALMUS native visualization.
              Near-achromatic black and white RGB values are excluded before hue conversion,
              then the bottom 1% of hue samples are trimmed to reduce the spike near red.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
