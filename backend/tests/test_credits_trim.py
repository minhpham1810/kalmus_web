import sqlite3
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "frontend" / "lib"))
from credits_trim import Timeline, hue_frame_mask, job_trim_inputs, keep_slice, keep_window


def test_post_1975_drops_first_minute_and_last_five():
    assert keep_window(1976, None, 6000) == (60, 5700)


def test_1975_and_earlier_keep_whole_film():
    assert keep_window(1975, None, 6000) == (0, 6000)


def test_missing_year_is_post_1975():
    assert keep_window(None, None, 6000) == (60, 5700)


def test_override_replaces_rule():
    assert keep_window(1950, (40, 5000), 6000) == (40, 5000)
    assert keep_window(1990, (None, 5000), 6000) == (0, 5000)
    assert keep_window(1990, (40, None), 6000) == (40, 6000)
    assert keep_window(1990, (40, 9999), 6000) == (40, 6000)


def test_short_film_falls_back_to_whole():
    assert keep_window(2000, None, 300) == (0, 300)
    assert keep_window(2000, (0, 100), 6000) == (0, 6000)


def test_slice_uses_source_timeline():
    tl = Timeline(n=100, fps=1, rate=10, skip_over=50, length_frames=1050)
    assert keep_slice(tl, (100, 900)) == slice(5, 85)


def test_bad_fps_is_whole_film():
    tl = Timeline(n=100, fps=0, rate=1, skip_over=0, length_frames=0)
    assert keep_slice(tl, keep_window(2000, None, tl.length_s())) == slice(0, 100)
    big = Timeline(n=5000, fps=0, rate=1, skip_over=0, length_frames=0)
    assert keep_slice(big, keep_window(2000, None, big.length_s())) == slice(0, 5000)


def test_from_barcode_and_length_fallback():
    tl = Timeline.from_barcode({"colors": [[0, 0, 0]] * 10, "fps": 2, "sampled_frame_rate": 4, "skip_over": 2})
    assert (tl.n, tl.fps, tl.rate, tl.skip_over, tl.length_frames) == (10, 2, 4, 2, 0)
    # last sample at (2 + 9*4)/2 = 19 s, plus one frame (0.5 s)
    assert tl.length_s() == 19.5
    assert Timeline.from_barcode({}).n == 0


def test_hue_frame_mask_skips_first_and_last_4pct():
    tl = Timeline(n=100, fps=1, rate=1, skip_over=0, length_frames=100)
    mask = hue_frame_mask(tl)
    assert np.flatnonzero(mask).tolist() == list(range(4, 96))


def _db(with_override=True):
    con = sqlite3.connect(":memory:")
    con.execute("CREATE TABLE films (id INTEGER PRIMARY KEY, released_year INTEGER)")
    con.execute("CREATE TABLE analyzed_files (job_id TEXT PRIMARY KEY, film_id INTEGER, edition TEXT)")
    con.execute("INSERT INTO films VALUES (1, 1999)")
    con.execute("INSERT INTO analyzed_files VALUES ('a', 1, ' Criterion '), ('b', 1, 'Theatrical'), ('c', 1, NULL)")
    if with_override:
        con.execute(
            "CREATE TABLE credits_override (film_id INTEGER, edition_key TEXT, film_start_s REAL, credits_start_s REAL)"
        )
        con.execute("INSERT INTO credits_override VALUES (1, 'criterion', 12.0, NULL)")
    return con


def test_job_trim_inputs():
    con = _db()
    assert job_trim_inputs(con, "a") == (1999, (12.0, None))
    assert job_trim_inputs(con, "b") == (1999, None)
    assert job_trim_inputs(con, "c") == (1999, None)
    assert job_trim_inputs(_db(with_override=False), "a") == (1999, None)
