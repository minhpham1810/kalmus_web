import type Database from "better-sqlite3";

import { parseRequestConfig, RequestConfig, requestSignature } from "./request-config";

export const REQUEST_STATUSES = [
  "ordered",
  "accepted",
  "processing",
  "completed",
  "rejected",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Statuses where a new request or "remind me" still makes sense. */
const OPEN_STATUSES: readonly RequestStatus[] = ["ordered", "accepted", "processing"];

export interface RequestedMovie {
  imdbId: string;
  title: string;
  year: string | null;
  posterUrl: string | null;
}

export interface FilmRequest extends RequestedMovie {
  id: number;
  config: RequestConfig;
  status: RequestStatus;
  jobId: string | null;
  rejectReason: string | null;
  requestCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AddRequestResult {
  request: FilmRequest;
  /** True when this call created the film's request (first requester). */
  created: boolean;
  /** True when the email was already subscribed to this request. */
  alreadySubscribed: boolean;
  /** True when the request is completed/rejected, so the email was not subscribed. */
  closed: boolean;
}

export interface StatusChange {
  request: FilmRequest;
  changed: boolean;
  subscribers: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IMDB_ID_RE = /^tt\d{7,8}$/i;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

export function normalizeImdbId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toLowerCase();
  return IMDB_ID_RE.test(id) ? id : null;
}

export function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === "string" && (REQUEST_STATUSES as readonly string[]).includes(value);
}

const REQUESTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS film_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    imdb_id TEXT NOT NULL,
    signature TEXT NOT NULL,
    config_json TEXT NOT NULL,
    title TEXT NOT NULL,
    year TEXT,
    poster_url TEXT,
    status TEXT NOT NULL DEFAULT 'ordered',
    job_id TEXT,
    reject_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (imdb_id, signature)
  )`;

/**
 * Databases created before requests carried a configuration have one request per film and no
 * config. Rebuilds the table, giving those requests the default analysis they implicitly asked for.
 */
function migrateLegacyRequests(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(film_requests)").all() as { name: string }[];
  if (columns.length === 0 || columns.some((c) => c.name === "signature")) return;

  const defaultConfig = parseRequestConfig({
    analyses: [{ barcode_type: "Color", frame_type: "whole_frame", color_metric: "Average" }],
  })!;
  const configJson = JSON.stringify(defaultConfig);
  const signature = requestSignature(defaultConfig);

  // Dropping the old table must not cascade into request_subscribers, so foreign keys are off
  // for the rebuild (the pragma has no effect inside a transaction).
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(REQUESTS_TABLE_SQL.replace("film_requests", "film_requests_new"));
      db.prepare(
        `INSERT INTO film_requests_new
           (id, imdb_id, signature, config_json, title, year, poster_url, status, job_id, reject_reason, created_at, updated_at)
         SELECT id, imdb_id, ?, ?, title, year, poster_url, status, job_id, reject_reason, created_at, updated_at
         FROM film_requests`,
      ).run(signature, configJson);
      db.exec("DROP TABLE film_requests; ALTER TABLE film_requests_new RENAME TO film_requests;");
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

export function ensureSchema(db: Database.Database): void {
  db.pragma("foreign_keys = ON");
  migrateLegacyRequests(db);
  db.exec(`
    ${REQUESTS_TABLE_SQL};
    CREATE TABLE IF NOT EXISTS request_subscribers (
      request_id INTEGER NOT NULL REFERENCES film_requests(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (request_id, email)
    );
  `);
}

interface RequestRow {
  id: number;
  imdb_id: string;
  config_json: string;
  title: string;
  year: string | null;
  poster_url: string | null;
  status: RequestStatus;
  job_id: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  request_count: number;
}

const REQUEST_SELECT = `
  SELECT r.*, (SELECT COUNT(*) FROM request_subscribers s WHERE s.request_id = r.id) AS request_count
  FROM film_requests r`;

function toRequest(row: RequestRow): FilmRequest {
  return {
    id: row.id,
    config: parseRequestConfig(JSON.parse(row.config_json))!,
    imdbId: row.imdb_id,
    title: row.title,
    year: row.year,
    posterUrl: row.poster_url,
    status: row.status,
    jobId: row.job_id,
    rejectReason: row.reject_reason,
    requestCount: row.request_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getRequest(db: Database.Database, id: number): FilmRequest | null {
  const row = db.prepare(`${REQUEST_SELECT} WHERE r.id = ?`).get(id) as RequestRow | undefined;
  return row ? toRequest(row) : null;
}

/** Adds the email to an existing request. Each distinct email counts once. */
export function subscribe(
  db: Database.Database,
  id: number,
  email: string,
  now: Date = new Date(),
): Omit<AddRequestResult, "created"> | null {
  return db.transaction((): Omit<AddRequestResult, "created"> | null => {
    const current = getRequest(db, id);
    if (!current) return null;
    if (!OPEN_STATUSES.includes(current.status)) {
      return { request: current, alreadySubscribed: false, closed: true };
    }

    const inserted = db
      .prepare("INSERT OR IGNORE INTO request_subscribers (request_id, email, created_at) VALUES (?, ?, ?)")
      .run(id, email, now.toISOString());

    return { request: getRequest(db, id)!, alreadySubscribed: inserted.changes === 0, closed: false };
  })();
}

/**
 * Creates the request for this film and configuration, or joins the existing one. Requests for
 * the same film with the same edition and analyses share a single entry.
 */
export function addRequest(
  db: Database.Database,
  movie: RequestedMovie,
  config: RequestConfig,
  email: string,
  now: Date = new Date(),
): AddRequestResult {
  const timestamp = now.toISOString();
  const signature = requestSignature(config);

  return db.transaction((): AddRequestResult => {
    const existing = db
      .prepare("SELECT id FROM film_requests WHERE imdb_id = ? AND signature = ?")
      .get(movie.imdbId, signature) as { id: number } | undefined;

    let id: number;
    let created = false;
    if (existing) {
      id = existing.id;
    } else {
      const info = db
        .prepare(
          `INSERT INTO film_requests
             (imdb_id, signature, config_json, title, year, poster_url, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'ordered', ?, ?)`,
        )
        .run(
          movie.imdbId,
          signature,
          JSON.stringify(config),
          movie.title,
          movie.year,
          movie.posterUrl,
          timestamp,
          timestamp,
        );
      id = Number(info.lastInsertRowid);
      created = true;
    }

    return { ...subscribe(db, id, email, now)!, created };
  })();
}

/** Most requested first, oldest first among ties. */
export function listRequests(db: Database.Database, limit?: number): FilmRequest[] {
  const rows = db
    .prepare(`${REQUEST_SELECT} ORDER BY request_count DESC, r.created_at ASC, r.id ASC${limit ? " LIMIT ?" : ""}`)
    .all(...(limit ? [limit] : [])) as RequestRow[];
  return rows.map(toRequest);
}

/** The queue in processing order: active requests oldest first, then finished ones newest first. */
export function listQueue(db: Database.Database): FilmRequest[] {
  const rows = db.prepare(`${REQUEST_SELECT} ORDER BY r.created_at ASC, r.id ASC`).all() as RequestRow[];
  const requests = rows.map(toRequest);
  const active = requests.filter((r) => OPEN_STATUSES.includes(r.status));
  const finished = requests
    .filter((r) => !OPEN_STATUSES.includes(r.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return [...active, ...finished];
}

export function getSubscribers(db: Database.Database, id: number): string[] {
  const rows = db
    .prepare("SELECT email FROM request_subscribers WHERE request_id = ? ORDER BY created_at, email")
    .all(id) as { email: string }[];
  return rows.map((r) => r.email);
}

export function setStatus(
  db: Database.Database,
  id: number,
  status: RequestStatus,
  options: { jobId?: string | null; rejectReason?: string | null } = {},
  now: Date = new Date(),
): StatusChange | null {
  return db.transaction((): StatusChange | null => {
    const before = getRequest(db, id);
    if (!before) return null;

    const jobId = options.jobId === undefined ? before.jobId : options.jobId;
    const rejectReason =
      status === "rejected" ? (options.rejectReason?.trim() || null) : null;
    const changed = before.status !== status;

    db.prepare(
      "UPDATE film_requests SET status = ?, job_id = ?, reject_reason = ?, updated_at = ? WHERE id = ?",
    ).run(status, jobId, rejectReason, changed ? now.toISOString() : before.updatedAt, id);

    return { request: getRequest(db, id)!, changed, subscribers: getSubscribers(db, id) };
  })();
}

/** Marks the request as processing once an admin submits its job. */
export function linkJob(db: Database.Database, id: number, jobId: string): StatusChange | null {
  return setStatus(db, id, "processing", { jobId });
}
