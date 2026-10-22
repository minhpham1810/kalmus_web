from __future__ import annotations
import argparse
import gc
import json
import math
import sqlite3
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from PIL import Image, ImageDraw, ImageFont
import frame_scatter_layers as _fsl
from frame_scatter_layers import (
    CanvasLayout,
    LayerSelection,
    compute_canvas_layout,
    grid_slot_geometry,
    select_layered_frames,
)

DB_PATH = "/home/kalmus/kalmus/app/databases/films.db"
RESULTS_ROOT = Path("/home/kalmus/kalmus/results")
LOGO_PATH = Path(__file__).resolve().parents[1] / "frontend" / "public" / "kalmus-logo.png"

# Keep in sync with frontend/lib/watermark.ts.
WATERMARK_OPACITY = 0.9
WATERMARK_MAX_WIDTH = 0.15
WATERMARK_MAX_HEIGHT = 0.2
WATERMARK_MARGIN = 0.03
WATERMARKED_CANVAS = "canvas_watermarked.png"


def load_job_json(job_id: str) -> dict:
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.execute(
            "SELECT json FROM analyzed_files WHERE job_id = ?", (job_id,)
        )
        row = cur.fetchone()
        if row is None:
            raise ValueError(f"No analyzed_files row found for job_id={job_id}")
        json_path = Path(row[0])
        # The DB stores a path relative to the results folder
        if not json_path.is_absolute():
            json_path = RESULTS_ROOT / json_path
        if not json_path.exists():
            raise ValueError(f"json column points to missing: {json_path}")
        return json.loads(json_path.read_text())
    finally:
        conn.close()


def load_frame_colors_for_job(
    job_id: str,
) -> Tuple[List[Tuple[int, int, int]], float, int, int]:
    data = load_job_json(job_id)
    colors = [tuple(c) for c in data["colors"]]
    fps = float(data["fps"])
    skip_over = int(data.get("skip_over", 0))
    sampled_frame_rate = int(data.get("sampled_frame_rate", 1))
    return colors, fps, skip_over, sampled_frame_rate


# Make frame_scatter_layers read its colors from the DB-backed loader above
_fsl.load_frame_colors = load_frame_colors_for_job


def load_thumbnail_manifest(job_id: str) -> dict:
    manifest_path = RESULTS_ROOT / job_id / "thumbnails.json"
    if not manifest_path.exists():
        raise ValueError(f"No thumbnails.json found at {manifest_path}")
    return json.loads(manifest_path.read_text())


def sheet_path(job_id: str, sheet_index: int) -> Path:
    return RESULTS_ROOT / job_id / f"thumbnails_{sheet_index:03d}.webp"


def find_thumbnail_entry(manifest: dict, frame_index: int) -> dict:
    entries = manifest["thumbnails"]
    return min(entries, key=lambda t: abs(t["frame_index"] - frame_index))


_sheet_cache: Dict[Tuple[str, int], Image.Image] = {}


def get_sheet_image(job_id: str, sheet_index: int) -> Image.Image:
    key = (job_id, sheet_index)
    if key not in _sheet_cache:
        _sheet_cache[key] = Image.open(sheet_path(job_id, sheet_index)).convert("RGBA")
    return _sheet_cache[key]


def compose_layer_image(
    job_id: str,
    layer: LayerSelection,
    manifest: dict,
    layout: CanvasLayout,
) -> Image.Image:
    canvas = Image.new("RGBA", (layout.canvas_width, layout.canvas_height), (0, 0, 0, 0))
    disp_w = max(1, int(round(layout.display_thumb_width)))
    disp_h = max(1, int(round(layout.display_thumb_height)))

    for p in layer.frames:
        entry = find_thumbnail_entry(manifest, p.candidate.absolute_frame)
        sheet_img = get_sheet_image(job_id, entry["sheet_index"])
        dx, dy, _slot_w, _slot_h = grid_slot_geometry(p, layout)

        crop = sheet_img.crop(
            (
                entry["x"],
                entry["y"],
                entry["x"] + entry["width"],
                entry["y"] + entry["height"],
            )
        ).resize((disp_w, disp_h), Image.LANCZOS)

        cx = layout.hue_to_x(p.candidate.hue)
        cy = layout.lightness_to_y(p.candidate.lightness)
        paste_x = int(cx + dx - disp_w / 2)
        paste_y = int(cy + dy - disp_h / 2)
        paste_x = max(0, min(paste_x, layout.canvas_width - disp_w))
        paste_y = max(0, min(paste_y, layout.canvas_height - disp_h))

        canvas.alpha_composite(crop, (paste_x, paste_y))

    return canvas


def draw_axis_layer(layout: CanvasLayout) -> Image.Image:
    canvas = Image.new("RGBA", (layout.canvas_width, layout.canvas_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    try:
        font = ImageFont.truetype("DejaVuSansMono.ttf", 16)
    except OSError:
        font = ImageFont.load_default()

    grid_color = (140, 140, 140, 90)
    text_color = (170, 170, 170, 220)

    plot_left = layout.margin_left
    plot_right = layout.canvas_width - layout.margin_right
    plot_top = layout.margin_top
    plot_bottom = layout.canvas_height - layout.margin_bottom

    for hue in [0, 60, 120, 180, 240, 300, 360]:
        x = layout.hue_to_x(hue)
        draw.line([(x, plot_top), (x, plot_bottom)], fill=grid_color, width=3)
        draw.text((x - 16, plot_bottom + 12), str(hue), font=font, fill=text_color)
    draw.text(
        ((plot_left + plot_right) / 2 - 90, layout.canvas_height - 50),
        "Hue (0 - 360 deg)",
        font=font,
        fill=text_color,
    )

    for light in [0, 0.25, 0.5, 0.75, 1.0]:
        y = layout.lightness_to_y(light)
        draw.line([(plot_left, y), (plot_right, y)], fill=grid_color, width=3)
        draw.text((plot_left - 110, y - 14), f"{light:.2f}", font=font, fill=text_color)

    return canvas


def _js_round(value: float) -> int:
    # Match JavaScript's Math.round (half up), not Python's banker's rounding.
    return int(math.floor(value + 0.5))


def watermark_rect(
    image_width: int, image_height: int, logo_width: int, logo_height: int
) -> Tuple[int, int, int, int]:
    """Lower-left (x, y, width, height) box for the logo, as in the frontend."""
    scale = min(
        image_width * WATERMARK_MAX_WIDTH / logo_width,
        image_height * WATERMARK_MAX_HEIGHT / logo_height,
    )
    width = _js_round(logo_width * scale)
    height = _js_round(logo_height * scale)
    margin = _js_round(min(image_width, image_height) * WATERMARK_MARGIN)
    return margin, image_height - height - margin, width, height


def add_watermark(img: Image.Image, logo_path: Path = LOGO_PATH) -> None:
    """Paste the logo into img's lower-left corner, in place.

    In place on purpose: canvases are up to 50000x15000, too big to copy.
    """
    with Image.open(logo_path) as raw_logo:
        logo = raw_logo.convert("RGBA")
    x, y, w, h = watermark_rect(img.width, img.height, logo.width, logo.height)
    logo = logo.resize((w, h), Image.LANCZOS)
    mask = logo.getchannel("A").point(lambda a: int(a * WATERMARK_OPACITY))
    img.paste(logo.convert(img.mode), (x, y), mask)


def watermark_existing_canvases(job_id: str) -> None:
    """Backfill canvas_watermarked.png for a job generated before watermarking."""
    Image.MAX_IMAGE_PIXELS = None
    canvases = sorted((RESULTS_ROOT / job_id / "frame-scatter").glob("*/canvas.png"))
    if not canvases:
        print(f"No canvas.png files for job {job_id}")
        return
    for png_path in canvases:
        print(f"Watermarking {png_path}...")
        with Image.open(png_path) as img:
            img.load()
            add_watermark(img)
            img.save(png_path.with_name(WATERMARKED_CANVAS))
        gc.collect()


def tile_with_vips(png_path: Path, dzi_basename: Path) -> None:
    import pyvips

    image = pyvips.Image.new_from_file(str(png_path))
    image.dzsave(str(dzi_basename), suffix=".png", overlap=1, tile_size=256)


def process_layer(
    job_id: str,
    label: str,
    layer: LayerSelection,
    manifest: dict,
    layout: CanvasLayout,
    out_dir: Path,
    skip_tiling: bool,
) -> None:
    print(f"Compositing '{label}' ({len(layer.frames)} frames)...")
    img = compose_layer_image(job_id, layer, manifest, layout)

    layer_dir = out_dir / label
    layer_dir.mkdir(parents=True, exist_ok=True)
    png_path = layer_dir / "canvas.png"
    img.save(png_path)
    add_watermark(img)
    img.save(layer_dir / WATERMARKED_CANVAS)
    del img
    gc.collect()

    if not skip_tiling:
        print(f"Tiling '{label}'...")
        tile_with_vips(png_path, layer_dir / "layer")

def run_inspect(job_id: str) -> None:
    data = load_job_json(job_id)
    print("barcode.json top-level keys:", list(data.keys()))
    print()
    print(
        "colors: type =", type(data.get("colors")).__name__,
        ", length =", len(data.get("colors", [])),
    )
    if data.get("colors"):
        print("colors[0] sample:", data["colors"][0])
    print("fps:", data.get("fps"))
    print("skip_over:", data.get("skip_over"))
    print("sampled_frame_rate:", data.get("sampled_frame_rate"))
    print()
    try:
        manifest = load_thumbnail_manifest(job_id)
        print("thumbnails.json top-level:", list(manifest.keys()))
        entries = manifest.get("thumbnails", [])
        print("thumbnails count:", len(entries))
        if entries:
            print("thumbnails[0] sample:", entries[0])
    except ValueError as e:
        print("Could not load thumbnails :", e)


def run_generate(
    job_id: str,
    skip_tiling: bool,
    saturation_override: Optional[float] = None,
    canvas_height: Optional[int] = None,
) -> None:
    if saturation_override is not None or canvas_height is not None:
        tag_parts = []
        if saturation_override is not None:
            _fsl.SATURATION_THRESHOLD = saturation_override
            _fsl.SATURATION_THRESHOLDS = [("frames", saturation_override)]
            tag_parts.append(f"sat-{saturation_override:.2f}")
        if canvas_height is not None:
            _fsl.TARGET_CANVAS_HEIGHT = canvas_height
            tag_parts.append(f"h{canvas_height}")
        tag = "-".join(tag_parts)
        out_dir = RESULTS_ROOT / job_id / "frame-scatter-compare" / tag
        print(f"Comparison run: {tag} (not prod)")
    else:
        out_dir = RESULTS_ROOT / job_id / "frame-scatter"

    out_dir.mkdir(parents=True, exist_ok=True)

    if skip_tiling:
        print("--skip-tiling set: producing flat canvas.png files only")

    print(f"Selecting frames for job {job_id}...")
    # selections = select_layered_frames(job_id)

    manifest = load_thumbnail_manifest(job_id)
    thumbnail_frames = [t["frame_index"] for t in manifest["thumbnails"]]
    selections = select_layered_frames(job_id, thumbnail_frames=thumbnail_frames)


    thumb_h = manifest.get("thumbnail_height", 200)
    thumb_w = manifest["thumbnails"][0]["width"] if manifest.get("thumbnails") else 356

    layout = compute_canvas_layout(thumbnail_width=thumb_w, thumbnail_height=thumb_h)
    print(f"Canvas size: {layout.canvas_width} x {layout.canvas_height}")
    print(
        f"Display thumb size: {layout.display_thumb_width:.0f} x "
        f"{layout.display_thumb_height:.0f}"
    )

    for label, layer in selections.items():
        process_layer(job_id, label, layer, manifest, layout, out_dir, skip_tiling)

    print("Releasing sheet cache before axis generation...")
    _sheet_cache.clear()
    gc.collect()

    print("Drawing axis")
    axis_img = draw_axis_layer(layout)
    axis_dir = out_dir / "axis"
    axis_dir.mkdir(parents=True, exist_ok=True)
    axis_png = axis_dir / "grid.png"
    axis_img.save(axis_png)
    if not skip_tiling:
        tile_with_vips(axis_png, axis_dir / "layer")

    print(f"output path: {out_dir}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("job_id")
    parser.add_argument("--inspect", action="store_true")
    parser.add_argument("--skip-tiling", action="store_true")
    parser.add_argument(
        "--watermark-only",
        action="store_true",
        help="Only write canvas_watermarked.png next to existing canvas.png files.",
    )
    parser.add_argument(
        "--saturation",
        type=float,
        default=None,
        help="Override saturation threshold for this run only (comparison runs).",
    )
    parser.add_argument(
        "--height",
        type=int,
        default=None,
        help="Override canvas height in pixels for this run only (comparison runs).",
    )
    args = parser.parse_args()

    if args.inspect:
        run_inspect(args.job_id)
        sys.exit(0)

    if args.watermark_only:
        watermark_existing_canvases(args.job_id)
        sys.exit(0)

    run_generate(args.job_id, args.skip_tiling, args.saturation, args.height)


if __name__ == "__main__":
    main()