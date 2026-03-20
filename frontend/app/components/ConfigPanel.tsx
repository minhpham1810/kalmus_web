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

const inputClass = `
  w-full px-3 py-2.5 text-sm font-mono
  border border-amber-500/20 rounded 
  bg-black/40 text-amber-100/90
  focus:outline-none focus:border-amber-500/50 
  focus:shadow-[0_0_15px_rgba(212,165,116,0.1)]
  transition-all duration-300
  appearance-none
`;

const selectClass = `
  ${inputClass}
  cursor-pointer
  bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23d4a574' stroke-width='1.5'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")]
  bg-no-repeat bg-[right_0.75rem_center] bg-[length:1rem]
`;

export default function ConfigPanel({
  config,
  onConfigChange,
}: ConfigPanelProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="space-y-1.5">
        <label className="block text-xs font-mono text-amber-500/70 uppercase tracking-widest">
          COLOR_METRIC
        </label>
        <select
          value={config.color_metric}
          onChange={(e) => onConfigChange({ color_metric: e.target.value })}
          className={selectClass}
        >
          {COLOR_METRICS.map((metric) => (
            <option key={metric} value={metric} className="bg-neutral-900">
              {metric}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-500 font-mono">
          // Method to calculate frame color
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-mono text-amber-500/70 uppercase tracking-widest">
          FRAME_TYPE
        </label>
        <select
          value={config.frame_type}
          onChange={(e) => onConfigChange({ frame_type: e.target.value })}
          className={selectClass}
        >
          {FRAME_TYPES.map((type) => (
            <option key={type} value={type} className="bg-neutral-900">
              {type.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-500 font-mono">
          // Region of frame to analyze
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-mono text-amber-500/70 uppercase tracking-widest">
          BARCODE_TYPE
        </label>
        <select
          value={config.barcode_type}
          onChange={(e) => onConfigChange({ barcode_type: e.target.value })}
          className={selectClass}
        >
          {BARCODE_TYPES.map((type) => (
            <option key={type} value={type} className="bg-neutral-900">
              {type}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-500 font-mono">
          // Type of barcode output
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-mono text-amber-500/70 uppercase tracking-widest">
          SAMPLED_RATE
        </label>
        <input
          type="number"
          min="1"
          max="10"
          value={config.sampled_rate}
          onChange={(e) =>
            onConfigChange({ sampled_rate: parseInt(e.target.value) || 1 })
          }
          className={inputClass}
        />
        <p className="text-xs text-neutral-500 font-mono">
          // Process every Nth frame (1 = all)
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-mono text-amber-500/70 uppercase tracking-widest">
          SKIP_FRAMES
        </label>
        <input
          type="number"
          min="0"
          value={config.skip_over}
          onChange={(e) =>
            onConfigChange({ skip_over: parseInt(e.target.value) || 0 })
          }
          className={inputClass}
        />
        <p className="text-xs text-neutral-500 font-mono">
          // Frames to skip at start
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-mono text-amber-500/70 uppercase tracking-widest">
          SEC_PER_COLUMN
        </label>
        <input
          type="number"
          min="1"
          max="30"
          value={config.seconds_per_column}
          onChange={(e) =>
            onConfigChange({
              seconds_per_column: parseInt(e.target.value) || 2,
            })
          }
          className={inputClass}
        />
        <p className="text-xs text-neutral-500 font-mono">
          // Seconds per barcode column (24fps)
        </p>
      </div>

      <div className="md:col-span-2 space-y-1.5">
        <label className="block text-xs font-mono text-amber-500/70 uppercase tracking-widest flex items-center gap-2">
          EMAIL
          <span className="text-red-400">*</span>
          <span className="text-neutral-500 normal-case tracking-normal">required</span>
        </label>
        <input
          type="email"
          placeholder="your.email@domain.edu"
          value={config.email || ""}
          onChange={(e) => onConfigChange({ email: e.target.value })}
          required
          className={inputClass}
        />
        <p className="text-xs text-neutral-500 font-mono">
          // Barcode will be transmitted to this address
        </p>
      </div>

      <div className="md:col-span-2">
        <div className="bg-black/40 border border-cyan-500/20 rounded p-4 relative overflow-hidden">
          {/* Decorative corners */}
          <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cyan-500/50" />
          <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-cyan-500/50" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cyan-500/50" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cyan-500/50" />
          
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-3 h-3 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xs text-neutral-400 font-mono leading-relaxed">
              Video processing occurs on HPC compute nodes. Estimated time: 1-10 minutes 
              depending on video length. You will receive an email notification upon completion 
              and may close this interface after submission.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
