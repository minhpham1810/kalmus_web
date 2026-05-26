import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

import { AnalysisConfigPayload } from "./multi-analysis";

export interface SubmissionBatchJobRecord {
  clientId: string;
  status: "submitted" | "duplicate";
  jobId?: string;
  existingJobId?: string;
  estimatedTime?: string;
  config: AnalysisConfigPayload;
}

export interface SubmissionBatchSharedConfig {
  email?: string;
  partition?: string;
  sampled_rate: number;
  skip_over: number;
  total_frames: number;
  frames_per_column: number;
  save_thumbnails: boolean;
}

export interface SubmissionBatchRecord {
  batchId: string;
  createdAt: string;
  filename: string;
  movie?: Record<string, unknown> | null;
  sharedConfig: SubmissionBatchSharedConfig;
  jobs: SubmissionBatchJobRecord[];
}

const SUBMISSION_BATCH_DIR =
  process.env.SUBMISSION_BATCH_DIR || "/tmp/kalmus-submission-batches";

function getBatchPath(batchId: string): string {
  return path.join(SUBMISSION_BATCH_DIR, `${batchId}.json`);
}

export function createSubmissionBatchId(): string {
  return randomUUID();
}

export async function createSubmissionBatch(
  batch: SubmissionBatchRecord,
): Promise<SubmissionBatchRecord> {
  await fs.mkdir(SUBMISSION_BATCH_DIR, { recursive: true });
  await fs.writeFile(getBatchPath(batch.batchId), JSON.stringify(batch, null, 2));
  return batch;
}

export async function getSubmissionBatch(
  batchId: string,
): Promise<SubmissionBatchRecord | null> {
  try {
    const batchContent = await fs.readFile(getBatchPath(batchId), "utf-8");
    return JSON.parse(batchContent) as SubmissionBatchRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}
