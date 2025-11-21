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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Color Metric
        </label>
        <select
          value={config.color_metric}
          onChange={(e) => onConfigChange({ color_metric: e.target.value })}
          className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {COLOR_METRICS.map((metric) => (
            <option key={metric} value={metric}>
              {metric}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Method to calculate frame color
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Frame Type
        </label>
        <select
          value={config.frame_type}
          onChange={(e) => onConfigChange({ frame_type: e.target.value })}
          className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {FRAME_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Region of frame to analyze
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Barcode Type
        </label>
        <select
          value={config.barcode_type}
          onChange={(e) => onConfigChange({ barcode_type: e.target.value })}
          className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {BARCODE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Type of barcode output
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
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
          className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Process every Nth frame (1 = all frames)
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Skip Frames
        </label>
        <input
          type="number"
          min="0"
          value={config.skip_over}
          onChange={(e) =>
            onConfigChange({ skip_over: parseInt(e.target.value) || 0 })
          }
          className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Number of frames to skip at start
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
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
          className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Frames per column in visualization
        </p>
      </div>

      <div className="md:col-span-2">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-2">
            💡 Tips
          </h4>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>• Higher sampled rates process faster but may miss details</li>
            <li>• "Bright" color metric only works with "Whole_frame" type</li>
            <li>• Processing large videos may take several minutes</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
