"""
WARNING
WARNING
WARNING
WARNING
WARNING

This file should only be used in the event that a full database regeneration is required. This
should only be used if things have gone terribly wrong and the database is in an unrecoverable state
and there are no good backups. This will parse all files in the /home/kalmus/kalmus/results
directory, adding all entries where there is a status.txt file with the content "SUCCESS", and
recording those with "FAILED" or "TIMEOUT" in failed_runs.

This program WILL NOT overwrite the films.db file; instead, it will create a fresh films-fix.db file
(replacing any previous films-fix.db). If
the regeneration is successful, the file may replace the films.db file. Before replacing the file,
the server should be stopped and no jobs should be running. Jobs can either be run to completion or
they can be stopped and restarted after migration.

WARNING
WARNING
WARNING
WARNING
WARNING
"""


from pathlib import Path
import json
import os
from datetime import datetime
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from database import FilmsDb
from backfill_failed_runs import backfill_failed_runs

FILMS_DB = FilmsDb().path.with_name("films-fix.db")
fix_db = FilmsDb(FILMS_DB)

def get_upload_metadata(job_id: str) -> dict:
    barcode_path = fix_db.results_dir / job_id / "barcode.json"
    try:
        with open(barcode_path, "r") as f:
            data = json.load(f)

        upload_metadata = {
            "width": data.get("high_bound_hor"),
            "height": data.get("high_bound_ver"),
            "fps": data.get("fps"),
            "frame_count": data.get("film_length_in_frames"),
        }
        return upload_metadata
    except json.JSONDecodeError:
        print("Invalid JSON:", barcode_path)
        return {}

def main():
    # Start from scratch: reusing an old films-fix.db would keep its stale film rows
    for path in (FILMS_DB, FILMS_DB.with_name(FILMS_DB.name + "-wal"), FILMS_DB.with_name(FILMS_DB.name + "-shm")):
        if path.exists():
            print(f"Removing previous {path.name}")
            path.unlink()
    fix_db.create_db()

    successful = [
        job_dir.name for job_dir in fix_db.results_dir.iterdir()
        if (job_dir / "status.txt").exists() and (job_dir / "status.txt").read_text().strip() == "SUCCESS"
    ]
    jobs = {job_id: fix_db.get_job_metadata(job_id) for job_id in successful}

    # Newest first: the first job of a film creates it, so the newest metadata wins
    first_by_imdb: dict[str, str] = {}
    for job_id, film_metadata in sorted(jobs.items(), key=lambda kv: kv[1].get("submittedAt", ""), reverse=True):
        imdb_id = film_metadata["movie"].get("imdb_id")
        if imdb_id:
            kept = first_by_imdb.setdefault(imdb_id, job_id)
            if kept != job_id and jobs[kept]["movie"] != film_metadata["movie"]:
                print(f"Film metadata differs for {imdb_id}: kept job {kept}, ignored job {job_id}")

        job_dir = fix_db.results_dir / job_id
        poster_file = str(job_dir / "poster.jpg") if (job_dir / "poster.jpg").exists() else None
        upload_metadata = get_upload_metadata(job_id)

        # Save to database (also updates the search table)
        fix_db.upsert_job(job_id, film_metadata, upload_metadata, str(job_dir / "barcode.json"), poster_file)

    print(f"Recorded {backfill_failed_runs(fix_db)} failed runs")

if __name__ == "__main__":
    main()
