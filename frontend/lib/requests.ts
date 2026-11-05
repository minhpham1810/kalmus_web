import path from "path";
import Database from "better-sqlite3";

import { requireEnv } from "@/lib/env";
import { checkSlurmJobStatus, sendJobNotificationEmail, SLURM_CONFIG } from "@/lib/slurm";
import type { SubmissionBatchJobRecord } from "@/lib/submission-batches";
import {
  ensureSchema,
  FilmRequest,
  getRequest,
  linkJob,
  RequestStatus,
  setStatus,
  StatusChange,
} from "@/lib/requests-store";

const REQUESTS_DB_PATH =
  process.env.REQUESTS_DB_PATH || path.join(path.dirname(requireEnv("FILMS_DB_PATH")), "requests.db");

const SYNC_INTERVAL_MS = 15_000;
const FAILED_JOB_STATES = ["FAILED", "CANCELLED", "TIMEOUT", "OUT_OF_MEMORY", "NODE_FAIL"];

let lastSyncAt = 0;

export function withRequestsDb<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(REQUESTS_DB_PATH, { timeout: 5000 });
  try {
    ensureSchema(db);
    return fn(db);
  } finally {
    db.close();
  }
}

/** Emails every subscriber about an accepted, rejected or completed request. Failures are logged, never thrown. */
export async function notifySubscribers(change: StatusChange): Promise<void> {
  const { request, subscribers } = change;
  const base = SLURM_CONFIG.websiteUrl.replace(/\/$/, "");

  let status: "ACCEPTED" | "REJECTED" | "COMPLETED";
  let resultsUrl = `${base}/requests`;
  if (request.status === "accepted") {
    status = "ACCEPTED";
  } else if (request.status === "rejected") {
    status = "REJECTED";
  } else if (request.status === "completed" && request.jobId) {
    status = "COMPLETED";
    resultsUrl = `${base}/results/${request.jobId}`;
  } else {
    return;
  }

  const results = await Promise.allSettled(
    subscribers.map((email) =>
      sendJobNotificationEmail({
        email,
        status,
        resultsUrl,
        videoTitle: request.title,
        note: request.rejectReason || undefined,
      }),
    ),
  );
  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error(`Request ${request.id}: notification email failed:`, result.reason);
    }
  });
}

/** Applies a status change and emails subscribers when the status actually changed. */
export async function updateRequestStatus(
  id: number,
  status: RequestStatus,
  options: { jobId?: string | null; rejectReason?: string | null } = {},
): Promise<FilmRequest | null> {
  const change = withRequestsDb((db) => setStatus(db, id, status, options));
  if (!change) return null;
  if (change.changed) await notifySubscribers(change);
  return change.request;
}

/** Called after an admin submits the job for a request. */
export function linkRequestToJob(id: number, jobId: string): FilmRequest | null {
  return withRequestsDb((db) => linkJob(db, id, jobId))?.request ?? null;
}

/**
 * After an admin submits the job for a request (the upload form was opened from it), moves the
 * request forward: to processing with the first new job, or straight to completed if every
 * analysis already existed. Never throws, so a queue problem cannot fail a submission.
 */
export async function linkRequestToBatch(
  requestId: unknown,
  jobs: SubmissionBatchJobRecord[],
): Promise<void> {
  const id = Number(requestId);
  if (!requestId || !Number.isInteger(id)) return;

  try {
    const request = getRequestById(id);
    if (!request || request.status === "completed" || request.status === "rejected") return;

    const submitted = jobs.find((job) => job.status === "submitted" && job.jobId);
    if (submitted?.jobId) {
      linkRequestToJob(id, submitted.jobId);
      return;
    }
    const duplicate = jobs.find((job) => job.status === "duplicate" && job.existingJobId);
    if (duplicate?.existingJobId) {
      await updateRequestStatus(id, "completed", { jobId: duplicate.existingJobId });
    }
  } catch (error) {
    console.error("Could not link submission to film request:", error);
  }
}

export function getRequestById(id: number): FilmRequest | null {
  return withRequestsDb((db) => getRequest(db, id));
}

/**
 * Moves processing requests to completed (or back to accepted if the job died) by checking their
 * SLURM jobs. Throttled so frequent client polling does not hammer squeue/sacct.
 */
export async function syncProcessingRequests(): Promise<void> {
  const now = Date.now();
  if (now - lastSyncAt < SYNC_INTERVAL_MS) return;
  lastSyncAt = now;

  const processing = withRequestsDb(
    (db) =>
      db
        .prepare("SELECT id, job_id FROM film_requests WHERE status = 'processing' AND job_id IS NOT NULL")
        .all() as { id: number; job_id: string }[],
  );

  for (const { id, job_id: jobId } of processing) {
    try {
      const job = await checkSlurmJobStatus(jobId);
      const state = String(job.status).toUpperCase();

      if (job.completed && (state.includes("COMPLETED") || state === "DUPLICATE")) {
        const existingJobId = "existingJobId" in job ? job.existingJobId : undefined;
        await updateRequestStatus(id, "completed", { jobId: existingJobId || jobId });
      } else if (FAILED_JOB_STATES.some((failed) => state.includes(failed))) {
        // Silent: let the admin resubmit rather than telling subscribers about an internal failure
        withRequestsDb((db) => setStatus(db, id, "accepted", { jobId: null }));
      }
    } catch (error) {
      console.error(`Request ${id}: could not check job ${jobId}:`, error);
    }
  }
}
