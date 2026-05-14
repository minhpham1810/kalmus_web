import requests
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

OMDB_KEY = os.getenv("OMDB_KEY")
OMDB_URL = "https://www.omdbapi.com/"

def list_recent_jobs(count: int = 10):
    jobs = get_recent_jobs(count)
    print("Job ID | Title | Date | Uploader")
    for job in jobs:
        print(f"{job['job_id']} | {job['title']} | {job['job']['process_date']} | {job['job']['uploader']}")

def format_date_safe(date_str: str) -> str | None:
    try:
        return datetime.strptime(date_str, "%d %b %Y").strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return date_str  # Return original if parsing fails

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

def edit_job(job_id: str):
    film = get_job(job_id)
    if not film:
        print("Film not found")
        return
    
    old_title, old_imdb_id, old_released, old_type, old_runtime = film["title"], film["imdb_id"], film["released"], film["type"], film["runtime_minutes"]
    new_title, new_imdb, new_released, new_type, new_runtime = old_title, old_imdb_id, old_released, old_type, old_runtime
    print(f"Editing: {old_title}", ({old_imdb_id}) if old_imdb_id else ""))

    use_imdb = input("Do you want to load data using an IMDb ID? (y/n): ").strip().lower() == "y"

    if use_imdb:
        new_imdb = input("Enter IMDb ID: ").strip()

        url = f"{OMDB_URL}?i={new_imdb}&apikey={OMDB_KEY}"
        try:
            response = requests.get(url)
            if response.status_code == 200:
                data = response.json()
                new_title = data.get("Title", old_title)
                new_imdb = data.get("imdbID", old_imdb_id)
                new_released = format_date_safe(data.get("Released", old_released))
                new_type = data.get("Type", old_type)
                new_runtime = data.get("Runtime", old_runtime).replace(" min", "")
            else:
                print(f"IMDb error: {data.get('Error')}")
        except Exception as e:
            print(f"Error fetching IMDb data: {e}")

    new_title = input(f"New title (leave blank to keep '{new_title}'): ").strip() or new_title
    new_imdb = old_imdb_id  # IMDb ID is not editable manually
    new_released = format_date_safe(input(f"New release date (leave blank to keep '{new_released}'): ").strip() or new_released)
    new_type = input(f"New type (leave blank to keep '{new_type}'): ").strip() or new_type
    new_runtime = input(f"New runtime in minutes (leave blank to keep '{new_runtime}'): ").strip() or new_runtime

    film_metadata = get_job_metadata(job_id)
    film_metadata["movie"].update({
        "title": new_title,
        "imdb_id": new_imdb
    })
    if "raw" not in film_metadata["movie"]:
        film_metadata["movie"]["raw"] = {}
    film_metadata["movie"]["raw"].update({
        "Released": new_released,
        "Type": new_type,
        "Runtime": f"{new_runtime} min" if new_runtime else ""
    })
    upload_metadata = get_upload_metadata(job_id)

    upsert_job(job_id, film_metadata, upload_metadata, film["job"]["json"], film["job"]["poster"])

    print("Film updated!")

def main():
    conn = connect_db()
    cursor = conn.cursor()

    while True:
        print("\n--- Film DB Editor ---")
        print("1. List recently processed films")
        print("2. Edit film by job ID")
        print("3. Exit")
        choice = input("Choose an option: ").strip()

        if choice == "1":
            list_recent_films(cursor)
        elif choice == "2":
            job_id = input("Enter job ID to edit: ").strip()
            edit_film(cursor, job_id)
            conn.commit()
        elif choice == "3":
            break
        else:
            print("Invalid choice")

    conn.close()

if __name__ == "__main__":
    main()