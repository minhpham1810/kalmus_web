import test from "node:test";
import assert from "node:assert/strict";

import { prepareHueHistogramSamples, type RGB } from "../lib/barcode-utils";

test("prepareHueHistogramSamples separates low-chroma colors in perceptual mode", () => {
  const colors: RGB[] = [
    [0, 0, 0],
    [255, 255, 255],
    [128, 128, 128],
    [7, 5, 5],
    [255, 0, 0],
  ];

  const result = prepareHueHistogramSamples(colors, {
    mode: "perceptual",
    chromaThreshold: 10,
    saturationThreshold: 0,
  });

  assert.equal(result.totalCount, colors.length);
  assert.equal(result.lowChromaCount, 4);
  assert.equal(result.samples.length, 1);
  assert.deepEqual(
    result.samples.map((sample) => sample.index),
    [4],
  );
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
    chromaThreshold: 10,
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
    chromaThreshold: 10,
    saturationThreshold: 0.2,
  });

  assert.equal(result.lowChromaCount, 1);
  assert.deepEqual(
    result.samples.map((sample) => sample.index),
    [1],
  );
});
