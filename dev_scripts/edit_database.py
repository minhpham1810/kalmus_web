import requests
from datetime import datetime
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from database import *  # noqa: F401, F403

OMDB_KEY = require_env("OMDB_KEY")
OMDB_URL = "https://www.omdbapi.com/"


def list_recent_jobs(count: int = 10):
    jobs = get_recent_jobs(count)
    print("Job ID | Title | Date | Uploader")
    for job in jobs:
        print(
            f"{job['job_id']} | {job['title']} | {job['job']['process_date']} | {job['job']['uploader']}")


def format_date_safe(date_str: str) -> str | None:
    try:
        return datetime.strptime(date_str, "%d %b %Y").strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return date_str  # Return original if parsing fails


def edit_job(job_id: str):
    film = get_job(job_id)
    if not film:
        print("Film not found")
        return

    old_title, old_imdb_id, old_released, old_type, old_runtime = film["title"], film[
        "imdb_id"], film["released"], film["type"], film["runtime_minutes"]
    new_title, new_imdb, new_released, new_type, new_runtime = old_title, old_imdb_id, old_released, old_type, old_runtime
    print(f"Editing: {old_title}", ({old_imdb_id}) if old_imdb_id else "")

    use_imdb = input(
        "Do you want to load data using an IMDb ID? (y/n): ").strip().lower() == "y"

    if use_imdb:
        new_imdb = input("Enter IMDb ID: ").strip()

        url = f"{OMDB_URL}?i={new_imdb}&apikey={OMDB_KEY}"
        try:
            response = requests.get(url)
            if response.status_code == 200:
                data = response.json()
                new_title = data.get("Title", old_title)
                new_imdb = data.get("imdbID", old_imdb_id)
                new_released = format_date_safe(
                    data.get("Released")) or old_released
                new_type = data.get("Type", old_type)
                new_runtime = data.get(
                    "Runtime", old_runtime).replace(" min", "")
            else:
                raise Exception(f"OMDb API error: {response.status_code}")
        except Exception as e:
            print(f"Error fetching IMDb data: {e}")

    new_title = input(
        f"New title (leave blank to keep '{new_title}'): ").strip() or new_title
    new_imdb = old_imdb_id  # IMDb ID is not editable manually
    new_released = format_date_safe(input(
        f"New release date (leave blank to keep '{new_released}'): ").strip()) or new_released
    new_type = input(
        f"New type (leave blank to keep '{new_type}'): ").strip() or new_type
    new_runtime = input(
        f"New runtime in minutes (leave blank to keep '{new_runtime}'): ").strip() or new_runtime

    # Films are shared, so this edits every analysis of this film
    update_film(film["film_id"], new_title, new_released, new_type,
                int(new_runtime) if str(new_runtime).isdigit() else None)

    print("Film updated!")


def clear_screen():
    print("\033[2J\033[H\n", end="")


def main():
    def cmd_list():
        list_recent_jobs(10)

    def cmd_edit():
        job_id = input("Enter job ID to edit: ").strip()
        edit_job(job_id)

    def cmd_delete():
        job_id = input("Enter job ID to delete: ").strip()
        delete_job(job_id)
        print("Job deleted!")

    options = [
        ("List recently processed films", cmd_list),
        ("Edit film by job ID", cmd_edit),
        ("Delete film by job ID", cmd_delete),
    ]

    while True:
        clear_screen()
        print("--- Film DB Editor ---")
        for i, (desc, _) in enumerate(options, 1):
            print(f"{i}. {desc}")
        print(f"{len(options) + 1}. Exit")

        choice = input("Choose an option: ").strip()

        clear_screen()
        if choice == str(len(options) + 1):
            break
        try:
            _, cmd = options[int(choice) - 1]
            cmd()
        except (ValueError, IndexError):
            print("Invalid choice")

        input("Press Enter to continue...")


if __name__ == "__main__":
    main()
