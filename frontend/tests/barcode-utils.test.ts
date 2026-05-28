import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_HUE_CHROMA_THRESHOLD,
  prepareHueHistogramSamples,
  rgbToOklch,
  type RGB,
} from "../lib/barcode-utils";

test("prepareHueHistogramSamples separates low-chroma colors in perceptual mode", () => {
  const colors: RGB[] = [
    [0, 0, 0],
    [255, 255, 255],
    [128, 128, 128],
    [7, 5, 5],
    [54, 42, 42],
    [120, 85, 75],
    [255, 0, 0],
  ];

  const result = prepareHueHistogramSamples(colors, {
    mode: "perceptual",
    chromaThreshold: DEFAULT_HUE_CHROMA_THRESHOLD,
    saturationThreshold: 0,
  });

  assert.equal(result.totalCount, colors.length);
  assert.equal(result.lowChromaCount, 5);
  assert.equal(result.samples.length, 2);
  assert.deepEqual(
    result.samples.map((sample) => sample.index),
    [5, 6],
  );
});

test("rgbToOklch reports perceptual chroma for muted and visible browns", () => {
  const mutedBrown = rgbToOklch(54, 42, 42);
  const visibleBrown = rgbToOklch(120, 85, 75);

  assert.ok(mutedBrown.chroma < DEFAULT_HUE_CHROMA_THRESHOLD);
  assert.ok(visibleBrown.chroma >= DEFAULT_HUE_CHROMA_THRESHOLD);
});

test("prepareHueHistogramSamples includes every color in raw HSV mode", () => {
  const colors: RGB[] = [
    [0, 0, 0],
    [128, 128, 128],
    [7, 5, 5],
    [255, 0, 0],
  ];

  const result = prepareHueHistogramSamples(colors, {
    mode: "raw",
    chromaThreshold: DEFAULT_HUE_CHROMA_THRESHOLD,
    saturationThreshold: 0,
  });

  assert.equal(result.lowChromaCount, 0);
  assert.deepEqual(
    result.samples.map((sample) => sample.index),
    [0, 1, 2, 3],
  );
});

test("prepareHueHistogramSamples applies saturation threshold after mode classification", () => {
  const colors: RGB[] = [
    [20, 15, 15],
    [255, 0, 0],
    [200, 180, 180],
  ];

  const result = prepareHueHistogramSamples(colors, {
    mode: "perceptual",
    chromaThreshold: DEFAULT_HUE_CHROMA_THRESHOLD,
    saturationThreshold: 0.2,
  });

  assert.equal(result.lowChromaCount, 2);
  assert.deepEqual(
    result.samples.map((sample) => sample.index),
    [1],
  );
});
