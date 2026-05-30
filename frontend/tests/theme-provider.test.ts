import test from "node:test";
import assert from "node:assert/strict";

import {
  BG_COLORS,
  BG_CYCLE,
  DARK_BG_LEVELS,
  THEME_LABELS,
  getReadableTextColor,
  normalizeBgLevel,
  type BgLevel,
} from "../app/components/theme";

test("theme exposes four grayscale levels in display order", () => {
  assert.deepEqual(BG_CYCLE, ["gray10", "gray30", "gray60", "gray90"]);

  const expectedColors: Record<BgLevel, string> = {
    gray10: "#1a1a1a",
    gray30: "#4d4d4d",
    gray60: "#999999",
    gray90: "#e6e6e6",
  };

  assert.deepEqual(BG_COLORS, expectedColors);
  assert.deepEqual(THEME_LABELS, {
    gray10: "10%",
    gray30: "30%",
    gray60: "60%",
    gray90: "90%",
  });
});

test("theme normalizes legacy stored values to nearest grayscale level", () => {
  assert.equal(normalizeBgLevel("black"), "gray10");
  assert.equal(normalizeBgLevel("white"), "gray90");
  assert.equal(normalizeBgLevel("grey10"), "gray10");
  assert.equal(normalizeBgLevel("grey40"), "gray30");
  assert.equal(normalizeBgLevel("grey60"), "gray60");
  assert.equal(normalizeBgLevel("grey90"), "gray90");
  assert.equal(normalizeBgLevel(null), "gray10");
});

test("theme text color maintains readable contrast against each background", () => {
  assert.equal(getReadableTextColor("gray10"), "#ffffff");
  assert.equal(getReadableTextColor("gray30"), "#ffffff");
  assert.equal(getReadableTextColor("gray60"), "#000000");
  assert.equal(getReadableTextColor("gray90"), "#000000");
  assert.deepEqual(DARK_BG_LEVELS, new Set<BgLevel>(["gray10", "gray30"]));
});
