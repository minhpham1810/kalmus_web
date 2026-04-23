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
