"""
Film map: each average, whole-frame colour barcode becomes a point (primary hue, lightness), plus the
whole-palette features (mean hue, hue histogram) the palette-aware map variants use.
Computed when a job is saved to the database (database.upsert_job) and stored in film_map.
"""
from pathlib import Path
import json
import sys

import numpy as np
from scipy.ndimage import gaussian_filter1d

# Same OKLab conversion and hue bins as the film comparison, so map positions agree with it
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "frontend" / "lib"))
from film_compare import MONO_CHROMA, N_HUE_BINS, srgb_to_oklab


def map_features(rgb) -> dict:
    """Film-map features from per-frame sRGB (0-255 or 0-1):
    primary_hue: peak of the chroma-weighted hue histogram, OKLab degrees, 1-degree resolution, lightly smoothed
    mean_hue: angle of the mean OKLab (a, b), i.e. the overall colour cast, in degrees
    hue_hist: chroma-weighted N_HUE_BINS histogram summing to 1, as in the comparison
    lightness: median OKLab lightness, 0-1
    Hue features are None for black-and-white films."""
    rgb = np.asarray(rgb, dtype=np.float64).reshape(-1, 3)
    if rgb.max() > 1.0:
        rgb = rgb / 255.0
    lab = srgb_to_oklab(rgb)
    chroma = np.hypot(lab[:, 1], lab[:, 2])
    lightness = float(np.median(lab[:, 0]))
    if chroma.mean() < MONO_CHROMA:
        return {"primary_hue": None, "mean_hue": None, "hue_hist": None, "lightness": lightness}
    hue = np.degrees(np.arctan2(lab[:, 2], lab[:, 1])) % 360
    fine = np.bincount(hue.astype(int) % 360, weights=chroma, minlength=360)
    coarse = np.bincount((hue // (360 / N_HUE_BINS)).astype(int) % N_HUE_BINS, weights=chroma, minlength=N_HUE_BINS)
    return {
        "primary_hue": float(np.argmax(gaussian_filter1d(fine, 5.0, mode="wrap")) + 0.5),
        "mean_hue": float(np.degrees(np.arctan2(lab[:, 2].mean(), lab[:, 1].mean())) % 360),
        "hue_hist": [round(float(x), 5) for x in coarse / coarse.sum()],
        "lightness": lightness,
    }


def map_point(json_loc: str, barcode_type: str, metric: str, frame_type: str) -> dict | None:
    """Film-map features of an average, whole-frame colour barcode; None for other barcodes."""
    if (barcode_type.lower(), metric.lower(), frame_type.lower()) != ("color", "average", "whole_frame") or not Path(json_loc).exists():
        return None
    colors = json.loads(Path(json_loc).read_text()).get("colors")
    return map_features(colors) if colors else None


def film_map_row(job_id: str, f: dict) -> tuple:
    """Parameters for INSERT_FILM_MAP."""
    return (job_id, f["primary_hue"], f["lightness"], f["mean_hue"], json.dumps(f["hue_hist"]) if f["hue_hist"] else None)


INSERT_FILM_MAP = "INSERT OR REPLACE INTO film_map (job_id, primary_hue, lightness, mean_hue, hue_hist) VALUES (?, ?, ?, ?, ?)"


if __name__ == "__main__":
    # Self-check: a teal-and-orange film peaks at one hue but its mean sits between, and B/W has no hue
    teal_orange = np.array([[230, 120, 40]] * 60 + [[30, 140, 150]] * 40)
    f = map_features(teal_orange)
    assert abs(sum(f["hue_hist"]) - 1) < 1e-3 and sum(x > 0 for x in f["hue_hist"]) == 2
    assert f["primary_hue"] != f["mean_hue"]
    assert map_features(np.full((10, 3), 128))["hue_hist"] is None
    print("ok", f)
