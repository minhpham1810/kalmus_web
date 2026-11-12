import sqlite3
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "frontend" / "lib"))
import kalmus_compare


def _barcode(n=1000, fps=24.0, seed=0, **extra):
    rng = np.random.default_rng(seed)
    return SimpleNamespace(barcode_type="color", colors=rng.integers(0, 256, (n, 3)),
                           fps=fps, sampled_frame_rate=1, skip_over=0,
                           film_length_in_frames=n, **extra)


def test_film_report_applies_window(monkeypatch):
    seen = []
    real = kalmus_compare.compare
    monkeypatch.setattr(kalmus_compare, "compare", lambda a, b: (seen.extend([a, b]), real(a, b))[1])
    report = kalmus_compare.film_report(_barcode(), _barcode(seed=1), "A", "B", windows=(slice(60, 700), None))
    assert "error" not in report
    assert seen[0].duration_s == 640 / 24.0
    assert seen[1].duration_s == 1000 / 24.0


def _db(tmp_path, year):
    path = tmp_path / f"films{year}.db"
    con = sqlite3.connect(path)
    con.executescript(
        "CREATE TABLE films (id INTEGER PRIMARY KEY, released_year INTEGER);"
        "CREATE TABLE analyzed_files (job_id TEXT, film_id INTEGER, edition TEXT);"
        f"INSERT INTO films VALUES (1, {year}); INSERT INTO analyzed_files VALUES ('j', 1, '');")
    con.commit()
    con.close()
    return path


def test_barcode_window_uses_db_year(tmp_path, monkeypatch):
    b = _barcode(n=24000, fps=24.0)   # 1000 s film, 1 sample per frame
    monkeypatch.setenv("FILMS_DB_PATH", str(_db(tmp_path, 1960)))
    assert kalmus_compare.barcode_window(b, "j", ranged=False) == slice(0, 24000)
    monkeypatch.setenv("FILMS_DB_PATH", str(_db(tmp_path, 1990)))
    assert kalmus_compare.barcode_window(b, "j", ranged=False) == slice(60 * 24, 700 * 24)


def test_barcode_window_falls_back_to_auto_rule(tmp_path, monkeypatch):
    b = _barcode(n=24000, fps=24.0)
    expected = slice(60 * 24, 700 * 24)
    monkeypatch.delenv("FILMS_DB_PATH", raising=False)
    assert kalmus_compare.barcode_window(b, "j", ranged=False) == expected
    monkeypatch.setenv("FILMS_DB_PATH", str(tmp_path / "missing.db"))
    assert kalmus_compare.barcode_window(b, "j", ranged=False) == expected
    monkeypatch.setenv("FILMS_DB_PATH", str(_db(tmp_path, 1960)))
    assert kalmus_compare.barcode_window(b, "unknown-job", ranged=False) == expected


def test_barcode_window_skipped_when_user_gave_range(monkeypatch):
    monkeypatch.delenv("FILMS_DB_PATH", raising=False)
    assert kalmus_compare.barcode_window(_barcode(n=24000), "j", ranged=True) is None
