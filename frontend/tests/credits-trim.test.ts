import test from "node:test";
import assert from "node:assert/strict";

import { autoWindow, formatTime, parseTime, validateOverride } from "../lib/credits-trim";

test("parseTime accepts h:mm:ss, mm:ss and seconds", () => {
  assert.equal(parseTime("1:52:10"), 6730);
  assert.equal(parseTime("0:40"), 40);
  assert.equal(parseTime("90"), 90);
  assert.equal(parseTime("90.5"), 90.5);
});

test("parseTime returns null for empty and NaN for junk", () => {
  assert.equal(parseTime(""), null);
  assert.ok(Number.isNaN(parseTime("abc")));
});

test("formatTime renders h:mm:ss", () => {
  assert.equal(formatTime(6730), "1:52:10");
});

test("autoWindow follows the release-year rule and fallback", () => {
  assert.deepEqual(autoWindow(1976, 6000), [60, 5700]);
  assert.deepEqual(autoWindow(1975, 6000), [0, 6000]);
  assert.deepEqual(autoWindow(null, 300), [0, 300]);
});

test("validateOverride returns the right message", () => {
  assert.equal(validateOverride(40, 6730, 7000), null);
  assert.equal(validateOverride(100, 50, 7000), "End credits must begin after the film starts.");
  assert.equal(validateOverride(0, 7100, 7000), "That's past the end of the video (1:56:40).");
  assert.equal(validateOverride(0, 1000, 7000), "That keeps less than half the film.");
  assert.equal(validateOverride(null, null, 7000), null);
  assert.equal(validateOverride(Number.NaN, null, 7000), "Use h:mm:ss, mm:ss or seconds.");
});
