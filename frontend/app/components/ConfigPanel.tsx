"use client";

import {
  AnalysisConfig,
  BARCODE_TYPE_OPTIONS,
  COLOR_METRIC_OPTIONS,
} from "@/lib/multi-analysis";

import { SharedBarcodeConfig } from "./BarcodeGenerator";

interface ConfigPanelProps {
  sharedConfig: SharedBarcodeConfig;
  analysisConfigs: AnalysisConfig[];
  onSharedConfigChange: (config: Partial<SharedBarcodeConfig>) => void;
  onAnalysisConfigChange: (
    clientId: string,
    config: Partial<AnalysisConfig>,
  ) => void;
  onAddAnalysisConfig: () => void;
  onRemoveAnalysisConfig: (clientId: string) => void;
  canAddAnalysisConfig: boolean;
}

const FRAME_TYPES = [
  { value: "whole_frame", label: "Whole frame" },
  { value: "high_contrast", label: "High contrast region" },
  { value: "low_contrast", label: "Low contrast region" },
  { value: "foreground", label: "Foreground" },
  { value: "background", label: "Background" },
] as const;

const inputStyle = {
  width: "100%",
  padding: "8px 12px",
  fontSize: "13px",
  fontFamily: "inherit",
  outline: "none",
} as React.CSSProperties;

function ConfigField({
  label,
  helper,
  children,
}: {
  label: React.ReactNode;
  helper: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block font-mono text-xs tracking-[0.28em] uppercase kalmus-text-secondary mb-1.5">
        {label}
      </label>
      {children}
      <p className="mt-1 font-mono text-xs kalmus-text-muted">{helper}</p>
    </div>
  );
}

export default function ConfigPanel({
  sharedConfig,
  analysisConfigs,
  onSharedConfigChange,
  onAnalysisConfigChange,
  onAddAnalysisConfig,
  onRemoveAnalysisConfig,
  canAddAnalysisConfig,
}: ConfigPanelProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-mono text-xs tracking-[0.28em] uppercase kalmus-text-secondary mb-1.5">
            Barcode Options
          </h3>
          <p className="font-mono text-xs kalmus-text-muted">
            Each row below becomes a separate barcode from the same upload.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddAnalysisConfig}
          disabled={!canAddAnalysisConfig}
          className="inline-flex items-center justify-center w-9 h-9 font-mono text-lg transition-all hover:opacity-90"
          style={{ border: "1px solid var(--accent-crimson)", color: "var(--accent-crimson)" }}
          aria-label="Add analysis row"
        >
          +
        </button>
      </div>

      <div className="space-y-4">
        {analysisConfigs.map((config, index) => (
          <div
            key={config.clientId}
            className="panel-bg p-4"
            style={{ border: "1px solid var(--surface-border)" }}
          >
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="font-mono text-xs tracking-[0.28em] uppercase kalmus-text-secondary">
                Option {index + 1}
              </div>
              <button
                type="button"
                onClick={() => onRemoveAnalysisConfig(config.clientId)}
                disabled={analysisConfigs.length === 1}
                className="px-3 py-1 font-mono text-xs tracking-[0.18em] uppercase transition-colors disabled:opacity-40"
                style={{ border: "1px solid var(--input-border)" }}
              >
                Remove
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ConfigField
                label="Barcode Type"
                helper="Color or brightness barcode"
              >
                <select
                  value={config.barcode_type}
                  onChange={(e) =>
                    onAnalysisConfigChange(config.clientId, {
                      barcode_type: e.target.value,
                    })
                  }
                  className="kalmus-input"
                  style={inputStyle}
                >
                  {BARCODE_TYPE_OPTIONS.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </ConfigField>

              <ConfigField
                label="Frame Type"
                helper="Region of the frame to analyze"
              >
                <select
                  value={config.frame_type}
                  onChange={(e) =>
                    onAnalysisConfigChange(config.clientId, {
                      frame_type: e.target.value,
                    })
                  }
                  className="kalmus-input"
                  style={inputStyle}
                >
                  {FRAME_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </ConfigField>

              <ConfigField
                label="Color Metric"
                helper="Method to calculate frame color"
              >
                <select
                  value={config.color_metric}
                  onChange={(e) =>
                    onAnalysisConfigChange(config.clientId, {
                      color_metric: e.target.value,
                    })
                  }
                  className="kalmus-input"
                  style={inputStyle}
                >
                  {COLOR_METRIC_OPTIONS.map((metric) => (
                    <option key={metric} value={metric}>
                      {metric}
                    </option>
                  ))}
                </select>
              </ConfigField>
            </div>

            {(config.frame_type === "foreground" || config.frame_type === "background") && (
              <p className="mt-3 font-mono text-xs" style={{ color: "var(--accent-amber)" }}>
                Foreground and background runs are substantially slower than whole-frame analysis.
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ConfigField
          label={
            <>
              Email <span style={{ color: "var(--accent-amber)" }}>*</span>
            </>
          }
          helper="Job notifications will be sent to this email"
        >
          <input
            type="email"
            placeholder="your.email@bucknell.edu"
            value={sharedConfig.email || ""}
            onChange={(e) => onSharedConfigChange({ email: e.target.value })}
            required
            className="kalmus-input"
            style={inputStyle}
          />
        </ConfigField>
      </div>

      <div className="md:col-span-2">
        <div className="kalmus-surface p-3">
          <p className="font-mono text-xs kalmus-text-secondary leading-relaxed">
            Your video will be processed on HPC compute nodes. Processing takes
            1-10 minutes depending on video length. You&apos;ll receive an email
            when complete and can close this page after submitting.
          </p>
        </div>
      </div>
    </div>
  );
}
