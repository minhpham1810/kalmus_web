from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import FilmsDb
import json

import numpy as np

from film_compare import N_HUE_BINS, srgb_to_oklab
from film_map import INSERT_FILM_MAP, hue_frame_candidates, map_point, recompute_film


def make_job(edition: str | None) -> dict:
    return {
        "config": {"email": "a@b.c", "barcode_type": "Color", "frame_type": "Whole_frame", "color_metric": "Average", "edition": edition},
        "submittedAt": "2026-01-01T00:00:00Z",
        "movie": {"title": "Chungking Express", "imdb_id": "tt0109424", "raw": {"Type": "movie"}},
    }


def test_film_map_has_one_point_per_film_and_edition(tmp_path, monkeypatch):
    monkeypatch.setenv("RESULTS_DIR", str(tmp_path))
    db = FilmsDb(tmp_path / "films.db")
    db.create_db()
    for job, edition in (("a", None), ("b", None), ("c", "Criterion"), ("d", "criterion")):
        db.upsert_job(job, make_job(edition), {}, str(tmp_path / job / "barcode.json"), None)

    with db.connect() as con:
        for job in "abcda":  # "a" again: re-processing a job already on the map still updates it
            con.execute(INSERT_FILM_MAP, (job, 120.0, 0.5, None, None, None))
    with db.connect(readonly=True) as con:
        assert con.execute("SELECT GROUP_CONCAT(job_id) FROM film_map ORDER BY job_id").fetchone()[0] == "a,c"


def write_barcode(path, n=1000, fps=1.0):
    """First 60 and last 300 samples saturated blue, the rest orange; one sample per second."""
    colors = [[230, 120, 40]] * n
    colors[:60] = [[0, 0, 255]] * 60
    colors[-300:] = [[0, 0, 255]] * 300
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"colors": colors, "fps": fps, "film_length_in_frames": n, "sampled_frame_rate": 1, "skip_over": 0}))
    return str(path)


def blue_bin() -> int:
    lab = srgb_to_oklab(np.array([[0.0, 0.0, 1.0]]))
    return int((np.degrees(np.arctan2(lab[0, 2], lab[0, 1])) % 360) // (360 / N_HUE_BINS))


def test_map_point_ignores_credits(tmp_path):
    loc = write_barcode(tmp_path / "barcode.json")
    modern = map_point(loc, "color", "average", "whole_frame", year=2000)
    assert modern["hue_hist"][blue_bin()] == 0
    old = map_point(loc, "color", "average", "whole_frame", year=1950)
    assert old["hue_hist"][blue_bin()] > 0


def test_hue_frame_skips_margins():
    n = 1000
    barcode = {"colors": [[120, 100, 90]] * n, "fps": 1.0, "film_length_in_frames": n, "sampled_frame_rate": 1, "skip_over": 0}
    for i in (0, 10, 39, 960, 999):
        barcode["colors"][i] = [255, 0, 0]  # the most saturated frames, all in the margins
    manifest = {"enabled": True, "thumbnails": [{"frame_index": i} for i in range(n)]}
    candidates = hue_frame_candidates(barcode, manifest)
    assert candidates and min(candidates) == 40 and max(candidates) == 959


def test_upsert_uses_existing_films_year_and_override(tmp_path, monkeypatch):
    monkeypatch.setenv("RESULTS_DIR", str(tmp_path))
    db = FilmsDb(tmp_path / "films.db")
    db.create_db()
    db.upsert_job("a", make_job("Criterion"), {}, str(tmp_path / "a" / "barcode.json"), None)
    with db.connect() as con:
        con.execute("UPDATE films SET released = '1950-01-01'")
        film_id = con.execute("SELECT id FROM films").fetchone()[0]
        con.execute("INSERT INTO credits_override VALUES (?, 'criterion', 60, 700)", (film_id,))
    db.upsert_job("b", make_job("criterion"), {}, write_barcode(tmp_path / "b" / "barcode.json"), None)
    with db.connect(readonly=True) as con:
        hist = json.loads(con.execute("SELECT hue_hist FROM film_map WHERE job_id = 'b'").fetchone()[0])
    assert hist[blue_bin()] == 0


KEY = "LOWER(COALESCE(TRIM(edition), ''))"


def two_films_db(tmp_path, monkeypatch, edition="Criterion"):
    """Jobs a and b of different films, both with barcodes and both on the map."""
    monkeypatch.setenv("RESULTS_DIR", str(tmp_path))
    db = FilmsDb(tmp_path / "films.db")
    db.create_db()
    for job, imdb in (("a", "tt0109424"), ("b", "tt0118694")):
        data = make_job(edition)
        data["movie"]["imdb_id"] = imdb
        data["movie"]["title"] = imdb
        db.upsert_job(job, data, {}, write_barcode(tmp_path / job / "barcode.json"), None)
    with db.connect() as con:
        con.execute("UPDATE films SET released = '1950-01-01'")
    return db


def on_map(db):
    with db.connect(readonly=True) as con:
        return [r[0] for r in con.execute("SELECT job_id FROM film_map ORDER BY job_id")]


def film_and_key(db, job):
    with db.connect(readonly=True) as con:
        return con.execute(f"SELECT film_id, {KEY} FROM analyzed_files WHERE job_id = ?", (job,)).fetchone()


def test_recompute_after_override(tmp_path, monkeypatch):
    db = two_films_db(tmp_path, monkeypatch)
    film_id, key = film_and_key(db, "a")
    assert recompute_film(db, film_id) == 1  # now that the film's year is 1950, the credits stay in
    with db.connect(readonly=True) as con:
        before = json.loads(con.execute("SELECT hue_hist FROM film_map WHERE job_id = 'a'").fetchone()[0])
    assert before[blue_bin()] > 0
    with db.connect() as con:
        con.execute("INSERT INTO credits_override VALUES (?, ?, 60, 700)", (film_id, key))
    assert recompute_film(db, film_id) == 1
    with db.connect(readonly=True) as con:
        after = json.loads(con.execute("SELECT hue_hist FROM film_map WHERE job_id = 'a'").fetchone()[0])
    assert after[blue_bin()] == 0


def test_recompute_keeps_one_point_per_edition(tmp_path, monkeypatch):
    db = two_films_db(tmp_path, monkeypatch)
    film_a, key = film_and_key(db, "a")
    with db.connect() as con:
        con.execute("UPDATE analyzed_files SET film_id = ?, edition = 'CRITERION ' WHERE job_id = 'b'", (film_a,))
        con.execute("UPDATE analyzed_files SET process_date = '2026-01-01' WHERE job_id = 'a'")
        con.execute("UPDATE analyzed_files SET process_date = '2026-02-01' WHERE job_id = 'b'")
    assert on_map(db) == ["a", "b"]
    assert recompute_film(db, film_a, [key]) == 1
    assert on_map(db) == ["b"]  # the newer job wins
    with db.connect() as con:
        con.execute("UPDATE analyzed_files SET process_date = '2026-03-01' WHERE job_id = 'a'")
    assert recompute_film(db, film_a, [key]) == 1
    assert on_map(db) == ["b"]  # the job already on the map stays


def test_recompute_removes_point_when_key_empty(tmp_path, monkeypatch):
    db = two_films_db(tmp_path, monkeypatch)
    old_film, old_key = film_and_key(db, "a")
    new_film, _ = film_and_key(db, "b")
    with db.connect() as con:
        con.execute("UPDATE analyzed_files SET film_id = ?, edition = 'Other' WHERE job_id = 'a'", (new_film,))
    assert recompute_film(db, old_film, [old_key]) == 0
    new_key = film_and_key(db, "a")[1]
    assert recompute_film(db, new_film, [new_key]) == 1
    assert on_map(db) == ["a", "b"]  # b has the film's other edition
    # A stale row of a job with no barcode left goes too
    with db.connect() as con:
        con.execute("UPDATE analyzed_files SET json = NULL WHERE job_id = 'a'")
    assert recompute_film(db, new_film, [new_key]) == 0
    assert on_map(db) == ["b"]


def test_recompute_empty_edition_key(tmp_path, monkeypatch):
    db = two_films_db(tmp_path, monkeypatch, edition=None)
    film_id, key = film_and_key(db, "a")
    assert key == "" and recompute_film(db, film_id, [""]) == 1
