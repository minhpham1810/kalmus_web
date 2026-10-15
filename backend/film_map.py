"""
Film map: each average, whole-frame colour barcode becomes a point (primary hue, lightness).
Computed when a job is saved to the database (database.upsert_job) and stored in film_map.
"""
from pathlib import Path
import json
import sys

import numpy as np
from scipy.ndimage import gaussian_filter1d

# Same OKLab conversion as the film comparison, so map positions agree with it
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "frontend" / "lib"))
from film_compare import MONO_CHROMA, srgb_to_oklab


def primary_hue_and_lightness(rgb) -> tuple[float | None, float]:
    """Film-map coordinates from per-frame sRGB (0-255 or 0-1): (primary hue in OKLab degrees,
    median lightness 0-1). The primary hue is the peak of the chroma-weighted hue histogram, as
    in the comparison but at 1-degree resolution, lightly smoothed. Hue is None for
    black-and-white films."""
    rgb = np.asarray(rgb, dtype=np.float64).reshape(-1, 3)
    if rgb.max() > 1.0:
        rgb = rgb / 255.0
    lab = srgb_to_oklab(rgb)
    chroma = np.hypot(lab[:, 1], lab[:, 2])
    lightness = float(np.median(lab[:, 0]))
    if chroma.mean() < MONO_CHROMA:
        return None, lightness
    hue = np.degrees(np.arctan2(lab[:, 2], lab[:, 1])) % 360
    hist = np.bincount(hue.astype(int) % 360, weights=chroma, minlength=360)
    return float(np.argmax(gaussian_filter1d(hist, 5.0, mode="wrap")) + 0.5), lightness


def map_point(json_loc: str, barcode_type: str, metric: str, frame_type: str) -> tuple[float | None, float | None]:
    """Film-map coordinates of an average, whole-frame colour barcode; (None, None) for other barcodes."""
    if (barcode_type.lower(), metric.lower(), frame_type.lower()) != ("color", "average", "whole_frame") or not Path(json_loc).exists():
        return None, None
    colors = json.loads(Path(json_loc).read_text()).get("colors")
    return primary_hue_and_lightness(colors) if colors else (None, None)
