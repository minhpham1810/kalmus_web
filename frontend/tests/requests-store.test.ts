import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { parseRequestConfig, RequestConfig } from "../lib/request-config";
import {
  addRequest,
  ensureSchema,
  getSubscribers,
  linkJob,
  listQueue,
  listRequests,
  normalizeEmail,
  normalizeImdbId,
  setStatus,
  subscribe,
} from "../lib/requests-store";

const heat = { imdbId: "tt0113277", title: "Heat", year: "1995", posterUrl: null };
const alien = { imdbId: "tt0078748", title: "Alien", year: "1979", posterUrl: null };

function cfg(overrides: Record<string, unknown> = {}): RequestConfig {
  return parseRequestConfig({
    analyses: [{ barcode_type: "Color", frame_type: "whole_frame", color_metric: "Average" }],
    ...overrides,
  })!;
}

function freshDb() {
  const db = new Database(":memory:");
  ensureSchema(db);
  return db;
}

test("normalizeEmail trims, lowercases and rejects bad input", () => {
  assert.equal(normalizeEmail("  Foo@Bar.com "), "foo@bar.com");
  assert.equal(normalizeEmail("nope"), null);
  assert.equal(normalizeEmail(42), null);
});

test("normalizeImdbId accepts tt ids only", () => {
  assert.equal(normalizeImdbId("TT0113277"), "tt0113277");
  assert.equal(normalizeImdbId("0113277"), null);
});

test("a new request is created with one subscriber", () => {
  const db = freshDb();
  const result = addRequest(db, heat, cfg(), "a@x.com");
  assert.equal(result.created, true);
  assert.equal(result.request.status, "ordered");
  assert.equal(result.request.requestCount, 1);
});

test("the same film merges and counts each distinct email once", () => {
  const db = freshDb();
  addRequest(db, heat, cfg(), "a@x.com");
  const second = addRequest(db, heat, cfg(), "b@x.com");
  const repeat = addRequest(db, heat, cfg(), "b@x.com");
  assert.equal(second.created, false);
  assert.equal(second.request.requestCount, 2);
  assert.equal(repeat.alreadySubscribed, true);
  assert.equal(repeat.request.requestCount, 2);
  assert.equal(listRequests(db).length, 1);
});

test("listRequests ranks by request count and honors the limit", () => {
  const db = freshDb();
  addRequest(db, alien, cfg(), "a@x.com");
  addRequest(db, heat, cfg(), "a@x.com");
  addRequest(db, heat, cfg(), "b@x.com");
  const top = listRequests(db, 1);
  assert.equal(top.length, 1);
  assert.equal(top[0].title, "Heat");
});

test("setStatus reports a change once and returns subscribers", () => {
  const db = freshDb();
  const { request } = addRequest(db, heat, cfg(), "a@x.com");
  addRequest(db, heat, cfg(), "b@x.com");
  const first = setStatus(db, request.id, "accepted")!;
  const again = setStatus(db, request.id, "accepted")!;
  assert.equal(first.changed, true);
  assert.deepEqual(first.subscribers, ["a@x.com", "b@x.com"]);
  assert.equal(again.changed, false);
});

test("rejecting stores the reason; leaving rejected clears it", () => {
  const db = freshDb();
  const { request } = addRequest(db, heat, cfg(), "a@x.com");
  const rejected = setStatus(db, request.id, "rejected", { rejectReason: " no rights " })!;
  assert.equal(rejected.request.rejectReason, "no rights");
  const reopened = setStatus(db, request.id, "ordered")!;
  assert.equal(reopened.request.rejectReason, null);
});

test("closed requests do not take new subscribers", () => {
  const db = freshDb();
  const { request } = addRequest(db, heat, cfg(), "a@x.com");
  setStatus(db, request.id, "rejected");
  const late = addRequest(db, heat, cfg(), "b@x.com");
  assert.equal(late.closed, true);
  assert.deepEqual(getSubscribers(db, request.id), ["a@x.com"]);
});

test("linkJob moves the request to processing with its job id", () => {
  const db = freshDb();
  const { request } = addRequest(db, heat, cfg(), "a@x.com");
  const linked = linkJob(db, request.id, "job-1")!;
  assert.equal(linked.request.status, "processing");
  assert.equal(linked.request.jobId, "job-1");
});

test("listQueue puts active requests before finished ones", () => {
  const db = freshDb();
  const first = addRequest(db, heat, cfg(), "a@x.com", new Date("2026-01-01")).request;
  addRequest(db, alien, cfg(), "a@x.com", new Date("2026-01-02"));
  setStatus(db, first.id, "completed", {}, new Date("2026-02-01"));
  assert.deepEqual(
    listQueue(db).map((r) => r.title),
    ["Alien", "Heat"],
  );
});

test("setStatus returns null for an unknown request", () => {
  assert.equal(setStatus(freshDb(), 99, "accepted"), null);
});

test("the same film with a different analysis is a separate request", () => {
  const db = freshDb();
  addRequest(db, heat, cfg(), "a@x.com");
  const brightness = addRequest(
    db,
    heat,
    cfg({ analyses: [{ barcode_type: "Brightness", frame_type: "whole_frame", color_metric: "Average" }] }),
    "b@x.com",
  );
  assert.equal(brightness.created, true);
  assert.equal(listRequests(db).length, 2);
});

test("a different edition is a separate request", () => {
  const db = freshDb();
  addRequest(db, heat, cfg(), "a@x.com");
  const criterion = addRequest(db, heat, cfg({ edition: "Criterion" }), "b@x.com");
  assert.equal(criterion.created, true);
});

test("sampling settings do not split requests and the first requester's settings are kept", () => {
  const db = freshDb();
  addRequest(db, heat, cfg({ sampled_rate: 4 }), "a@x.com");
  const second = addRequest(db, heat, cfg({ sampled_rate: 8 }), "b@x.com");
  assert.equal(second.created, false);
  assert.equal(second.request.config.sampled_rate, 4);
});

test("the saved configuration round-trips", () => {
  const db = freshDb();
  const { request } = addRequest(db, heat, cfg({ skip_over: 120, seconds_per_column: 12 }), "a@x.com");
  assert.equal(request.config.skip_over, 120);
  assert.equal(request.config.seconds_per_column, 12);
  assert.equal(request.config.analyses[0].color_metric, "Average");
});

test("subscribe adds to an existing request and returns null for an unknown one", () => {
  const db = freshDb();
  const { request } = addRequest(db, heat, cfg(), "a@x.com");
  assert.equal(subscribe(db, request.id, "b@x.com")!.request.requestCount, 2);
  assert.equal(subscribe(db, 99, "b@x.com"), null);
});

test("a database from before request configs is migrated with its requests and subscribers intact", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE film_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      imdb_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      year TEXT,
      poster_url TEXT,
      status TEXT NOT NULL DEFAULT 'ordered',
      job_id TEXT,
      reject_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE request_subscribers (
      request_id INTEGER NOT NULL REFERENCES film_requests(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (request_id, email)
    );
    INSERT INTO film_requests (imdb_id, title, year, status, created_at, updated_at)
      VALUES ('tt0113277', 'Heat', '1995', 'accepted', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z');
    INSERT INTO request_subscribers VALUES (1, 'a@x.com', '2026-01-01T00:00:00.000Z');
  `);

  ensureSchema(db);
  ensureSchema(db); // idempotent

  const [migrated] = listRequests(db);
  assert.equal(migrated.title, "Heat");
  assert.equal(migrated.status, "accepted");
  assert.equal(migrated.requestCount, 1);
  assert.equal(migrated.config.analyses[0].barcode_type, "Color");

  // The default-config request merges with a new identical request, and new ones still insert
  assert.equal(addRequest(db, heat, cfg(), "b@x.com").created, false);
  assert.equal(addRequest(db, alien, cfg(), "b@x.com").request.id, 2);
});
