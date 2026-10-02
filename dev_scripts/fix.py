"""
This file can be used to add entries to the database if processing was completed but there was an
error updating the database. Re-running it on a job updates that job's row; an existing film with
the same IMDb ID is reused as-is.
"""


from pathlib import Path
import json
import os
from datetime import datetime
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from database import *


def get_upload_metadata(job_id: str) -> dict:
    barcode_path = RESULTS_DIR / job_id / "barcode.json"
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
    job_id = input("Job ID: ")
    if not (RESULTS_DIR / job_id).exists():
        print("Job not found. Make sure the ID is correct and the job is in the results directory.")
        return

    film_metadata = get_job_metadata(job_id)
    upload_metadata = get_upload_metadata(job_id)
    poster = RESULTS_DIR / job_id / "poster.jpg"

    # Save to database (also updates the search table)
    upsert_job(job_id, film_metadata, upload_metadata, str(RESULTS_DIR / job_id / "barcode.json"), str(poster) if poster.exists() else None)

if __name__ == "__main__":
    main()
