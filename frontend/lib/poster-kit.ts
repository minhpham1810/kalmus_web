// Admin "poster kit": one zip with the four images used for poster making.
// Everything is clean (no watermark) and rendered in the browser from the job's
// barcode data, except the canvas zoom which is a pre-rendered file on the NFS.

import { zipSync } from "fflate";
import type { Data, Layout } from "plotly.js";
import { getDownloadSize, withPngDpi } from "@/lib/barcode-download";
import {
  DEFAULT_HUE_CHROMA_THRESHOLD,
  RGB,
  computeHistogram,
  deterministicSampleWithIndices,
  getHueColor,
  prepareHueHistogramSamples,
  prepareHueLightScatterData,
} from "@/lib/barcode-utils";

export const POSTER_SCATTER_SAMPLES = 20000;
const PLOT_WIDTH = 1600;
const PLOT_HEIGHT = 900;
const PLOT_SCALE = 2;
const WHITE = "#ffffff";

interface BarcodeResult {
  barcode_type?: string;
  colors?: RGB[];
  brightness?: number[];
  barcode?: RGB[][] | number[][];
}

interface PlotFigure {
  data: Data[];
  layout: Partial<Layout>;
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "film";
}

async function fetchBarcode(jobId: string): Promise<BarcodeResult> {
  const res = await fetch(`/api/job-result/${jobId}`);
  if (!res.ok) throw new Error(`Couldn't load barcode data (${res.status})`);
  const data = await res.json();
  if (!data.success || !data.barcode) throw new Error("Barcode data is missing");
  return data.barcode as BarcodeResult;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Unable to create PNG"))), "image/png")
  );
}

async function toBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

// Print-size barcode (30in wide @ 300dpi), nearest-neighbor so every frame stays
// an exact color. Mirrors BarcodePreview's "print" download.
async function renderPrintBarcode(barcode: BarcodeResult): Promise<Uint8Array> {
  const rows = barcode.barcode;
  const height = rows?.length ?? 0;
  const width = rows?.[0]?.length ?? 0;
  if (!rows || width === 0 || height === 0) throw new Error("Barcode image is empty");

  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const sctx = source.getContext("2d");
  if (!sctx) throw new Error("Canvas 2D context unavailable");
  const image = sctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = rows[y][x];
      const [r, g, b] = Array.isArray(pixel) ? pixel : [pixel, pixel, pixel];
      const i = (y * width + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 255;
    }
  }
  sctx.putImageData(image, 0, 0);

  const size = getDownloadSize("print", width, height);
  const out = document.createElement("canvas");
  out.width = size.width;
  out.height = size.height;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Canvas 2D context unavailable");
  octx.imageSmoothingEnabled = false;
  octx.drawImage(source, 0, 0, out.width, out.height);

  const bytes = await toBytes(await canvasToBlob(out));
  return size.dpi === null ? bytes : withPngDpi(bytes, size.dpi);
}

function whiteAxis(title: string, extra: Record<string, unknown> = {}) {
  return {
    title: { text: title, font: { color: WHITE } },
    color: WHITE,
    linecolor: WHITE,
    zerolinecolor: WHITE,
    tickfont: { color: WHITE },
    gridcolor: "rgba(255,255,255,0.2)",
    ...extra,
  };
}

const baseLayout: Partial<Layout> = {
  margin: { l: 80, r: 40, t: 40, b: 70 },
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  font: { color: WHITE, size: 16 },
  showlegend: false,
};

// Default settings of InteractiveHistogram (bin step 1, no saturation filter).
function buildHistogramFigure(barcode: BarcodeResult): PlotFigure {
  const isColor = barcode.barcode_type !== "Brightness";
  if (isColor && barcode.colors?.length) {
    const { samples } = prepareHueHistogramSamples(barcode.colors, {
      mode: "perceptual",
      chromaThreshold: DEFAULT_HUE_CHROMA_THRESHOLD,
      saturationThreshold: 0,
    });
    const { binCenters, counts } = computeHistogram(samples.map((s) => s.hue), 1, 360);
    return {
      data: [
        {
          type: "bar",
          x: binCenters,
          y: counts,
          marker: { color: binCenters.map((h) => getHueColor(h)) },
        },
      ],
      layout: {
        ...baseLayout,
        bargap: 0.05,
        xaxis: whiteAxis("Hue", {
          range: [0, 360],
          tickvals: Array.from({ length: 13 }, (_, i) => i * 30),
        }),
        yaxis: whiteAxis("Number of frames"),
      },
    };
  }
  if (barcode.brightness?.length) {
    const { binCenters, counts } = computeHistogram(barcode.brightness, 1, 255);
    return {
      data: [
        {
          type: "bar",
          x: binCenters,
          y: counts,
          marker: { color: binCenters.map((b) => `rgb(${Math.round(b)},${Math.round(b)},${Math.round(b)})`) },
        },
      ],
      layout: {
        ...baseLayout,
        bargap: 0.05,
        xaxis: whiteAxis("Brightness (0 - 255)", { range: [0, 255] }),
        yaxis: whiteAxis("Number of frames"),
      },
    };
  }
  throw new Error("No color or brightness data for the histogram");
}

function buildScatterFigure(barcode: BarcodeResult): PlotFigure {
  if (!barcode.colors?.length) throw new Error("Hue/lightness scatter needs a color barcode");
  const sampled = deterministicSampleWithIndices(barcode.colors, POSTER_SCATTER_SAMPLES);
  const points = prepareHueLightScatterData(sampled.items, 0, sampled.indices);
  return {
    data: [
      {
        type: "scatter",
        mode: "markers",
        x: points.hueValues,
        y: points.lightValues,
        marker: { size: 4, color: points.colorStrs, opacity: 0.7 },
      },
    ],
    layout: {
      ...baseLayout,
      xaxis: whiteAxis("Hue", { range: [0, 360], tickvals: [0, 60, 120, 180, 240, 300, 360] }),
      yaxis: whiteAxis("Lightness", { range: [0, 1], tickvals: [0, 0.25, 0.5, 0.75, 1] }),
    },
  };
}

async function renderPlot(figure: PlotFigure): Promise<Uint8Array> {
  const { default: Plotly } = await import("plotly.js/dist/plotly");
  const dataUrl = await Plotly.toImage(figure as never, {
    format: "png",
    width: PLOT_WIDTH,
    height: PLOT_HEIGHT,
    scale: PLOT_SCALE,
  });
  return toBytes(await (await fetch(dataUrl)).blob());
}

async function fetchCanvasZoom(jobId: string): Promise<Uint8Array> {
  const res = await fetch(`/api/frame-scatter-tiles/${jobId}/frames/canvas.png`);
  if (!res.ok) throw new Error(`Canvas zoom image not available (${res.status})`);
  return toBytes(await res.blob());
}

export interface PosterKit {
  filename: string;
  blob: Blob;
}

export async function buildPosterKit(jobId: string, title: string): Promise<PosterKit> {
  const slug = slugify(title);
  const barcode = await fetchBarcode(jobId);

  // Sequential: each step is memory-heavy (print barcode is 9000px wide).
  const files: Record<string, Uint8Array> = {};
  files[`${slug}_barcode_print.png`] = await renderPrintBarcode(barcode);
  files[`${slug}_canvas_zoom.png`] = await fetchCanvasZoom(jobId);
  files[`${slug}_histogram_white.png`] = await renderPlot(buildHistogramFigure(barcode));
  files[`${slug}_hue_lightness_scatter_white.png`] = await renderPlot(buildScatterFigure(barcode));

  // PNGs are already compressed, so store them (level 0).
  const zipped = zipSync(files, { level: 0 });
  return {
    filename: `${slug}_poster_kit.zip`,
    blob: new Blob([zipped as BlobPart], { type: "application/zip" }),
  };
}
