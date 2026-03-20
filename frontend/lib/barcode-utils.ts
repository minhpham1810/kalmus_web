/**
 * Barcode Visualization Utilities
 * TypeScript utilities for color conversion, sampling, histogram binning, and CSV export
 */

export type RGB = [number, number, number];
export type HSV = [number, number, number]; // H: 0-360, S: 0-1, V: 0-1
export type HSL = [number, number, number]; // H: 0-360, S: 0-1, L: 0-1

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
 * Get hue values from RGB colors with chroma filtering.
 * Uses chroma (max-min) instead of HSV saturation (max-min)/max to avoid
 * dark pixels being misclassified as highly saturated.
 */
export function getHueValues(colors: RGB[], chromaThreshold: number = 0): number[] {
  const hues: number[] = [];
  for (const [r, g, b] of colors) {
    const rN = r / 255, gN = g / 255, bN = b / 255;
    const chroma = Math.max(rN, gN, bN) - Math.min(rN, gN, bN);
    if (chroma > 0 && chroma >= chromaThreshold) {
      const [h] = rgbToHsv(r, g, b);
      hues.push(h);
    }
  }
  return hues;
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
} {
  const numHueBins = Math.ceil(360 / hueResolution);
  const numLightBins = Math.ceil(1 / lightResolution);
  const bins: Map<string, { count: number; sumR: number; sumG: number; sumB: number }> = new Map();

  for (const [r, g, b] of colors) {
    const [h, s, v] = rgbToHsv(r, g, b);
    if (s < saturationThreshold) continue;

    const hueBin = Math.min(Math.floor(h / hueResolution), numHueBins - 1);
    const lightBin = Math.min(Math.floor(v / lightResolution), numLightBins - 1);
    const key = `${hueBin},${lightBin}`;

    const existing = bins.get(key) || { count: 0, sumR: 0, sumG: 0, sumB: 0 };
    existing.count++;
    existing.sumR += r;
    existing.sumG += g;
    existing.sumB += b;
    bins.set(key, existing);
  }

  const hueValues: number[] = [];
  const lightValues: number[] = [];
  const counts: number[] = [];
  const colorStrs: string[] = [];
  let maxCount = 0;

  bins.forEach((data, key) => {
    const [hueBin, lightBin] = key.split(",").map(Number);
    const hueCenter = hueBin * hueResolution + hueResolution / 2;
    // Invert light axis for display (1 - value) to match KALMUS behavior
    const lightCenter = 1 - (lightBin * lightResolution + lightResolution / 2);

    hueValues.push(hueCenter);
    lightValues.push(lightCenter);
    counts.push(data.count);

    // Average color for the bin
    const avgR = Math.round(data.sumR / data.count);
    const avgG = Math.round(data.sumG / data.count);
    const avgB = Math.round(data.sumB / data.count);
    colorStrs.push(`rgb(${avgR},${avgG},${avgB})`);

    maxCount = Math.max(maxCount, data.count);
  });

  return {
    hueValues,
    lightValues,
    counts,
    colors: colorStrs,
    maxCount,
  };
}

/**
 * Prepare Hue/Light scatter data with saturation filtering
 */
export function prepareHueLightScatterData(
  colors: RGB[],
  saturationThreshold: number = 0.15
): {
  hueValues: number[];
  lightValues: number[];
  colorStrs: string[];
} {
  const hueValues: number[] = [];
  const lightValues: number[] = [];
  const colorStrs: string[] = [];

  for (const [r, g, b] of colors) {
    const [h, s, v] = rgbToHsv(r, g, b);
    if (s >= saturationThreshold) {
      hueValues.push(h);
      lightValues.push(v);
      colorStrs.push(`rgb(${r},${g},${b})`);
    }
  }

  return { hueValues, lightValues, colorStrs };
}

/**
 * Prepare RGB cube scatter data
 */
export function prepareRGBCubeData(colors: RGB[]): {
  r: number[];
  g: number[];
  b: number[];
  colorStrs: string[];
} {
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  const colorStrs: string[] = [];

  for (const [rVal, gVal, bVal] of colors) {
    r.push(rVal);
    g.push(gVal);
    b.push(bVal);
    colorStrs.push(`rgb(${rVal},${gVal},${bVal})`);
  }

  return { r, g, b, colorStrs };
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
  // Convert hue to RGB for display using HSL
  const h = hue / 360;
  const s = 0.8;
  const l = 0.5;

  const hue2rgb = (p: number, q: number, t: number) => {
    let tNorm = t;
    if (tNorm < 0) tNorm += 1;
    if (tNorm > 1) tNorm -= 1;
    if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
    if (tNorm < 1 / 2) return q;
    if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h + 1 / 3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1 / 3);

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
