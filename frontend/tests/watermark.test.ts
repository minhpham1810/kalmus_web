import test from "node:test";
import assert from "node:assert/strict";

import { getWatermarkRect } from "../lib/watermark";

test("getWatermarkRect places the logo in the lower-left corner", () => {
  // 4000x2000 image, 400x100 logo: width-bound at 15% -> 600x150, margin 3% of 2000 = 60
  assert.deepEqual(getWatermarkRect(4000, 2000, 400, 100), {
    x: 60,
    y: 2000 - 150 - 60,
    width: 600,
    height: 150,
  });
});

test("getWatermarkRect shrinks the logo to fit a short, wide barcode", () => {
  // height-bound at 20% of 100 -> 20 tall, 80 wide; margin 3
  assert.deepEqual(getWatermarkRect(3000, 100, 400, 100), {
    x: 3,
    y: 100 - 20 - 3,
    width: 80,
    height: 20,
  });
});

test("getWatermarkRect returns an empty rect for empty inputs", () => {
  assert.deepEqual(getWatermarkRect(0, 100, 400, 100), { x: 0, y: 0, width: 0, height: 0 });
  assert.deepEqual(getWatermarkRect(100, 100, 0, 0), { x: 0, y: 0, width: 0, height: 0 });
});
