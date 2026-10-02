"""
One-off: export manual film edits from the current (job-keyed) films.db that a rebuild from
metadata.json would lose. Run this BEFORE switching to the film-keyed schema.

Writes {job_id: {"film": title, "changes": {field: db_value}}} containing only the fields whose
database value differs from what upsert_job would derive from that job's metadata.json.

Usage: python export_edits.py [output.json]   (default: film_edits.json next to films.db)
"""

from pathlib import Path
from datetime import datetime
import json
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from database import films_db, RESULTS_DIR

# DB entity table -> OMDb raw key
LISTS = {
    "genres": "Genre",
    "directors": "Director",
    "writers": "Writer",
    "actors": "Actors",
    "languages": "Language",
    "countries": "Country",
}


def expected_from_metadata(job_id: str) -> dict:
    """Mirror of upsert_job's parsing, so a rebuild would produce exactly these values."""
    metadata = json.loads((RESULTS_DIR / job_id / "metadata.json").read_text(encoding="utf-8"))
    movie = metadata.get("movie", {})
    raw = movie.get("raw") or {}

    runtime_raw = (raw.get("Runtime") or "").split()
    runtime = int(runtime_raw[0]) if runtime_raw and runtime_raw[0].isdigit() else None

    released = ""
    released_raw = raw.get("Released")
    if released_raw and released_raw != "N/A":
        try:
            released = str(datetime.strptime(released_raw, "%d %b %Y").date())
        except ValueError:
            released = released_raw

    expected = {
        "title": movie.get("title"),
        "imdb_id": movie.get("imdb_id"),
        "released": released,
        "type": raw.get("Type") or "",
        "runtime_minutes": runtime,
    }
    for table, key in LISTS.items():
        expected[table] = sorted(v.strip() for v in (raw.get(key) or "").split(",") if v.strip() and v.strip() != "N/A")
    return expected


def actual_from_db(cur: sqlite3.Cursor, job_id: str) -> dict:
    title, imdb_id, released, type_, runtime = cur.execute(
        "SELECT title, imdb_id, released, type, runtime_minutes FROM films WHERE job_id = ?", (job_id,)
    ).fetchone()
    actual = {
        "title": title,
        "imdb_id": imdb_id,
        "released": released or "",
        "type": type_ or "",
        "runtime_minutes": runtime,
    }
    for table in LISTS:
        col = "country" if table == "countries" else table[:-1]
        rows = cur.execute(
            f"SELECT t.name FROM {table} t JOIN film_{table} j ON t.id = j.{col}_id WHERE j.job_id = ?", (job_id,)
        ).fetchall()
        actual[table] = sorted(r[0] for r in rows)
    return actual


def main():
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else films_db.with_name("film_edits.json")

    con = sqlite3.connect(f"file:{films_db}?mode=ro", uri=True)
    cur = con.cursor()
    job_ids = [r[0] for r in cur.execute("SELECT job_id FROM films").fetchall()]

    edits = {}
    for job_id in job_ids:
        try:
            expected = expected_from_metadata(job_id)
        except (OSError, json.JSONDecodeError) as e:
            print(f"Skipping {job_id}: cannot read metadata.json ({e})")
            continue
        actual = actual_from_db(cur, job_id)
        changes = {k: v for k, v in actual.items() if v != expected[k]}
        if changes:
            edits[job_id] = {"film": actual["title"], "changes": changes}

    con.close()
    out_path.write_text(json.dumps(edits, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"{len(edits)} of {len(job_ids)} jobs have edits not in metadata.json -> {out_path}")


if __name__ == "__main__":
    main()
