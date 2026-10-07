import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync, crc32 } from "node:zlib";

import { getDownloadSize, withPngDpi } from "../lib/barcode-download";

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// minimal 1x1 grayscale PNG
function buildPng(): Uint8Array {
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0]);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(Buffer.from([0, 0]))),
      chunk("IEND", new Uint8Array(0)),
    ])
  );
}

test("getDownloadSize keeps the native size for the digital version", () => {
  assert.deepEqual(getDownloadSize("digital", 1200, 160), {
    width: 1200,
    height: 160,
    dpi: null,
  });
});

test("getDownloadSize targets 30 inches wide at 300dpi for print", () => {
  assert.deepEqual(getDownloadSize("print", 1200, 160), {
    width: 9000,
    height: 1200,
    dpi: 300,
  });
});

test("getDownloadSize never downscales a barcode wider than the print target", () => {
  assert.deepEqual(getDownloadSize("print", 12000, 160), {
    width: 12000,
    height: 160,
    dpi: 400,
  });
});

test("withPngDpi inserts a valid pHYs chunk right after IHDR", () => {
  const png = buildPng();
  const tagged = Buffer.from(withPngDpi(png, 300));

  assert.equal(tagged.length, png.length + 21);
  assert.deepEqual(tagged.subarray(0, 33), Buffer.from(png.subarray(0, 33)));
  assert.equal(tagged.readUInt32BE(33), 9);
  assert.equal(tagged.toString("ascii", 37, 41), "pHYs");
  assert.equal(tagged.readUInt32BE(41), 11811);
  assert.equal(tagged.readUInt32BE(45), 11811);
  assert.equal(tagged[49], 1);
  assert.equal(tagged.readUInt32BE(50), crc32(tagged.subarray(37, 50)));
  assert.deepEqual(tagged.subarray(54), Buffer.from(png.subarray(33)));
});

test("withPngDpi rejects data that is not a PNG", () => {
  assert.throws(() => withPngDpi(new Uint8Array(64), 300), /Not a PNG/);
});
