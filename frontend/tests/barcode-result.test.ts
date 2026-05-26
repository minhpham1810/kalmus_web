import test from "node:test";
import assert from "node:assert/strict";

import { hydrateBarcodeResult } from "../lib/barcode-result";

test("hydrateBarcodeResult prefers job metadata over incomplete barcode json fields", () => {
  const hydrated = hydrateBarcodeResult(
    {
      metric: "average",
      frame_type: "whole_frame",
      total_frames: 4128,
    },
    {
      barcode_type: "Brightness",
      color_metric: "Mode",
      frame_type: "whole_frame",
    },
  ) as {
    barcode_type: string;
    color_metric: string;
    frame_type: string;
    metric: string;
  };

  assert.equal(hydrated.barcode_type, "Brightness");
  assert.equal(hydrated.color_metric, "Mode");
  assert.equal(hydrated.frame_type, "whole_frame");
  assert.equal(hydrated.metric, "Mode");
});

test("hydrateBarcodeResult falls back to barcode json when metadata is missing", () => {
  const hydrated = hydrateBarcodeResult(
    {
      barcode_type: "Color",
      color_metric: "Median",
      frame_type: "foreground",
      metric: "Median",
    },
    {},
  ) as {
    barcode_type: string;
    color_metric: string;
    frame_type: string;
    metric: string;
  };

  assert.equal(hydrated.barcode_type, "Color");
  assert.equal(hydrated.color_metric, "Median");
  assert.equal(hydrated.frame_type, "foreground");
  assert.equal(hydrated.metric, "Median");
});
