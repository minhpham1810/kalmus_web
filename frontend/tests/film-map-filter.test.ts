import test from "node:test";
import assert from "node:assert/strict";

import { NO_FILTER, filterActive, inLightRange, matchesFilter, yearBounds } from "../lib/film-map-filter";
import type { MapFilm } from "../lib/film-map";

const film = (over: Partial<MapFilm> = {}): MapFilm => ({
  job_id: "a",
  hue: 10,
  mean_hue: 10,
  hue_hist: null,
  lightness: 0.5,
  title: "Alpha",
  year: 1999,
  edition: null,
  countries: ["France"],
  directors: ["Agnes Varda"],
  genres: ["Drama"],
  ...over,
});

test("NO_FILTER matches everything and is inactive", () => {
  assert.equal(matchesFilter(film(), NO_FILTER), true);
  assert.equal(filterActive(NO_FILTER), false);
});

test("text fields match case-insensitive substrings", () => {
  assert.equal(matchesFilter(film(), { ...NO_FILTER, country: "fran" }), true);
  assert.equal(matchesFilter(film(), { ...NO_FILTER, director: "VARDA" }), true);
  assert.equal(matchesFilter(film(), { ...NO_FILTER, genre: "comedy" }), false);
});

test("checked films restrict by job_id", () => {
  assert.equal(matchesFilter(film(), { ...NO_FILTER, films: ["a", "b"] }), true);
  assert.equal(matchesFilter(film(), { ...NO_FILTER, films: ["b"] }), false);
});

test("year range is inclusive and excludes films without a year", () => {
  const flt = { ...NO_FILTER, years: [1990, 1999] as [number, number] };
  assert.equal(matchesFilter(film({ year: 1990 }), flt), true);
  assert.equal(matchesFilter(film({ year: 1999 }), flt), true);
  assert.equal(matchesFilter(film({ year: 2000 }), flt), false);
  assert.equal(matchesFilter(film({ year: 1989 }), flt), false);
  assert.equal(matchesFilter(film({ year: null }), flt), false);
});

test("matchesFilter ignores lightness", () => {
  assert.equal(matchesFilter(film({ lightness: 0.99 }), { ...NO_FILTER, light: [0, 10] }), true);
});

test("inLightRange is inclusive at both edges", () => {
  const flt = { ...NO_FILTER, light: [25, 75] as [number, number] };
  assert.equal(inLightRange(film({ lightness: 0.25 }), flt), true);
  assert.equal(inLightRange(film({ lightness: 0.75 }), flt), true);
  assert.equal(inLightRange(film({ lightness: 0.24 }), flt), false);
  assert.equal(inLightRange(film({ lightness: 0.76 }), flt), false);
  assert.equal(inLightRange(film({ lightness: 0.57 }), { ...NO_FILTER, light: [57, 100] }), true);
  assert.equal(inLightRange(film({ lightness: 0 }), NO_FILTER), true);
  assert.equal(inLightRange(film({ lightness: 1 }), NO_FILTER), true);
});

test("filterActive reflects films, text and years but not lightness", () => {
  assert.equal(filterActive({ ...NO_FILTER, films: ["a"] }), true);
  assert.equal(filterActive({ ...NO_FILTER, genre: "x" }), true);
  assert.equal(filterActive({ ...NO_FILTER, genre: "  " }), false);
  assert.equal(filterActive({ ...NO_FILTER, years: [1990, 2000] }), true);
  assert.equal(filterActive({ ...NO_FILTER, light: [10, 90] }), false);
});

test("yearBounds ignores null years", () => {
  assert.deepEqual(yearBounds([film({ year: 2001 }), film({ year: null }), film({ year: 1950 })]), [1950, 2001]);
});
