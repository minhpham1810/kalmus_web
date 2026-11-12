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
    f[:15, :15] = (230, 20, 20)
    c = compute_most_vivid_color(f)
    assert c[0] > 200 and c[1] < 60 and c[2] < 60


def test_more_vivid_red_beats_duller_blue():
    f = frame()
    f[:10, :10] = (230, 20, 20)
    f[50:60, 50:60] = (90, 110, 170)
    c = compute_most_vivid_color(f)
    assert c[0] > 200 and c[1] < 60 and c[2] < 60


def test_single_pixel_glint_loses_to_orange_patch():
    f = frame()
    f[0, 0] = (0, 255, 0)
    f[50:62, 50:62] = (230, 130, 30)
    c = compute_most_vivid_color(f)
    assert c[0] > 200 and 100 < c[1] < 160 and c[2] < 60


def test_uniform_grey_returns_grey():
    f = np.full((100, 100, 3), 128, dtype=np.uint8)
    assert np.allclose(compute_most_vivid_color(f), 128, atol=1)


def test_n_by_1_shape_works():
    f = frame()
    f[:15, :15] = (230, 20, 20)
    c = compute_most_vivid_color(f.reshape(-1, 1, 3))
    assert c[0] > 200 and c[1] < 60 and c[2] < 60


def test_metric_registered():
    assert "most_vivid" in ColorMetric.color_metric_types
