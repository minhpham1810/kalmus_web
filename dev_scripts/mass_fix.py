"""
WARNING
WARNING
WARNING
WARNING
WARNING

This file should only be used in the event that a full database regeneration is required. This
should only be used if things have gone terribly wrong and the database is in an unrecoverable state
and there are no good backups. This will parse all files in the /home/kalmus/kalmus/results
directory, adding all entries where there is a status.txt file with the content "SUCCESS".

This program WILL NOT overwrite the films.db file; instead, it will create a films-fix.db file. If
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
import sqlite3
from datetime import datetime
from dotenv import load_dotenv
import sys

load_dotenv()
pythonpath = os.getenv("PYTHONPATH")
if pythonpath:
    sys.path.insert(0, pythonpath)

from database import *

FILMS_DB = Path("/home/kalmus/kalmus/app/databases/films-fix.db")
RESULTS_DIR = Path("/home/kalmus/kalmus/results")

create_db(FILMS_DB)

finished_jobs = set()
for job_dir in RESULTS_DIR.iterdir():
    job_id = job_dir.name
    if job_id in finished_jobs:
        print(f"Duplicate Job ID: {job_id}")
        continue

    if not job_dir.is_dir():
        continue
    
    status_file = job_dir / "status.txt"
    if not status_file.exists():
        continue
    
    status = status_file.read_text().strip()
    if status != "SUCCESS":
        continue
    
    barcode_file = job_dir / "barcode.json"
    if (job_dir / "poster.jpg").exists():
        poster_file = str(job_dir / "poster.jpg")
    else:
        poster_file = None

    try:
        with open(barcode_file, "r") as f:
            data = json.load(f)

        upload_metadata = {
            "width": data.get("high_bound_hor"),
            "height": data.get("high_bound_ver"),
            "fps": data.get("fps"),
            "frame_count": data.get("film_length_in_frames"),
        }
    except json.JSONDecodeError:
        print("Invalid JSON:", job_dir)

    film_metadata = get_job_metadata(job_id)

    # Save to database
    add_to_db(job_id, film_metadata, upload_metadata, str(barcode_file), poster_file, FILMS_DB)

    # Update search table
    update_search_table(job_id, FILMS_DB)

    finished_jobs.add(job_id)
