"""
Film map: each average, whole-frame color barcode becomes a point (primary hue, lightness), plus the
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
    mean_hue: angle of the mean OKLab (a, b), i.e. the overall color cast, in degrees
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


HUE_FRAME = "map_frame.webp"  # the film's dominant-hue frame, shown when it's hovered on the map


def hue_frame(rgb, primary_hue: float, candidates: list[int]) -> int:
    """Of the candidate frame indices, the most saturated within 15 degrees of primary_hue, else the nearest in hue."""
    rgb = np.asarray(rgb, dtype=np.float64).reshape(-1, 3)[candidates]
    lab = srgb_to_oklab(rgb / 255.0 if rgb.max() > 1.0 else rgb)
    chroma = np.hypot(lab[:, 1], lab[:, 2])
    off = np.abs((np.degrees(np.arctan2(lab[:, 2], lab[:, 1])) - primary_hue + 180) % 360 - 180)
    return candidates[int(np.argmax(np.where(off <= 15, chroma, -off)))]


def save_hue_frame(job_dir: Path, barcode: dict, primary_hue: float) -> None:
    """Crop the dominant-hue frame out of the job's thumbnail sheets into HUE_FRAME. Only thumbnailed frames qualify."""
    from PIL import Image

    manifest = json.loads((job_dir / "thumbnails.json").read_text())
    if not manifest.get("enabled"):
        return
    colors = barcode["colors"]
    skip, rate = barcode.get("skip_over", 0), max(1, barcode.get("sampled_frame_rate", 1))
    # Thumbnails are keyed by source frame; colors[i] is source frame skip + i * rate
    by_index = {round((t["frame_index"] - skip) / rate): t for t in manifest["thumbnails"]}
    candidates = [i for i in by_index if 0 <= i < len(colors)]
    if not candidates:
        return
    t = by_index[hue_frame(colors, primary_hue, candidates)]
    sheet = next(s for s in manifest["sheets"] if s["index"] == t["sheet_index"])
    with Image.open(job_dir / sheet["filename"]) as im:
        im.crop((t["x"], t["y"], t["x"] + t["width"], t["y"] + t["height"])).save(job_dir / HUE_FRAME, quality=80)


def map_point(json_loc: str, barcode_type: str, metric: str, frame_type: str) -> dict | None:
    """Film-map features of an average, whole-frame color barcode; None for other barcodes.
    Also saves the dominant-hue frame next to the barcode when the job has thumbnails."""
    if (barcode_type.lower(), metric.lower(), frame_type.lower()) != ("color", "average", "whole_frame") or not Path(json_loc).exists():
        return None
    barcode = json.loads(Path(json_loc).read_text())
    if not barcode.get("colors"):
        return None
    features = map_features(barcode["colors"])
    if features["primary_hue"] is not None:
        try:
            save_hue_frame(Path(json_loc).parent, barcode, features["primary_hue"])
        except (OSError, KeyError, ValueError, StopIteration) as e:  # the frame is optional; the map point still counts
            print(f"No dominant-hue frame for {json_loc}: {e}")
    return features


def film_map_row(job_id: str, f: dict) -> tuple:
    """Parameters for INSERT_FILM_MAP."""
    hist = json.dumps(f["hue_hist"]) if f["hue_hist"] else None
    return (job_id, f["primary_hue"], f["lightness"], f["mean_hue"], hist)


# One point per film and edition (case-insensitive, as find_existing_analysis): skipped when another job of the
# same film and edition is already on the map. Needs the job's analyzed_files row to exist first.
INSERT_FILM_MAP = """
INSERT OR REPLACE INTO film_map (job_id, primary_hue, lightness, mean_hue, hue_hist)
SELECT ?1, ?2, ?3, ?4, ?5
WHERE NOT EXISTS (
    SELECT 1 FROM film_map m
    JOIN analyzed_files other ON other.job_id = m.job_id
    JOIN analyzed_files new ON new.job_id = ?1
    WHERE m.job_id != ?1
        AND other.film_id = new.film_id
        AND LOWER(COALESCE(other.edition, '')) = LOWER(COALESCE(new.edition, ''))
)
"""


if __name__ == "__main__":
    # Self-check: a teal-and-orange film peaks at one hue but its mean sits between, and B/W has no hue
    teal_orange = np.array([[230, 120, 40]] * 60 + [[30, 140, 150]] * 40)
    f = map_features(teal_orange)
    assert abs(sum(f["hue_hist"]) - 1) < 1e-3 and sum(x > 0 for x in f["hue_hist"]) == 2
    assert f["primary_hue"] != f["mean_hue"]
    assert map_features(np.full((10, 3), 128))["hue_hist"] is None
    # The dominant-hue frame is the most saturated orange one, from the candidates only
    frames = [[200, 120, 60], [230, 120, 40], [30, 140, 150], [250, 110, 20]]
    orange = map_features(frames[1:2])["primary_hue"]
    assert hue_frame(frames, orange, [0, 1, 2]) == 1 and hue_frame(frames, orange, [0, 1, 2, 3]) == 3
    print("ok", f)
