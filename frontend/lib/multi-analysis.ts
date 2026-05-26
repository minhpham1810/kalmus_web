export interface AnalysisConfig {
  clientId: string;
  barcode_type: string;
  frame_type: string;
  color_metric: string;
  forceReprocess?: boolean;
}

export interface AnalysisConfigPayload {
  clientId: string;
  barcode_type: string;
  frame_type: string;
  color_metric: string;
  force_reprocess: boolean;
}

export const BARCODE_TYPE_OPTIONS = ["Color", "Brightness"] as const;

export const FRAME_TYPE_OPTIONS = [
  "whole_frame",
  "high_contrast",
  "low_contrast",
  "foreground",
  "background",
] as const;

export const COLOR_METRIC_OPTIONS = [
  "Average",
  "Median",
  "Mode",
  "Top-dominant",
  "Weighted-dominant",
  "Brightest",
  "Bright",
] as const;

const DEFAULT_ANALYSIS_VALUES = {
  barcode_type: "Color",
  frame_type: "whole_frame",
  color_metric: "Average",
} as const;

const FRAME_TYPE_ALIASES: Record<string, (typeof FRAME_TYPE_OPTIONS)[number]> = {
  Whole_frame: "whole_frame",
  whole_frame: "whole_frame",
  High_contrast_region: "high_contrast",
  high_contrast_region: "high_contrast",
  high_contrast: "high_contrast",
  Low_contrast_region: "low_contrast",
  low_contrast_region: "low_contrast",
  low_contrast: "low_contrast",
  Foreground: "foreground",
  foreground: "foreground",
  Background: "background",
  background: "background",
};

function toAnalysisIndex(clientId: string | undefined, fallbackIndex: number): number {
  const match = clientId?.match(/analysis-(\d+)$/);
  if (!match) {
    return fallbackIndex;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : fallbackIndex;
}

function buildClientId(index: number): string {
  return `analysis-${index}`;
}

export function createAnalysisConfig(
  source?: Partial<AnalysisConfig>,
  index?: number,
): AnalysisConfig {
  const resolvedIndex = index ?? toAnalysisIndex(source?.clientId, 1) + 1;

  return {
    clientId: buildClientId(resolvedIndex),
    barcode_type: source?.barcode_type || DEFAULT_ANALYSIS_VALUES.barcode_type,
    frame_type: normalizeFrameType(source?.frame_type) || DEFAULT_ANALYSIS_VALUES.frame_type,
    color_metric: source?.color_metric || DEFAULT_ANALYSIS_VALUES.color_metric,
    forceReprocess: source?.forceReprocess ?? false,
  };
}

export function getInitialAnalysisConfigs(): AnalysisConfig[] {
  return [createAnalysisConfig(undefined, 1)];
}

export function normalizeAnalysisConfigs(
  configs: Array<Partial<AnalysisConfigPayload> | Partial<AnalysisConfig>>,
): AnalysisConfig[] {
  if (!configs.length) {
    return getInitialAnalysisConfigs();
  }

  return configs.map((config, index) => ({
    clientId: config.clientId || buildClientId(index + 1),
    barcode_type: config.barcode_type || DEFAULT_ANALYSIS_VALUES.barcode_type,
    frame_type: normalizeFrameType(config.frame_type) || DEFAULT_ANALYSIS_VALUES.frame_type,
    color_metric: config.color_metric || DEFAULT_ANALYSIS_VALUES.color_metric,
    forceReprocess:
      "force_reprocess" in config
        ? Boolean(config.force_reprocess)
        : "forceReprocess" in config
          ? Boolean(config.forceReprocess)
          : false,
  }));
}

export function buildAnalysisConfigPayload(
  configs: AnalysisConfig[],
): AnalysisConfigPayload[] {
  return configs.map((config) => ({
    clientId: config.clientId,
    barcode_type: config.barcode_type || DEFAULT_ANALYSIS_VALUES.barcode_type,
    frame_type: normalizeFrameType(config.frame_type) || DEFAULT_ANALYSIS_VALUES.frame_type,
    color_metric: config.color_metric,
    force_reprocess: Boolean(config.forceReprocess),
  }));
}

export function normalizeFrameType(frameType: string | null | undefined): string {
  if (!frameType) {
    return "whole_frame";
  }

  return FRAME_TYPE_ALIASES[frameType] || frameType;
}

export function parseAnalysisConfigPayload(
  rawValue: string | AnalysisConfigPayload[] | null | undefined,
): AnalysisConfigPayload[] {
  if (!rawValue) {
    return buildAnalysisConfigPayload(getInitialAnalysisConfigs());
  }

  const parsedValue =
    typeof rawValue === "string"
      ? (JSON.parse(rawValue) as AnalysisConfigPayload[])
      : rawValue;

  return parsedValue.map((config, index) => ({
    clientId: config.clientId || buildClientId(index + 1),
    barcode_type: config.barcode_type || DEFAULT_ANALYSIS_VALUES.barcode_type,
    frame_type: normalizeFrameType(config.frame_type) || DEFAULT_ANALYSIS_VALUES.frame_type,
    color_metric: config.color_metric || DEFAULT_ANALYSIS_VALUES.color_metric,
    force_reprocess: Boolean(config.force_reprocess),
  }));
}

type AnalysisSignatureSource = Pick<
  AnalysisConfig | AnalysisConfigPayload,
  "barcode_type" | "frame_type" | "color_metric"
>;

function buildAnalysisSignature(config: AnalysisSignatureSource): string {
  return [
    config.barcode_type.trim(),
    normalizeFrameType(config.frame_type).trim(),
    config.color_metric.trim(),
  ].join("::");
}

export function findDuplicateAnalysisSignatures(
  configs: AnalysisSignatureSource[],
): string[] {
  const counts = new Map<string, number>();

  for (const config of configs) {
    const signature = buildAnalysisSignature(config);
    counts.set(signature, (counts.get(signature) || 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([signature]) => signature);
}

export function getNextAvailableAnalysisConfig(
  configs: AnalysisSignatureSource[],
): Pick<AnalysisConfig, "barcode_type" | "frame_type" | "color_metric"> | null {
  const usedSignatures = new Set(configs.map(buildAnalysisSignature));

  for (const barcodeType of BARCODE_TYPE_OPTIONS) {
    for (const frameType of FRAME_TYPE_OPTIONS) {
      for (const colorMetric of COLOR_METRIC_OPTIONS) {
        const candidate = {
          barcode_type: barcodeType,
          frame_type: frameType,
          color_metric: colorMetric,
        } satisfies Pick<
          AnalysisConfig,
          "barcode_type" | "frame_type" | "color_metric"
        >;

        if (!usedSignatures.has(buildAnalysisSignature(candidate))) {
          return candidate;
        }
      }
    }
  }

  return null;
}
