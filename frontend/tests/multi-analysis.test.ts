import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAnalysisConfigPayload,
  createAnalysisConfig,
  findDuplicateAnalysisSignatures,
  getInitialAnalysisConfigs,
  normalizeFrameType,
  normalizeAnalysisConfigs,
} from "../lib/multi-analysis";
import {
  createSubmissionBatch,
  getSubmissionBatch,
  SubmissionBatchRecord,
} from "../lib/submission-batches";

test("getInitialAnalysisConfigs returns one default analysis row", () => {
  const configs = getInitialAnalysisConfigs();

  assert.equal(configs.length, 1);
  assert.equal(configs[0].barcode_type, "Color");
  assert.equal(configs[0].frame_type, "whole_frame");
  assert.equal(configs[0].color_metric, "Average");
});

test("createAnalysisConfig clones the previous row and assigns a new client id", () => {
  const previous = createAnalysisConfig({
    clientId: "analysis-1",
    barcode_type: "Brightness",
    frame_type: "foreground",
    color_metric: "Median",
  });

  const next = createAnalysisConfig(previous);

  assert.notEqual(next.clientId, previous.clientId);
  assert.equal(next.barcode_type, "Brightness");
  assert.equal(next.frame_type, "foreground");
  assert.equal(next.color_metric, "Median");
});

test("normalizeAnalysisConfigs fills defaults for incomplete payload rows", () => {
  const configs = normalizeAnalysisConfigs([
    {
      clientId: "analysis-1",
      barcode_type: "Brightness",
      frame_type: "Foreground",
      color_metric: "Mode",
    },
    {
      frame_type: "Background",
    },
  ]);

  assert.deepEqual(configs, [
    {
      clientId: "analysis-1",
      barcode_type: "Brightness",
      frame_type: "foreground",
      color_metric: "Mode",
      forceReprocess: false,
    },
    {
      clientId: "analysis-2",
      barcode_type: "Color",
      frame_type: "background",
      color_metric: "Average",
      forceReprocess: false,
    },
  ]);
});

test("buildAnalysisConfigPayload strips client-only UI state", () => {
  const payload = buildAnalysisConfigPayload([
    {
      clientId: "analysis-1",
      barcode_type: "Brightness",
      frame_type: "Foreground",
      color_metric: "Average",
      forceReprocess: true,
    },
  ]);

  assert.deepEqual(payload, [
    {
      clientId: "analysis-1",
      barcode_type: "Brightness",
      frame_type: "foreground",
      color_metric: "Average",
      force_reprocess: true,
    },
  ]);
});

test("normalizeFrameType maps legacy labels to backend-safe values", () => {
  assert.equal(normalizeFrameType("High_contrast_region"), "high_contrast");
  assert.equal(normalizeFrameType("Foreground"), "foreground");
  assert.equal(normalizeFrameType("whole_frame"), "whole_frame");
});

test("findDuplicateAnalysisSignatures returns repeated triplets once", () => {
  const duplicates = findDuplicateAnalysisSignatures([
    { barcode_type: "Color", frame_type: "whole_frame", color_metric: "Average" },
    { barcode_type: "Brightness", frame_type: "whole_frame", color_metric: "Average" },
    { barcode_type: "Color", frame_type: "whole_frame", color_metric: "Average" },
    { barcode_type: "Color", frame_type: "foreground", color_metric: "Average" },
  ]);

  assert.deepEqual(duplicates, ["Color::whole_frame::Average"]);
});

test("findDuplicateAnalysisSignatures normalizes legacy frame labels before comparing", () => {
  const duplicates = findDuplicateAnalysisSignatures([
    { barcode_type: "Color", frame_type: "High_contrast_region", color_metric: "Average" },
    { barcode_type: "Color", frame_type: "high_contrast", color_metric: "Average" },
    { barcode_type: "Color", frame_type: "whole_frame", color_metric: "Average" },
  ]);

  assert.deepEqual(duplicates, ["Color::high_contrast::Average"]);
});

test("createSubmissionBatch persists and reloads batch job details", async () => {
  const batch: SubmissionBatchRecord = {
    batchId: "batch-test-1",
    createdAt: "2026-05-26T12:00:00.000Z",
    filename: "movie.mp4",
    movie: {
      title: "Test Film",
      imdb_id: "tt1234567",
    },
    sharedConfig: {
      email: "user@example.com",
      partition: "short",
      sampled_rate: 1,
      skip_over: 0,
      total_frames: 100000000,
      frames_per_column: 192,
      save_thumbnails: true,
    },
    jobs: [
      {
        clientId: "analysis-1",
        jobId: "job-1",
        status: "submitted",
        config: {
          clientId: "analysis-1",
          barcode_type: "Color",
          frame_type: "whole_frame",
          color_metric: "Average",
          force_reprocess: false,
        },
      },
      {
        clientId: "analysis-2",
        existingJobId: "job-2",
        status: "duplicate",
        config: {
          clientId: "analysis-2",
          barcode_type: "Brightness",
          frame_type: "foreground",
          color_metric: "Median",
          force_reprocess: false,
        },
      },
    ],
  };

  await createSubmissionBatch(batch);
  const reloaded = await getSubmissionBatch(batch.batchId);

  assert.deepEqual(reloaded, batch);
});
