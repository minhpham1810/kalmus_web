"""
This file can be used to add entries to the database if processing was completed but there was an
error updating the database. It should not be used on the same job more than once without removing
old entries from the database.
"""


from pathlib import Path
import json
import os
from datetime import datetime
from dotenv import load_dotenv
import sys

load_dotenv()
pythonpath = os.getenv("PYTHONPATH")
if pythonpath:
    sys.path.insert(0, pythonpath)

from database import *


def get_upload_metadata(job_id: str) -> dict:
    barcode_path = Path(f'/home/kalmus/kalmus/results/{job_id}/barcode.json')
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
        print("Invalid JSON:", job_dir)
        return {}

def main():
    job_id = input("Job ID: ")
    if not Path(f'/home/kalmus/kalmus/results/{job_id}').exists():
        print("Job not found. Make sure the ID is correct and the job is in the results directory.")
        return

    film_metadata = get_job_metadata(job_id)
    upload_metadata = get_upload_metadata(job_id)

    # Save to database
    add_to_db(job_id, film_metadata, upload_metadata, os.path.join("/home/kalmus/kalmus/results", job_id, "barcode.json"), os.path.join("/home/kalmus/kalmus/results", job_id, "poster.jpg"))

    # Update search table
    update_search_table(job_id)

__name__ == "__main__":
    main()
