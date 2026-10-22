// Watermark for image downloads on the public site. Admins (who reach results
// pages from /admin, via ?from=admin) download clean images.
// Keep sizing in sync with add_watermark() in backend/generate_layers.py.

export interface WatermarkRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const WATERMARK_SRC = "/kalmus-logo.png";
export const WATERMARK_OPACITY = 0.9;
// Logo spans at most 15% of the image width and 20% of its height,
// inset from the lower-left corner by 3% of the shorter side.
const WATERMARK_MAX_WIDTH = 0.15;
const WATERMARK_MAX_HEIGHT = 0.2;
const WATERMARK_MARGIN = 0.03;

export function getWatermarkRect(
  imageWidth: number,
  imageHeight: number,
  logoWidth: number,
  logoHeight: number
): WatermarkRect {
  if (imageWidth <= 0 || imageHeight <= 0 || logoWidth <= 0 || logoHeight <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(
    (imageWidth * WATERMARK_MAX_WIDTH) / logoWidth,
    (imageHeight * WATERMARK_MAX_HEIGHT) / logoHeight
  );
  const width = Math.round(logoWidth * scale);
  const height = Math.round(logoHeight * scale);
  const margin = Math.round(Math.min(imageWidth, imageHeight) * WATERMARK_MARGIN);
  return { x: margin, y: imageHeight - height - margin, width, height };
}

// Read at click time rather than via useSearchParams, so callers don't need a
// Suspense boundary.
export function isWatermarkExempt(): boolean {
  return new URLSearchParams(window.location.search).get("from") === "admin";
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export async function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): Promise<void> {
  const logo = await loadImage(WATERMARK_SRC);
  const rect = getWatermarkRect(width, height, logo.naturalWidth, logo.naturalHeight);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = WATERMARK_OPACITY;
  ctx.drawImage(logo, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

// Returns the image at `src` (e.g. a data URL) as a PNG, watermarked unless
// the viewer came from /admin.
export async function toWatermarkedPng(src: string): Promise<Blob> {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(image, 0, 0);
  if (!isWatermarkExempt()) {
    await drawWatermark(ctx, canvas.width, canvas.height);
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Unable to create PNG"))),
      "image/png"
    );
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
