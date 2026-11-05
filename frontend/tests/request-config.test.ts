import assert from "node:assert/strict";
import test from "node:test";

import { parseRequestConfig, requestSignature } from "../lib/request-config";

const analysis = { barcode_type: "Color", frame_type: "whole_frame", color_metric: "Average" };

test("defaults are applied to a minimal config", () => {
  const config = parseRequestConfig({ analyses: [analysis] })!;
  assert.equal(config.sampled_rate, 1);
  assert.equal(config.seconds_per_column, 8);
  assert.equal(config.save_thumbnails, true);
  assert.equal(config.edition, "");
});

test("missing, empty or unknown analyses are rejected", () => {
  assert.equal(parseRequestConfig({}), null);
  assert.equal(parseRequestConfig({ analyses: [] }), null);
  assert.equal(parseRequestConfig({ analyses: [{ ...analysis, color_metric: "Bogus" }] }), null);
  assert.equal(parseRequestConfig({ analyses: [{ ...analysis, frame_type: "nope" }] }), null);
});

test("legacy frame type names are normalized and duplicates dropped", () => {
  const config = parseRequestConfig({
    analyses: [{ ...analysis, frame_type: "Whole_frame" }, analysis],
  })!;
  assert.equal(config.analyses.length, 1);
  assert.equal(config.analyses[0].frame_type, "whole_frame");
});

test("numbers are clamped and junk falls back to defaults", () => {
  const config = parseRequestConfig({
    analyses: [analysis],
    sampled_rate: -5,
    skip_over: "abc",
    seconds_per_column: 99999,
    total_frames: "",
  })!;
  assert.equal(config.sampled_rate, 1);
  assert.equal(config.skip_over, 0);
  assert.equal(config.seconds_per_column, 600);
  assert.equal(config.total_frames, 100_000_000);
});

test("edition is trimmed and length-limited", () => {
  const config = parseRequestConfig({ analyses: [analysis], edition: `  ${"x".repeat(500)} ` })!;
  assert.equal(config.edition.length, 100);
});

test("signature ignores analysis order, sampling settings and edition case", () => {
  const other = { ...analysis, barcode_type: "Brightness" };
  const a = parseRequestConfig({ analyses: [analysis, other], edition: "Criterion", sampled_rate: 2 })!;
  const b = parseRequestConfig({ analyses: [other, analysis], edition: "criterion", sampled_rate: 9 })!;
  assert.equal(requestSignature(a), requestSignature(b));
});
