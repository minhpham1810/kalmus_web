export type DownloadVariant = "digital" | "print";

export interface DownloadSize {
  width: number;
  height: number;
  // null leaves the PNG without a physical size
  dpi: number | null;
}

// Poster target: 30 inches wide at 300dpi.
export const PRINT_WIDTH_INCHES = 30;
export const PRINT_DPI = 300;
export const PRINT_WIDTH_PX = PRINT_WIDTH_INCHES * PRINT_DPI;

const INCHES_PER_METER = 39.3701;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// signature (8) + IHDR chunk (4 length + 4 type + 13 data + 4 crc)
const PNG_IHDR_END = 33;

export function getDownloadSize(
  variant: DownloadVariant,
  sourceWidth: number,
  sourceHeight: number
): DownloadSize {
  if (variant === "digital" || sourceWidth <= 0 || sourceHeight <= 0) {
    return { width: sourceWidth, height: sourceHeight, dpi: null };
  }

  // Never downscale: a barcode already wider than the target keeps every frame
  // and is tagged with a higher dpi so it still prints 30 inches wide.
  const width = Math.max(PRINT_WIDTH_PX, sourceWidth);
  const height = Math.max(1, Math.round((sourceHeight * width) / sourceWidth));
  return { width, height, dpi: width / PRINT_WIDTH_INCHES };
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Returns a copy of the PNG with a pHYs chunk inserted after IHDR, so print
// software opens it at the intended physical size. Assumes the PNG has no
// pHYs chunk yet (true for canvas-encoded PNGs).
export function withPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  if (png.length < PNG_IHDR_END || PNG_SIGNATURE.some((byte, i) => png[i] !== byte)) {
    throw new Error("Not a PNG file");
  }

  const pixelsPerMeter = Math.round(dpi * INCHES_PER_METER);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, pixelsPerMeter);
  view.setUint32(12, pixelsPerMeter);
  chunk[16] = 1; // unit: meter
  view.setUint32(17, crc32(chunk.subarray(4, 17)));

  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, PNG_IHDR_END), 0);
  out.set(chunk, PNG_IHDR_END);
  out.set(png.subarray(PNG_IHDR_END), PNG_IHDR_END + chunk.length);
  return out;
}
