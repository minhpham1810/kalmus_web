/**
 * Barcode Visualization Utilities
 * TypeScript utilities for color conversion, sampling, histogram binning, and CSV export
 */

export type RGB = [number, number, number];
export type HSV = [number, number, number]; // H: 0-360, S: 0-1, V: 0-1
export type HSL = [number, number, number]; // H: 0-360, S: 0-1, L: 0-1
export interface HueSample {
  hue: number;
  saturation: number;
}

export interface HueHistogramSample extends HueSample {
  index: number;
}

export type HueHistogramMode = "perceptual" | "raw";

export interface PrepareHueHistogramOptions {
  mode?: HueHistogramMode;
  saturationThreshold?: number;
  chromaThreshold?: number;
}

export interface PreparedHueHistogramSamples {
  samples: HueHistogramSample[];
  lowChromaCount: number;
  totalCount: number;
  chromaThreshold: number;
  mode: HueHistogramMode;
}

export const DEFAULT_HUE_CHROMA_THRESHOLD = 10;

const HUE_HISTOGRAM_ACHROMATIC_DELTA = 30;
const HUE_HISTOGRAM_BLACK_MAX = 60;
const HUE_HISTOGRAM_WHITE_MIN = 195;

export interface BarcodeData {
  colors?: RGB[];
  brightness?: number[];
  barcode_type: "Color" | "Brightness";
  sampled_frame_rate: number;
  skip_over: number;
  color_metric?: string;
  frame_type?: string;
  total_frames?: number;
}

export interface ThumbnailSheet {
  index: number;
  filename: string;
  width: number;
  height: number;
  url?: string;
}

export interface ThumbnailEntry {
  index: number;
  frame_index: number;
  time_seconds: number | null;
  sheet_index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ThumbnailManifest {
  version: number;
  enabled: boolean;
  capture_interval_frames: number;
  thumbnail_height: number;
  processed_frame_start: number;
  processed_frame_end: number;
  count: number;
  fps: number | null;
  barcode: {
    width: number;
    height: number;
  };
  sheets: ThumbnailSheet[];
  thumbnails: ThumbnailEntry[];
}

export interface BarcodePreviewData {
  thumbnail: ThumbnailEntry;
  sheet: ThumbnailSheet;
  rgb: RGB;
  avgRgb: RGB;
}

/**
 * Convert RGB (0-255) to HSV (H: 0-360, S: 0-1, V: 0-1)
 */
export function rgbToHsv(r: number, g: number, b: number): HSV {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const v = max;

  if (delta !== 0) {
    s = delta / max;

    if (max === rNorm) {
      h = ((gNorm - bNorm) / delta) % 6;
    } else if (max === gNorm) {
      h = (bNorm - rNorm) / delta + 2;
    } else {
      h = (rNorm - gNorm) / delta + 4;
    }

    h *= 60;
    if (h < 0) h += 360;
  }

  return [h, s, v];
}

/**
 * Convert RGB (0-255) to HSL (H: 0-360, S: 0-1, L: 0-1)
 */
export function rgbToHsl(r: number, g: number, b: number): HSL {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    if (max === rNorm) {
      h = ((gNorm - bNorm) / delta) % 6;
    } else if (max === gNorm) {
      h = (bNorm - rNorm) / delta + 2;
    } else {
      h = (rNorm - gNorm) / delta + 4;
    }

    h *= 60;
    if (h < 0) h += 360;
  }

  return [h, s, l];
}

/**
 * Calculate brightness from RGB using standard formula
 */
export function rgbToBrightness(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Deterministic sampling of an array to at most maxSamples elements
 * Uses a seeded PRNG for reproducibility
 */
export function deterministicSample<T>(arr: T[], maxSamples: number, seed: number = 42): T[] {
  if (arr.length <= maxSamples) {
    return arr;
  }

  // Simple seeded PRNG (mulberry32)
  const random = (s: number) => {
    return () => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const rng = random(seed);

  // Fisher-Yates shuffle with early termination
  const indices = Array.from({ length: arr.length }, (_, i) => i);
  for (let i = 0; i < maxSamples; i++) {
    const j = i + Math.floor(rng() * (arr.length - i));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  return indices.slice(0, maxSamples).map((i) => arr[i]);
}

/**
 * Same as deterministicSample but also returns the original indices of selected items.
 * Use when you need to map sampled points back to their source frame index.
 */
export function deterministicSampleWithIndices<T>(
  arr: T[],
  maxSamples: number,
  seed: number = 42
): { items: T[]; indices: number[] } {
  if (arr.length <= maxSamples) {
    return { items: arr, indices: arr.map((_, i) => i) };
  }

  const random = (s: number) => {
    return () => {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const rng = random(seed);
  const idxArr = Array.from({ length: arr.length }, (_, i) => i);
  for (let i = 0; i < maxSamples; i++) {
    const j = i + Math.floor(rng() * (arr.length - i));
    [idxArr[i], idxArr[j]] = [idxArr[j], idxArr[i]];
  }

  const selectedIndices = idxArr.slice(0, maxSamples);
  return { items: selectedIndices.map((i) => arr[i]), indices: selectedIndices };
}

/**
 * Find the thumbnail entry whose frame_index is closest to the given frame index.
 */
export function findClosestThumbnail(
  manifest: ThumbnailManifest,
  frameIndex: number
): ThumbnailEntry | null {
  if (!manifest.thumbnails.length) return null;
  return manifest.thumbnails.reduce((best, t) =>
    Math.abs(t.frame_index - frameIndex) < Math.abs(best.frame_index - frameIndex) ? t : best
  );
}

export function pickRepresentativeFrameIndex(frameIndices: number[]): number | null {
  if (!frameIndices.length) return null;
  const sorted = [...frameIndices].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

export function pickDeterministicFrameIndex(
  frameIndices: number[],
  seed: number = 0
): number | null {
  if (!frameIndices.length) return null;
  const sorted = [...frameIndices].sort((a, b) => a - b);
  let hash = (seed + 0x9e3779b9) | 0;
  for (const index of sorted) {
    hash = Math.imul(hash ^ index, 2654435761);
  }
  const position = Math.abs(hash) % sorted.length;
  return sorted[position] ?? null;
}

export function buildPreviewFromFrameIndex({
  barcode,
  barcodeType,
  thumbnails,
  frameIndex,
  sampledFrameRate,
  skipOver = 0,
}: {
  barcode: RGB[][] | number[][];
  barcodeType: "Color" | "Brightness";
  thumbnails?: ThumbnailManifest | null;
  frameIndex: number;
  sampledFrameRate?: number;
  skipOver?: number;
}): BarcodePreviewData | null {
  const height = barcode.length;
  const width = barcode[0]?.length || 0;

  if (
    !thumbnails?.enabled ||
    thumbnails.count === 0 ||
    height === 0 ||
    width === 0
  ) {
    return null;
  }

  const clampedFrameIndex = Math.max(0, Math.min(frameIndex, width * height - 1));
  const barcodeX = Math.floor(clampedFrameIndex / height);
  const barcodeY = clampedFrameIndex % height;
  const sourceFrameIndex =
    sampledFrameRate !== undefined
      ? skipOver + clampedFrameIndex * sampledFrameRate
      : clampedFrameIndex;

  const thumbnail = findClosestThumbnail(thumbnails, sourceFrameIndex);
  const sheet = thumbnails.sheets.find((entry) => entry.index === thumbnail?.sheet_index);
  if (!thumbnail || !sheet?.url) return null;

  const pixel = barcode[barcodeY]?.[barcodeX];
  if (pixel === undefined) return null;

  const rgb: RGB =
    barcodeType === "Color" && Array.isArray(pixel)
      ? (pixel as RGB)
      : [pixel as number, pixel as number, pixel as number];

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;

  for (let row = 0; row < height; row++) {
    const columnPixel = barcode[row]?.[barcodeX];
    if (columnPixel === undefined) continue;

    if (Array.isArray(columnPixel)) {
      sumR += columnPixel[0];
      sumG += columnPixel[1];
      sumB += columnPixel[2];
    } else {
      sumR += columnPixel as number;
      sumG += columnPixel as number;
      sumB += columnPixel as number;
    }
  }

  return {
    thumbnail,
    sheet,
    rgb,
    avgRgb: [
      Math.round(sumR / height),
      Math.round(sumG / height),
      Math.round(sumB / height),
    ],
  };
}

/**
 * Format a duration in seconds as h:mm:ss or m:ss
 */
export function formatTimestamp(totalSeconds: number | null): string {
  if (totalSeconds === null || Number.isNaN(totalSeconds)) return "Time unavailable";

  const rounded = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Compute histogram bins for hue (0-360) or brightness (0-255)
 */
export function computeHistogram(
  values: number[],
  binStep: number,
  maxValue: number
): { bins: number[]; counts: number[]; binCenters: number[] } {
  const numBins = Math.ceil(maxValue / binStep);
  const counts = new Array(numBins).fill(0);
  const bins = Array.from({ length: numBins }, (_, i) => i * binStep);
  const binCenters = bins.map((b) => b + binStep / 2);

  for (const value of values) {
    const binIndex = Math.min(Math.floor(value / binStep), numBins - 1);
    counts[binIndex]++;
  }

  return { bins, counts, binCenters };
}

/**
 * Remove near-achromatic black/white RGB values before hue conversion so
 * grayscale extremes do not collapse into synthetic reds at 0 degrees.
 */
export function filterHueHistogramColors(colors: RGB[]): RGB[] {
  return colors.filter(([r, g, b]) => {
    const maxChannel = Math.max(r, g, b);
    const minChannel = Math.min(r, g, b);
    const channelDelta = maxChannel - minChannel;
    const isNearAchromatic = channelDelta <= HUE_HISTOGRAM_ACHROMATIC_DELTA;
    const isNearBlack = maxChannel <= HUE_HISTOGRAM_BLACK_MAX;
    const isNearWhite = minChannel >= HUE_HISTOGRAM_WHITE_MIN;

    return !(isNearAchromatic && (isNearBlack || isNearWhite));
  });
}

/**
 * Extract hue samples from RGB colors without applying any filtering.
 * Saturation is carried alongside hue so later pipeline stages can filter explicitly.
 */
export function getHueSamples(colors: RGB[]): HueSample[] {
  const samples: HueSample[] = [];
  for (const [r, g, b] of colors) {
    const [h, s] = rgbToHsv(r, g, b);
    samples.push({ hue: h, saturation: s });
  }
  return samples;
}

/**
 * Trim a percentage of hue values from the low end of the sorted distribution.
 * This removes the near-black / near-white spike without hard-coding a hue range.
 */
export function trimHueOutliers(values: number[], trimFraction: number = 0.01): number[] {
  if (values.length < 2) {
    return values;
  }

  const trimCount = Math.floor(values.length * trimFraction);
  if (trimCount <= 0 || trimCount >= values.length) {
    return values;
  }

  return [...values].sort((a, b) => a - b).slice(trimCount);
}

/**
 * Trim hue samples by sorting on hue and dropping the lowest tail by sample count.
 */
export function trimHueSampleOutliers(
  samples: HueSample[],
  trimFraction: number = 0.01
): HueSample[] {
  if (samples.length < 2) {
    return samples;
  }

  const trimCount = Math.floor(samples.length * trimFraction);
  if (trimCount <= 0 || trimCount >= samples.length) {
    return samples;
  }

  return [...samples].sort((a, b) => a.hue - b.hue).slice(trimCount);
}

/**
 * Filter hue samples by saturation after any earlier preprocessing steps.
 */
export function filterHueSamplesBySaturation(
  samples: HueSample[],
  saturationThreshold: number = 0
): HueSample[] {
  if (saturationThreshold <= 0) {
    return samples;
  }

  return samples.filter(
    (sample) => sample.saturation > 0 && sample.saturation >= saturationThreshold
  );
}

function getRgbChroma([r, g, b]: RGB): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/**
 * Prepare hue samples for the interactive histogram. Perceptual mode counts
 * only colors with enough absolute RGB channel spread to have a meaningful
 * visible hue; raw mode mirrors KALMUS/HSV by counting every RGB sample.
 */
export function prepareHueHistogramSamples(
  colors: RGB[],
  options: PrepareHueHistogramOptions = {}
): PreparedHueHistogramSamples {
  const mode = options.mode ?? "perceptual";
  const saturationThreshold = options.saturationThreshold ?? 0;
  const chromaThreshold = options.chromaThreshold ?? DEFAULT_HUE_CHROMA_THRESHOLD;
  let lowChromaCount = 0;

  const samples: HueHistogramSample[] = [];

  colors.forEach((color, index) => {
    if (mode === "perceptual" && getRgbChroma(color) < chromaThreshold) {
      lowChromaCount++;
      return;
    }

    const [hue, saturation] = rgbToHsv(color[0], color[1], color[2]);
    samples.push({ hue, saturation, index });
  });

  const filteredSamples =
    saturationThreshold <= 0
      ? samples
      : samples.filter(
          (sample) => sample.saturation > 0 && sample.saturation >= saturationThreshold
        );

  return {
    samples: filteredSamples,
    lowChromaCount,
    totalCount: colors.length,
    chromaThreshold,
    mode,
  };
}

/**
 * Compute 2D Hue/Light bins for 3D bar plot
 */
export function computeHueLightBins(
  colors: RGB[],
  hueResolution: number = 10,
  lightResolution: number = 0.02,
  saturationThreshold: number = 0.15
): {
  hueValues: number[];
  lightValues: number[];
  counts: number[];
  colors: string[];
  maxCount: number;
  representativeFrameIndices: Array<number | null>;
} {
  const numHueBins = Math.ceil(360 / hueResolution);
  const numLightBins = Math.ceil(1 / lightResolution);
  const bins: Map<string, { count: number; sumR: number; sumG: number; sumB: number; frameIndices: number[] }> = new Map();

  colors.forEach(([r, g, b], index) => {
    const [h, s, v] = rgbToHsv(r, g, b);
    if (s < saturationThreshold) return;

    const hueBin = Math.min(Math.floor(h / hueResolution), numHueBins - 1);
    const lightBin = Math.min(Math.floor(v / lightResolution), numLightBins - 1);
    const key = `${hueBin},${lightBin}`;

    const existing = bins.get(key) || { count: 0, sumR: 0, sumG: 0, sumB: 0, frameIndices: [] };
    existing.count++;
    existing.sumR += r;
    existing.sumG += g;
    existing.sumB += b;
    existing.frameIndices.push(index);
    bins.set(key, existing);
  });

  const hueValues: number[] = [];
  const lightValues: number[] = [];
  const counts: number[] = [];
  const colorStrs: string[] = [];
  const representativeFrameIndices: Array<number | null> = [];
  let maxCount = 0;

  bins.forEach((data, key) => {
    const [hueBin, lightBin] = key.split(",").map(Number);
    const hueCenter = hueBin * hueResolution + hueResolution / 2;
    const lightCenter = lightBin * lightResolution + lightResolution / 2;

    hueValues.push(hueCenter);
    lightValues.push(lightCenter);
    counts.push(data.count);

    // Average color for the bin
    const avgR = Math.round(data.sumR / data.count);
    const avgG = Math.round(data.sumG / data.count);
    const avgB = Math.round(data.sumB / data.count);
    colorStrs.push(`rgb(${avgR},${avgG},${avgB})`);
    representativeFrameIndices.push(
      pickDeterministicFrameIndex(data.frameIndices, hueBin * 1000 + lightBin)
    );

    maxCount = Math.max(maxCount, data.count);
  });

  return {
    hueValues,
    lightValues,
    counts,
    colors: colorStrs,
    maxCount,
    representativeFrameIndices,
  };
}

/**
 * Prepare Hue/Light scatter data with saturation filtering.
 * Pass originalIndices (from deterministicSampleWithIndices) to get per-point source indices back.
 */
export function prepareHueLightScatterData(
  colors: RGB[],
  saturationThreshold: number = 0.15,
  originalIndices?: number[]
): {
  hueValues: number[];
  lightValues: number[];
  colorStrs: string[];
  pointOriginalIndices: number[];
} {
  const hueValues: number[] = [];
  const lightValues: number[] = [];
  const colorStrs: string[] = [];
  const pointOriginalIndices: number[] = [];

  colors.forEach(([r, g, b], i) => {
    const [h, s, v] = rgbToHsv(r, g, b);
    if (s >= saturationThreshold) {
      hueValues.push(h);
      lightValues.push(v);
      colorStrs.push(`rgb(${r},${g},${b})`);
      pointOriginalIndices.push(originalIndices ? originalIndices[i] : i);
    }
  });

  return { hueValues, lightValues, colorStrs, pointOriginalIndices };
}

/**
 * Prepare RGB cube scatter data
 */
export function prepareRGBCubeData(colors: RGB[]): {
  r: number[];
  g: number[];
  b: number[];
  colorStrs: string[];
  pointOriginalIndices: number[];
} {
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  const colorStrs: string[] = [];
  const pointOriginalIndices: number[] = [];

  colors.forEach(([rVal, gVal, bVal], index) => {
    r.push(rVal);
    g.push(gVal);
    b.push(bVal);
    colorStrs.push(`rgb(${rVal},${gVal},${bVal})`);
    pointOriginalIndices.push(index);
  });

  return { r, g, b, colorStrs, pointOriginalIndices };
}

/**
 * Generate CSV content for barcode data
 */
export function generateCSV(barcodeData: BarcodeData): string {
  const { colors, brightness, barcode_type, sampled_frame_rate, skip_over } = barcodeData;

  const lines: string[] = [];

  if (barcode_type === "Color" && colors) {
    // Header for color barcode
    lines.push(
      "Frame Index,Red (0-255),Green (0-255),Blue (0-255),Hue (0-360),Saturation (0-1),Value (0-1),Brightness"
    );

    colors.forEach((rgb, i) => {
      const frameIndex = skip_over + i * sampled_frame_rate;
      const [r, g, b] = rgb;
      const [h, s, v] = rgbToHsv(r, g, b);
      const bright = Math.round(rgbToBrightness(r, g, b));

      lines.push(
        `${frameIndex},${r},${g},${b},${Math.round(h)},${s.toFixed(3)},${v.toFixed(3)},${bright}`
      );
    });
  } else if (barcode_type === "Brightness" && brightness) {
    // Header for brightness barcode
    lines.push("Frame Index,Brightness");

    brightness.forEach((bright, i) => {
      const frameIndex = skip_over + i * sampled_frame_rate;
      lines.push(`${frameIndex},${Math.round(bright)}`);
    });
  }

  return lines.join("\n");
}

/**
 * Trigger browser download of CSV file
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Get color for histogram bin based on hue value
 */
export function getHueColor(hue: number): string {
  const normalizedHue = (((hue % 360) + 360) % 360) / 60;
  const chroma = 1;
  const x = chroma * (1 - Math.abs((normalizedHue % 2) - 1));

  let r = 0;
  let g = 0;
  let b = 0;

  if (normalizedHue < 1) {
    r = chroma;
    g = x;
  } else if (normalizedHue < 2) {
    r = x;
    g = chroma;
  } else if (normalizedHue < 3) {
    g = chroma;
    b = x;
  } else if (normalizedHue < 4) {
    g = x;
    b = chroma;
  } else if (normalizedHue < 5) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }

  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

/**
 * Camera presets for 3D plots (matching KALMUS Tkinter)
 */
export const CAMERA_PRESETS = {
  "Diag View 1": { eye: { x: 2.0, y: 2.0, z: 1.3 } },
  "Diag View 2": { eye: { x: -2.0, y: -2.0, z: 1.3 } },
  "Hue View 1": { eye: { x: 0, y: 2.5, z: 0.1 } },
  "Hue View 2": { eye: { x: 0, y: -2.5, z: 0.1 } },
  "Light View 1": { eye: { x: 2.5, y: 0, z: 0.1 } },
  "Light View 2": { eye: { x: -2.5, y: 0, z: 0.1 } },
  "Top View": { eye: { x: 0, y: 0, z: 2.5 } },
} as const;

export type CameraPreset = keyof typeof CAMERA_PRESETS;

/**
 * Rotate camera by degrees in azimuth (horizontal) or elevation (vertical)
 */
export function rotateCamera(
  current: { x: number; y: number; z: number },
  azimuthDelta: number,
  elevationDelta: number
): { x: number; y: number; z: number } {
  // Convert to spherical coordinates
  const r = Math.sqrt(current.x ** 2 + current.y ** 2 + current.z ** 2);
  let theta = Math.atan2(current.y, current.x); // azimuth
  let phi = Math.acos(current.z / r); // polar angle (elevation from z-axis)

  // Apply deltas (convert degrees to radians)
  theta += (azimuthDelta * Math.PI) / 180;
  phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi + (elevationDelta * Math.PI) / 180));

  // Convert back to Cartesian
  return {
    x: r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.sin(phi) * Math.sin(theta),
    z: r * Math.cos(phi),
  };
}
