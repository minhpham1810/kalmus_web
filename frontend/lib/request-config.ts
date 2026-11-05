import {
  BARCODE_TYPE_OPTIONS,
  COLOR_METRIC_OPTIONS,
  FRAME_TYPE_OPTIONS,
  normalizeFrameType,
} from "./multi-analysis";

export interface RequestAnalysis {
  barcode_type: string;
  frame_type: string;
  color_metric: string;
}

/** The upload form's settings, saved with a request so an admin can run it as the requester configured it. */
export interface RequestConfig {
  sampled_rate: number;
  skip_over: number;
  total_frames: number;
  seconds_per_column: number;
  save_thumbnails: boolean;
  edition: string;
  changing_aspect_ratio: boolean;
  analyses: RequestAnalysis[];
}

const MAX_EDITION_LENGTH = 100;

function boundedNumber(value: unknown, fallback: number, min: number, max: number, integer: boolean): number {
  const parsed = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(max, Math.max(min, parsed));
  return integer ? Math.round(clamped) : clamped;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function parseAnalyses(raw: unknown): RequestAnalysis[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const seen = new Set<string>();
  const analyses: RequestAnalysis[] = [];
  for (const item of raw) {
    const entry = (item ?? {}) as Record<string, unknown>;
    const barcodeType = entry.barcode_type;
    const frameType = normalizeFrameType(typeof entry.frame_type === "string" ? entry.frame_type : undefined);
    const colorMetric = entry.color_metric;

    if (
      !(BARCODE_TYPE_OPTIONS as readonly unknown[]).includes(barcodeType) ||
      !(FRAME_TYPE_OPTIONS as readonly string[]).includes(frameType) ||
      !(COLOR_METRIC_OPTIONS as readonly unknown[]).includes(colorMetric)
    ) {
      return null;
    }

    const analysis = {
      barcode_type: barcodeType as string,
      frame_type: frameType,
      color_metric: colorMetric as string,
    };
    const key = analysisKey(analysis);
    if (!seen.has(key)) {
      seen.add(key);
      analyses.push(analysis);
    }
  }
  return analyses;
}

function analysisKey(analysis: RequestAnalysis): string {
  return [analysis.barcode_type, analysis.frame_type, analysis.color_metric].join("::");
}

/** Validates untrusted form input; returns null when the analyses are missing or contain unknown options. */
export function parseRequestConfig(raw: unknown): RequestConfig | null {
  const input = (raw ?? {}) as Record<string, unknown>;
  const analyses = parseAnalyses(input.analyses);
  if (!analyses) return null;

  return {
    sampled_rate: boundedNumber(input.sampled_rate, 1, 1, 10_000, true),
    skip_over: boundedNumber(input.skip_over, 0, 0, 1_000_000_000, true),
    total_frames: boundedNumber(input.total_frames, 100_000_000, 1, 1_000_000_000, true),
    seconds_per_column: boundedNumber(input.seconds_per_column, 8, 1, 600, false),
    save_thumbnails: parseBoolean(input.save_thumbnails, true),
    edition: typeof input.edition === "string" ? input.edition.trim().slice(0, MAX_EDITION_LENGTH) : "",
    changing_aspect_ratio: parseBoolean(input.changing_aspect_ratio, false),
    analyses,
  };
}

/**
 * Identifies what is being requested: the edition plus the set of analyses. Sampling settings are
 * left out, matching how the archive decides two analyses are duplicates.
 */
export function requestSignature(config: RequestConfig): string {
  const analyses = config.analyses.map(analysisKey).sort().join(",");
  return `${config.edition.trim().toLowerCase()}|${analyses}`;
}

export function describeAnalysis(analysis: RequestAnalysis): string {
  return `${analysis.barcode_type} · ${analysis.frame_type.replace(/_/g, " ")} · ${analysis.color_metric}`;
}
