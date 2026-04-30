import sqlite3
import requests
import os
from dotenv import load_dotenv
from datetime import datetime
import json

load_dotenv()

DB_PATH = "/home/kalmus/kalmus/app/databases/films.db"
OMDB_KEY = os.getenv("OMDB_KEY")
OMDB_URL = "https://www.omdbapi.com/"

def connect_db():
    return sqlite3.connect(DB_PATH)

def list_recent_films(cursor):
    cursor.execute(
        "SELECT job_id, process_date " \
        "FROM analyzed_files " \
        "ORDER BY process_date DESC " \
        "LIMIT 10;"
    )
    rows = cursor.fetchall()
    print("Job ID | Title | Date | Uploader")
    for row in rows:
        print(f"{row[0]} | TITLE | {row[1]} | UPLOADER")

def format_date_safe(date_str: str) -> str | None:
    try:
        return datetime.strptime(date_str, "%d %b %Y").strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return date_str  # Return original if parsing fails

def edit_film(cursor, job_id):
    cursor.execute("SELECT title, imdb_id, released, type, runtime_minutes FROM films WHERE job_id = ?", (job_id,))
    film = cursor.fetchone()
    if not film:
        print("Film not found")
        return
    
    title, imdb_id, released, old_type, runtime = film
    print(f"Editing: {title} ({imdb_id})")

    use_imdb = input("Do you want to load data using an IMDb ID? (y/N): ").strip().lower() == "y"

    if use_imdb:
        new_imdb = input("Enter IMDb ID: ").strip()

        url = f"{OMDB_URL}?i={new_imdb}&apikey={OMDB_KEY}"
        try:
            response = requests.get(url)
            if response.status_code == 200:
                data = response.json()
                new_title = data.get("Title", title)
                new_imdb = data.get("imdbID", new_imdb)
                new_released = format_date_safe(data.get("Released", released))
                new_type = data.get("Type", old_type)
                new_runtime = data.get("Runtime", runtime).replace(" min", "")
            else:
                print(f"IMDb error: {data.get('Error')}")
                new_title = title
                new_runtime = runtime
        except Exception as e:
            print(f"Error fetching IMDb data: {e}")

    new_title = input(f"New title (leave blank to keep '{new_title if new_title else title}'): ").strip() or new_title if new_title else title
    new_imdb = imdb_id  # IMDb ID is not editable manually
    new_released = format_date_safe(input(f"New release date (leave blank to keep '{new_released if new_released else released}'): ").strip() or new_released if new_released else released)
    new_type = input(f"New type (leave blank to keep '{new_type if new_type else old_type}'): ").strip() or new_type if new_type else old_type
    new_runtime = input(f"New runtime in minutes (leave blank to keep '{new_runtime if new_runtime else   runtime}'): ").strip() or new_runtime if new_runtime else   runtime

    cursor.execute(
        "UPDATE films SET title = ?, imdb_id = ?, released = ?, type = ?, runtime_minutes = ? WHERE job_id = ?",
        (new_title, new_imdb, new_released, new_type, new_runtime, job_id)
    )
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