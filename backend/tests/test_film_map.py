from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import FilmsDb
from film_map import INSERT_FILM_MAP


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
            con.execute(INSERT_FILM_MAP, (job, 120.0, 0.5, None, None))
    with db.connect(readonly=True) as con:
        assert con.execute("SELECT GROUP_CONCAT(job_id) FROM film_map ORDER BY job_id").fetchone()[0] == "a,c"
