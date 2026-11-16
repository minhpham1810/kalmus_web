from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from kalmus.metrics.color_metrics.ColorMetric import ColorMetric
from kalmus.utils.artist import compute_most_vivid_color

BEIGE = (200, 185, 160)


def frame():
    f = np.empty((100, 100, 3), dtype=np.uint8)
    f[:] = BEIGE
    return f


def test_red_patch_wins_over_beige():
    f = frame()
    f[:20, :20] = (230, 20, 20)
    c = compute_most_vivid_color(f)
    assert c[0] > 200 and c[1] < 60 and c[2] < 60


def test_more_vivid_red_beats_duller_blue():
    f = frame()
    f[:20, :20] = (230, 20, 20)
    f[50:70, 50:70] = (90, 110, 170)
    c = compute_most_vivid_color(f)
    assert c[0] > 200 and c[1] < 60 and c[2] < 60


def test_single_pixel_glint_loses_to_orange_patch():
    f = frame()
    f[0, 0] = (0, 255, 0)
    f[50:70, 50:70] = (230, 130, 30)
    c = compute_most_vivid_color(f)
    assert c[0] > 200 and 100 < c[1] < 160 and c[2] < 60


def test_uniform_grey_returns_grey():
    f = np.full((100, 100, 3), 128, dtype=np.uint8)
    assert np.allclose(compute_most_vivid_color(f), 128, atol=1)


def test_n_by_1_shape_works():
    f = frame()
    f[:20, :20] = (230, 20, 20)
    c = compute_most_vivid_color(f.reshape(-1, 1, 3))
    assert c[0] > 200 and c[1] < 60 and c[2] < 60


def big_frame():
    f = np.empty((1080, 1920, 3), dtype=np.uint8)
    f[:] = BEIGE
    f[:300, :300] = (230, 20, 20)
    return f


def test_large_frame_matches_small():
    c = compute_most_vivid_color(big_frame())
    assert c[0] > 200 and c[1] < 60 and c[2] < 60


def test_large_masked_shape_works():
    c = compute_most_vivid_color(big_frame().reshape(-1, 1, 3))
    assert c[0] > 200 and c[1] < 60 and c[2] < 60


def test_small_patch_falls_back_to_average():
    f = frame()
    f[:10, :10] = (230, 20, 20)
    assert np.allclose(compute_most_vivid_color(f), f.reshape(-1, 3).mean(axis=0), atol=1)


def test_dark_patch_falls_back_to_average():
    f = frame()
    f[:30, :30] = (0, 0, 90)
    assert np.allclose(compute_most_vivid_color(f), f.reshape(-1, 3).mean(axis=0), atol=1)


def test_next_group_wins_when_first_fails():
    f = frame()
    f[:30, :30] = (0, 0, 90)
    f[60:80, 60:80] = (230, 20, 20)
    c = compute_most_vivid_color(f, top_ratio=0.15)
    assert c[0] > 200 and c[1] < 60 and c[2] < 60


def test_thresholds_off_keeps_old_behavior():
    f = frame()
    f[:15, :15] = (230, 20, 20)
    c = compute_most_vivid_color(f, min_area_ratio=0, min_lightness=0)
    assert c[0] > 200 and c[1] < 60 and c[2] < 60


def test_black_frame_returns_black():
    c = compute_most_vivid_color(np.zeros((100, 100, 3), dtype=np.uint8))
    assert np.all(c <= 1)


def test_metric_registered():
    assert "most_vivid" in ColorMetric.color_metric_types
