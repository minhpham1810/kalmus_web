import test from "node:test";
import assert from "node:assert/strict";

import { getDailyFilmOffset, getUtcDayIndex } from "../lib/film-of-day";

test("getUtcDayIndex changes on UTC day boundaries", () => {
  assert.equal(getUtcDayIndex(Date.UTC(2026, 4, 28, 23, 59, 59)), 20601);
  assert.equal(getUtcDayIndex(Date.UTC(2026, 4, 29, 0, 0, 0)), 20602);
});

test("getDailyFilmOffset picks deterministic global offset from UTC day", () => {
  assert.equal(getDailyFilmOffset(5, Date.UTC(2026, 4, 28, 12, 0, 0)), 1);
  assert.equal(getDailyFilmOffset(5, Date.UTC(2026, 4, 29, 12, 0, 0)), 2);
});

test("getDailyFilmOffset returns null when there are no films", () => {
  assert.equal(getDailyFilmOffset(0, Date.UTC(2026, 4, 28, 12, 0, 0)), null);
});
