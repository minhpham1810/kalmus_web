from pathlib import Path
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import RESULTS_DIR, create_db, delete_job, find_existing_analysis, upsert_job, update_film


def make_job(title: str, imdb_id: str | None, edition: str | None = None) -> dict:
    return {
        "config": {"email": "a@b.c", "barcode_type": "Color", "frame_type": "Whole_frame", "color_metric": "Average", "edition": edition},
        "submittedAt": "2026-01-01T00:00:00Z",
        "movie": {"title": title, "imdb_id": imdb_id, "raw": {"Director": "Wong Kar-wai", "Type": "movie"}},
    }


def count(db: Path, sql: str) -> int:
    con = sqlite3.connect(db)
    try:
        return con.execute(sql).fetchone()[0]
    finally:
        con.close()


def test_jobs_share_film_and_orphans_are_removed(tmp_path):
    db = tmp_path / "films.db"
    create_db(db)

    upsert_job("job1", make_job("Chungking Express", "tt0109424"), {}, str(RESULTS_DIR / "job1" / "barcode.json"), str(RESULTS_DIR / "job1" / "poster.jpg"), db)
    con = sqlite3.connect(db)
    (film_id,) = con.execute("SELECT film_id FROM analyzed_files WHERE job_id = 'job1'").fetchone()
    con.close()
    update_film(film_id, "Edited Title", None, "movie", 102, db_path=db)

    # Same IMDb ID reuses the film and keeps the manual edit
    upsert_job("job2", make_job("Chungking Express (Criterion)", "tt0109424"), {}, str(RESULTS_DIR / "job2" / "barcode.json"), None, db)
    assert count(db, "SELECT COUNT(*) FROM films") == 1
    assert count(db, "SELECT COUNT(*) FROM films WHERE title = 'Edited Title' AND poster = 'job1/poster.jpg'") == 1
    assert count(db, "SELECT COUNT(*) FROM films_search WHERE films_search MATCH 'edited'") == 1
    assert count(db, "SELECT COUNT(*) FROM analyzed_files WHERE json = 'job2/barcode.json'") == 1

    # Films without an IMDb ID are never shared
    upsert_job("job3", make_job("Home Video", None), {}, str(RESULTS_DIR / "job3" / "barcode.json"), None, db)
    upsert_job("job4", make_job("Home Video", ""), {}, str(RESULTS_DIR / "job4" / "barcode.json"), None, db)
    assert count(db, "SELECT COUNT(*) FROM films") == 3

    # Film survives until its last job is deleted, then links and search row go with it
    delete_job("job1", db)
    assert count(db, f"SELECT COUNT(*) FROM films WHERE id = {film_id}") == 1
    delete_job("job2", db)
    assert count(db, f"SELECT COUNT(*) FROM films WHERE id = {film_id}") == 0
    assert count(db, f"SELECT COUNT(*) FROM film_directors WHERE film_id = {film_id}") == 0
    assert count(db, f"SELECT COUNT(*) FROM films_search WHERE film_id = {film_id}") == 0


def test_editions_share_film_and_are_searchable(tmp_path):
    db = tmp_path / "films.db"
    create_db(db)
    barcode = lambda job: str(RESULTS_DIR / job / "barcode.json")
    search = lambda term: count(db, f"SELECT COUNT(*) FROM films_search WHERE films_search MATCH '{term}'")

    upsert_job("orig", make_job("Chungking Express", "tt0109424"), {}, barcode("orig"), None, db)
    assert find_existing_analysis("tt0109424", "color", "whole_frame", "average", None, db) == "orig"
    assert find_existing_analysis("tt0109424", "color", "whole_frame", "average", "Criterion Color", db) is None

    upsert_job("crit", make_job("Chungking Express", "tt0109424", " Criterion Color "), {}, barcode("crit"), None, db)
    assert count(db, "SELECT COUNT(*) FROM films") == 1
    assert count(db, "SELECT COUNT(*) FROM analyzed_files WHERE edition = 'Criterion Color'") == 1
    assert find_existing_analysis("tt0109424", "color", "whole_frame", "average", "criterion color", db) == "crit"
    assert search("criterion") == 1 and search("edition: criterion") == 1

    # Search follows edition edits and deletes (triggers)
    con = sqlite3.connect(db)
    con.execute("UPDATE analyzed_files SET edition = 'Restored' WHERE job_id = 'crit'")
    con.commit()
    con.close()
    assert search("criterion") == 0 and search("restored") == 1
    delete_job("crit", db)
    assert search("restored") == 0 and search("chungking") == 1
