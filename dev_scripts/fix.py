"""
This file can be used to add entries to the database if processing was completed but there was an
error updating the database. It should not be used on the same job more than once without removing
old entries from the database.
"""


from pathlib import Path
import json
import os
import sqlite3
from datetime import datetime

films_db = Path("/home/kalmus/kalmus/app/databases/films.db")

def add_to_db(job_id, data, upload_metadata, json_loc, poster_loc):
    config = data.get("config")
    movie = data.get("movie") or {}
    raw = movie.get("raw") or {}
    
    title = movie.get("title")
    imdb_id = movie.get("imdb_id")
    type_ = raw.get("Type", "")
    runtime_raw = raw.get("Runtime", "")
    runtime = int(runtime_raw.split()[0]) if runtime_raw else None

    released_raw = raw.get("Released")
    released = ""
    if released_raw and released_raw != "N/A":
        try:
            released = datetime.strptime(released_raw, "%d %b %Y").date()
        except ValueError:
            released = ""

    genres = [g.strip() for g in movie.get("genre", "").split(",") if g and g != "N/A"]
    directors = [d.strip() for d in movie.get("director", "").split(",") if d and d != "N/A"]
    writers = [w.strip() for w in raw.get("Writer", "").split(",") if w and w != "N/A"]
    actors = [a.strip() for a in raw.get("Actors", "").split(",") if a and a != "N/A"]
    languages = [l.strip() for l in raw.get("Language", "").split(",") if l and l != "N/A"]
    countries = [c.strip() for c in raw.get("Country", "").split(",") if c and c != "N/A"]

    con = sqlite3.connect(films_db)
    cur = con.cursor()

    # Insert film record
    cur.execute(
        "INSERT INTO films (job_id, title, imdb_id, released, type, runtime_minutes) VALUES (?, ?, ?, ?, ?, ?)",
        (job_id, title, imdb_id, released, type_, runtime)
    )

    def insert_or_get_id(table, column, value):
        cur.execute(f"SELECT id FROM {table} WHERE {column} = ?", (value,))
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute(f"INSERT INTO {table} ({column}) VALUES (?)", (value,))
        return cur.lastrowid
    for genre in genres:
        genre_id = insert_or_get_id("genres", "name", genre)
        cur.execute("INSERT OR IGNORE INTO film_genres (job_id, genre_id) VALUES (?, ?)", (job_id, genre_id))
    for director in directors:
        director_id = insert_or_get_id("directors", "name", director)
        cur.execute("INSERT OR IGNORE INTO film_directors (job_id, director_id) VALUES (?, ?)", (job_id, director_id))
    for writer in writers:
        writer_id = insert_or_get_id("writers", "name", writer)
        cur.execute("INSERT OR IGNORE INTO film_writers (job_id, writer_id) VALUES (?, ?)", (job_id, writer_id))
    for actor in actors:
        actor_id = insert_or_get_id("actors", "name", actor)
        cur.execute("INSERT OR IGNORE INTO film_actors (job_id, actor_id) VALUES (?, ?)", (job_id, actor_id))
    for language in languages:
        language_id = insert_or_get_id("languages", "name", language)
        cur.execute("INSERT OR IGNORE INTO film_languages (job_id, language_id) VALUES (?, ?)", (job_id, language_id))
    for country in countries:
        country_id = insert_or_get_id("countries", "name", country)
        cur.execute("INSERT OR IGNORE INTO film_countries (job_id, country_id) VALUES (?, ?)", (job_id, country_id))

    # Insert job metadata
    cur.execute(
        "INSERT OR REPLACE INTO analyzed_files "
        "(job_id, uploader, process_date, json, poster, barcode_type, frame_type, metric, source_width, source_height, source_fps, source_frame_count) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
        (job_id,
         config.get("email", "").lower(),
         datetime.now().date(),
         json_loc,
         poster_loc,
         config.get("barcode_type").lower(),
         config.get("frame_type").lower(),
         config.get("color_metric").lower(),
         upload_metadata.get("width"),
         upload_metadata.get("height"),
         upload_metadata.get("fps"),
         upload_metadata.get("frame_count"))
    )
    
    con.commit()
    con.close()

def update_search_table(job_id):
    con = sqlite3.connect(films_db)
    cur = con.cursor()

    cur.execute(
        "INSERT INTO films_search ("
            "job_id, "
            "title, "
            "director, "
            "actor, "
            "country, "
            "genre, "
            "language, "
            "writer"
        ") "
        "SELECT "
            "f.job_id, "
            "f.title, "
            "COALESCE(d.directors, ''), "
            "COALESCE(a.actors, ''), "
            "COALESCE(c.countries, ''), "
            "COALESCE(g.genres, ''), "
            "COALESCE(l.languages, ''), "
            "COALESCE(w.writers, '') "
        "FROM films f "
        "LEFT JOIN ( "
            "SELECT fd.job_id, "
                "GROUP_CONCAT(DISTINCT d.name) AS directors "
            "FROM film_directors fd "
            "JOIN directors d ON d.id = fd.director_id "
            "GROUP BY fd.job_id "
        ") d ON d.job_id = f.job_id "
        "LEFT JOIN ( "
            "SELECT fa.job_id, "
                "GROUP_CONCAT(DISTINCT a.name) AS actors "
            "FROM film_actors fa "
            "JOIN actors a ON a.id = fa.actor_id "
            "GROUP BY fa.job_id "
        ") a ON a.job_id = f.job_id "
        "LEFT JOIN ( "
            "SELECT fc.job_id, "
                "GROUP_CONCAT(DISTINCT c.name) AS countries "
            "FROM film_countries fc "
            "JOIN countries c ON c.id = fc.country_id "
            "GROUP BY fc.job_id "
        ") c ON c.job_id = f.job_id "
        "LEFT JOIN ( "
            "SELECT fg.job_id, "
                "GROUP_CONCAT(DISTINCT g.name) AS genres "
            "FROM film_genres fg "
            "JOIN genres g ON g.id = fg.genre_id "
            "GROUP BY fg.job_id "
        ") g ON g.job_id = f.job_id "
        "LEFT JOIN ( "
            "SELECT fl.job_id, "
                "GROUP_CONCAT(DISTINCT l.name) AS languages "
            "FROM film_languages fl "
            "JOIN languages l ON l.id = fl.language_id "
            "GROUP BY fl.job_id "
        ") l ON l.job_id = f.job_id "
        "LEFT JOIN ( "
            "SELECT fw.job_id, "
                "GROUP_CONCAT(DISTINCT w.name) AS writers "
            "FROM film_writers fw "
            "JOIN writers w ON w.id = fw.writer_id "
            "GROUP BY fw.job_id "
        ") w ON w.job_id = f.job_id "
        "WHERE f.job_id = ? "
        ";", (job_id,)
    )

    con.commit()
    con.close()

def get_upload_metadata():
    return {
        "width": 1920,
        "height": 1080,
        "fps": 23.976,
        "frame_count": 0,
    }

def get_metadata(job_id):
    metadata_path = Path(f'/home/kalmus/kalmus/results/{job_id}/metadata.json')
    with metadata_path.open("r") as f:
        data = json.load(f)
    return data

job_id = input("Job ID: ")

film_metadata = get_metadata(job_id)
upload_metadata = get_upload_metadata()

# Save to database
add_to_db(job_id, film_metadata, upload_metadata, os.path.join("/home/kalmus/kalmus/results", job_id, "barcode.json"), os.path.join("/home/kalmus/kalmus/results", job_id, "poster.jpg"))

# Update search table
update_search_table(job_id)