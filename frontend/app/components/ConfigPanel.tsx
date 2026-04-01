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

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  fontSize: '13px',
  fontFamily: 'inherit',
  outline: 'none',
} as React.CSSProperties;

export default function ConfigPanel({
  config,
  onConfigChange,
}: ConfigPanelProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="block font-mono text-[9px] tracking-[0.28em] uppercase kalmus-text-secondary mb-1.5">
          Color Metric
        </label>
        <select
          value={config.color_metric}
          onChange={(e) => onConfigChange({ color_metric: e.target.value })}
          className="kalmus-input"
          style={inputStyle}
        >
          {COLOR_METRICS.map((metric) => (
            <option key={metric} value={metric}>
              {metric}
            </option>
          ))}
        </select>
        <p className="mt-1 font-mono text-[9px] kalmus-text-muted">
          Method to calculate frame color
        </p>
      </div>

      <div>
        <label className="block font-mono text-[9px] tracking-[0.28em] uppercase kalmus-text-secondary mb-1.5">
          Frame Type
        </label>
        <select
          value={config.frame_type}
          onChange={(e) => onConfigChange({ frame_type: e.target.value })}
          className="kalmus-input"
          style={inputStyle}
        >
          {FRAME_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <p className="mt-1 font-mono text-[9px] kalmus-text-muted">
          Region of frame to analyze
        </p>
      </div>

      <div>
        <label className="block font-mono text-[9px] tracking-[0.28em] uppercase kalmus-text-secondary mb-1.5">
          Barcode Type
        </label>
        <select
          value={config.barcode_type}
          onChange={(e) => onConfigChange({ barcode_type: e.target.value })}
          className="kalmus-input"
          style={inputStyle}
        >
          {BARCODE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <p className="mt-1 font-mono text-[9px] kalmus-text-muted">
          Type of barcode output
        </p>
      </div>

      <div>
        <label className="block font-mono text-[9px] tracking-[0.28em] uppercase kalmus-text-secondary mb-1.5">
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
          className="kalmus-input"
          style={inputStyle}
        />
        <p className="mt-1 font-mono text-[9px] kalmus-text-muted">
          Process every Nth frame (1 = all frames)
        </p>
      </div>

      <div>
        <label className="block font-mono text-[9px] tracking-[0.28em] uppercase kalmus-text-secondary mb-1.5">
          Skip Frames
        </label>
        <input
          type="number"
          min="0"
          value={config.skip_over}
          onChange={(e) =>
            onConfigChange({ skip_over: parseInt(e.target.value) || 0 })
          }
          className="kalmus-input"
          style={inputStyle}
        />
        <p className="mt-1 font-mono text-[9px] kalmus-text-muted">
          Number of frames to skip at start
        </p>
      </div>

      <div>
        <label className="block font-mono text-[9px] tracking-[0.28em] uppercase kalmus-text-secondary mb-1.5">
          Seconds Per Column
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
          className="kalmus-input"
          style={inputStyle}
        />
        <p className="mt-1 font-mono text-[9px] kalmus-text-muted">
          Seconds of video per barcode column (assumes 24 fps)
        </p>
      </div>

      <div>
        <label className="block font-mono text-[9px] tracking-[0.28em] uppercase kalmus-text-secondary mb-1.5">
          Email <span style={{ color: 'var(--accent-amber)' }}>*</span>
        </label>
        <input
          type="email"
          placeholder="your.email@bucknell.edu"
          value={config.email || ""}
          onChange={(e) => onConfigChange({ email: e.target.value })}
          required
          className="kalmus-input"
          style={inputStyle}
        />
        <p className="mt-1 font-mono text-[9px] kalmus-text-muted">
          Barcode will be sent to this email
        </p>
      </div>

      <div>
        <label className="block font-mono text-[9px] tracking-[0.28em] uppercase kalmus-text-secondary mb-1.5">
          Thumbnail Capture
        </label>
        <label className="flex items-start gap-3 kalmus-surface p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.save_thumbnails}
            onChange={(e) => onConfigChange({ save_thumbnails: e.target.checked })}
            className="mt-0.5"
          />
          <span className="font-mono text-[10px] leading-relaxed kalmus-text-secondary">
            Save hover thumbnails during processing. Captures 1 frame every 24 source frames at 200 px height.
          </span>
        </label>
      </div>

      <div className="md:col-span-2">
        <div className="kalmus-surface p-3">
          <p className="font-mono text-[10px] kalmus-text-secondary leading-relaxed">
            Your video will be processed on HPC compute nodes. Processing takes 1-10 minutes depending on video length. You&apos;ll receive an email when complete and can close this page after submitting.
          </p>
        </div>
      </div>
    </div>
  );
}
