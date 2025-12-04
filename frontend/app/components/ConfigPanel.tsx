"use client";

import { BarcodeConfig } from "./BarcodeGenerator";

interface ConfigPanelProps {
  config: BarcodeConfig;
  onConfigChange: (config: Partial<BarcodeConfig>) => void;
}

const COLOR_METRICS = [
  "Average",
  "Median",
  "Mode",
  "Top-dominant",
  "Weighted-dominant",
  "Brightest",
  "Bright",
];

const FRAME_TYPES = [
  "Whole_frame",
  "High_contrast_region",
  "Low_contrast_region",
  "Foreground",
  "Background",
];

const BARCODE_TYPES = ["Color", "Brightness"];

export default function ConfigPanel({
  config,
  onConfigChange,
}: ConfigPanelProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">
          Color Metric
        </label>
        <select
          value={config.color_metric}
          onChange={(e) => onConfigChange({ color_metric: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400"
        >
          {COLOR_METRICS.map((metric) => (
            <option key={metric} value={metric}>
              {metric}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
          Method to calculate frame color
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">
          Frame Type
        </label>
        <select
          value={config.frame_type}
          onChange={(e) => onConfigChange({ frame_type: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400"
        >
          {FRAME_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
          Region of frame to analyze
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">
          Barcode Type
        </label>
        <select
          value={config.barcode_type}
          onChange={(e) => onConfigChange({ barcode_type: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400"
        >
          {BARCODE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
          Type of barcode output
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">
          Sampled Rate
        </label>
        <input
          type="number"
          min="1"
          max="10"
          value={config.sampled_rate}
          onChange={(e) =>
            onConfigChange({ sampled_rate: parseInt(e.target.value) || 1 })
          }
          className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400"
        />
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
          Process every Nth frame (1 = all frames)
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">
          Skip Frames
        </label>
        <input
          type="number"
          min="0"
          value={config.skip_over}
          onChange={(e) =>
            onConfigChange({ skip_over: parseInt(e.target.value) || 0 })
          }
          className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400"
        />
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
          Number of frames to skip at start
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">
          Frames Per Column
        </label>
        <input
          type="number"
          min="10"
          max="200"
          value={config.frames_per_column}
          onChange={(e) =>
            onConfigChange({
              frames_per_column: parseInt(e.target.value) || 50,
            })
          }
          className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400"
        />
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
          Frames per column in visualization
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">
          Partition
        </label>
        <select
          value={config.partition || "short"}
          onChange={(e) => onConfigChange({ partition: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400"
        >
          <option value="short">Short (1 day)</option>
          <option value="medium">Medium (7 days)</option>
          <option value="long">Long (30 days)</option>
          <option value="lowpriority">Low Priority</option>
        </select>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
          Job queue partition
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5 uppercase tracking-wide">
          Email <span className="text-neutral-900 dark:text-neutral-100">*</span>
        </label>
        <input
          type="email"
          placeholder="your.email@bucknell.edu"
          value={config.email || ""}
          onChange={(e) => onConfigChange({ email: e.target.value })}
          required
          className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-500 dark:focus:border-neutral-400"
        />
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
          Barcode will be sent to this email
        </p>
      </div>

      <div className="md:col-span-2">
        <div className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded p-3">
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Your video will be processed on HPC compute nodes. Processing takes 1-10 minutes depending on video length. You'll receive an email when complete and can close this page after submitting.
          </p>
        </div>
      </div>
    </div>
  );
}
