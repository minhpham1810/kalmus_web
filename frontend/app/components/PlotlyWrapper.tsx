"use client";

import dynamic from "next/dynamic";
import type { PlotParams } from "react-plotly.js";
import type { Config, ModeBarButton, PlotlyHTMLElement } from "plotly.js";
import { downloadBlob, toWatermarkedPng } from "@/lib/watermark";

// Dynamic import of Plotly with SSR disabled
const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64 bg-neutral-100 dark:bg-neutral-900 rounded">
      <div className="flex items-center gap-3">
        <svg
          className="animate-spin h-5 w-5 text-neutral-600 dark:text-neutral-400"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          Loading chart...
        </span>
      </div>
    </div>
  ),
});

// Plotly's camera icon (Plotly.Icons.camera), inlined so this module doesn't
// load Plotly during SSR.
const CAMERA_ICON = {
  width: 1000,
  height: 1000,
  path: "m500 450c-83 0-150-67-150-150 0-83 67-150 150-150 83 0 150 67 150 150 0 83-67 150-150 150z m400 150h-120c-16 0-34 13-39 29l-31 93c-6 15-23 28-40 28h-340c-16 0-34-13-39-28l-31-94c-6-15-23-28-40-28h-120c-55 0-100-45-100-100v-450c0-55 45-100 100-100h800c55 0 100 45 100 100v450c0 55-45 100-100 100z m-400-550c-138 0-250 112-250 250 0 138 112 250 250 250 138 0 250-112 250-250 0-138-112-250-250-250z m365 380c-19 0-35 16-35 35 0 19 16 35 35 35 19 0 35-16 35-35 0-19-16-35-35-35z",
  transform: "matrix(1 0 0 -1 0 850)",
};

const WHITE = "#ffffff";

type PlainObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is PlainObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isAxisKey = (key: string) =>
  /^(x|y|z)axis\d*$|^(polar|radialaxis|angularaxis)/.test(key);

// Returns a copy of the axis with its line, tick labels and title forced to white.
function whitenAxis(axis: PlainObject): PlainObject {
  const tickfont = isPlainObject(axis.tickfont) ? axis.tickfont : {};
  const title = isPlainObject(axis.title) ? axis.title : {};
  const titleFont = isPlainObject(title.font) ? title.font : {};
  return {
    ...axis,
    color: WHITE,
    linecolor: WHITE,
    zerolinecolor: WHITE,
    tickfont: { ...tickfont, color: WHITE },
    title: { ...title, font: { ...titleFont, color: WHITE } },
  };
}

// Returns a copy of the layout with all axes (including 3D scenes), legend and
// global text forced to white, so downloaded images stay readable.
function whitenLayout(layout: PlainObject): PlainObject {
  const result: PlainObject = {};
  for (const [key, value] of Object.entries(layout)) {
    if (isAxisKey(key) && isPlainObject(value)) {
      result[key] = whitenAxis(value);
    } else if (/^scene\d*$/.test(key) && isPlainObject(value)) {
      result[key] = Object.fromEntries(
        Object.entries(value).map(([k, v]) =>
          isAxisKey(k) && isPlainObject(v) ? [k, whitenAxis(v)] : [k, v],
        ),
      );
    } else {
      result[key] = value;
    }
  }
  const font = isPlainObject(layout.font) ? layout.font : {};
  const legend = isPlainObject(layout.legend) ? layout.legend : {};
  const legendFont = isPlainObject(legend.font) ? legend.font : {};
  result.font = { ...font, color: WHITE };
  result.legend = { ...legend, font: { ...legendFont, color: WHITE } };
  return result;
}

// Same as Plotly's built-in "Download plot as a png" button, plus the watermark.
function watermarkedImageButton(
  options: Config["toImageButtonOptions"] = {},
): ModeBarButton {
  return {
    name: "toImageWatermarked",
    title: "Download plot as a png",
    icon: CAMERA_ICON,
    click: async (gd: PlotlyHTMLElement) => {
      try {
        const { default: Plotly } = await import("plotly.js/dist/plotly");
        const dataUrl = await Plotly.toImage(
          {
            data: gd.data,
            layout: whitenLayout(gd.layout as unknown as PlainObject),
          } as never,
          {
            format: "png",
            width: options.width ?? gd.clientWidth,
            height: options.height ?? gd.clientHeight,
            scale: options.scale ?? 1,
          },
        );
        const png = await toWatermarkedPng(dataUrl);
        downloadBlob(png, `${options.filename || "newplot"}.png`);
      } catch (error) {
        console.error("Plot download failed:", error);
      }
    },
  };
}

export default function PlotlyWrapper(props: PlotParams) {
  const config = props.config ?? {};
  const watermarkedConfig: Partial<Config> = {
    ...config,
    modeBarButtonsToRemove: [
      ...(config.modeBarButtonsToRemove ?? []),
      "toImage",
    ],
    modeBarButtonsToAdd: [
      ...(config.modeBarButtonsToAdd ?? []),
      watermarkedImageButton(config.toImageButtonOptions),
    ],
  };
  return <Plot {...props} config={watermarkedConfig} />;
}
