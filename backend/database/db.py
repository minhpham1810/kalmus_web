import sqlite3
from pathlib import Path
import json
from datetime import datetime


films_db = Path("/home/kalmus/kalmus/app/databases/films.db")


class DbConnection:
    def __init__(self, readonly: bool = False, db_path: Path = films_db):
        self.readonly = readonly
        self.db_path = db_path
        self.con = None

    def __enter__(self) -> sqlite3.Connection:
        self.con = _connect(self.db_path)
        return self.con

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.con:
            _close(self.con)


# Basic functions, used for updating database from uploads to frontend
def _connect(db_path: Path = films_db) -> sqlite3.Connection:
    con = sqlite3.connect(db_path)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA busy_timeout=5000")
    return con

def _close(con: sqlite3.Connection):
    con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    con.close()

def _get_con(con: sqlite3.Connection | None, db_path: Path) -> tuple[sqlite3.Connection, bool]:
    if con is not None:
        return con, False
    return _connect(db_path), True

def _maybe_close(con: sqlite3.Connection, owned: bool):
    if owned:
        _close(con)

def create_db(db_path: Path = films_db, con: sqlite3.Connection | None = None):
    con, owned = _get_con(con, db_path)
    cur = con.cursor()

    # Main table, contains references to other tables
    cur.execute(
        "CREATE TABLE IF NOT EXISTS films ("
        "job_id TEXT PRIMARY KEY, "
        "title TEXT NOT NULL, "
        "imdb_id TEXT, "
        "released DATE, "
        "released_year INTEGER GENERATED ALWAYS AS (CAST(strftime('%Y', released) AS INTEGER)) STORED, "
        "type TEXT, "
        "runtime_minutes INTEGER"
        ");"
    )

    # Entity tables
    cur.execute(
        "CREATE TABLE IF NOT EXISTS genres ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "name TEXT NOT NULL"
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS directors ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "name TEXT NOT NULL"
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS writers ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "name TEXT NOT NULL"
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS actors ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "name TEXT NOT NULL"
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS languages ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "name TEXT NOT NULL"
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS countries ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "name TEXT NOT NULL"
        ");"
    )

    # Many-to-many mappings
    cur.execute(
        "CREATE TABLE IF NOT EXISTS film_genres ("
        "job_id TEXT, "
        "genre_id INTEGER, "
        "PRIMARY KEY (job_id, genre_id), "
        "FOREIGN KEY (job_id) REFERENCES films(job_id), "
        "FOREIGN KEY (genre_id) REFERENCES genres(id)"
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS film_directors ("
        "job_id TEXT, "
        "director_id INTEGER, "
        "PRIMARY KEY (job_id, director_id), "
        "FOREIGN KEY (job_id) REFERENCES films(job_id), "
        "FOREIGN KEY (director_id) REFERENCES directors(id)"
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS film_writers ("
        "job_id TEXT, "
        "writer_id INTEGER, "
        "PRIMARY KEY (job_id, writer_id), "
        "FOREIGN KEY (job_id) REFERENCES films(job_id), "
        "FOREIGN KEY (writer_id) REFERENCES writers(id)"
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS film_actors ("
        "job_id TEXT, "
        "actor_id INTEGER, "
        "PRIMARY KEY (job_id, actor_id), "
        "FOREIGN KEY (job_id) REFERENCES films(job_id), "
        "FOREIGN KEY (actor_id) REFERENCES actors(id)"
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS film_languages ("
        "job_id TEXT, "
        "language_id INTEGER, "
        "PRIMARY KEY (job_id, language_id), "
        "FOREIGN KEY (job_id) REFERENCES films(job_id), "
        "FOREIGN KEY (language_id) REFERENCES languages(id)"
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS film_countries ("
        "job_id TEXT, "
        "country_id INTEGER, "
        "PRIMARY KEY (job_id, country_id), "
        "FOREIGN KEY (job_id) REFERENCES films(job_id), "
        "FOREIGN KEY (country_id) REFERENCES countries(id)"
        ");"
    )

    # Analyzed films
    cur.execute(
        "CREATE TABLE IF NOT EXISTS analyzed_files ("
        "job_id TEXT PRIMARY KEY, "
        "uploader TEXT, "
        "process_date DATE NOT NULL, "
        "json TEXT, "
        "poster TEXT, "
        "barcode_type TEXT NOT NULL, "
        "frame_type TEXT NOT NULL, "
        "metric TEXT NOT NULL, "
        "source_width INTEGER, "
        "source_height INTEGER, "
        "source_fps REAL, "
        "source_frame_count INTEGER, "
        "FOREIGN KEY (job_id) REFERENCES films(job_id)"
        ");"
    )

    # Search table
    cur.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS films_search USING fts5 ("
        "job_id UNINDEXED, "
        "title, "
        "director, "
        "actor, "
        "country, "
        "genre, "
        "language, "
        "writer, "
        "tokenize = \"unicode61 remove_diacritics 2 \""
        ");"
    )

    con.commit()
    _maybe_close(con, owned)

def find_existing_analysis(imdb_id: str, barcode_type: str, frame_type: str, metric: str, db_path: Path = films_db, con: sqlite3.Connection | None = None) -> str | None:
    if imdb_id is None:
        return None

    con, owned = _get_con(con, db_path)
    cur = con.cursor()

    cur.execute(
        "SELECT films.job_id "
        "FROM analyzed_files "
        "JOIN films ON analyzed_files.job_id = films.job_id "
        "WHERE films.imdb_id = ? "
        "AND analyzed_files.barcode_type = ? "
        "AND analyzed_files.frame_type = ? "
        "AND analyzed_files.metric = ? "
        "ORDER BY analyzed_files.process_date DESC "
        "LIMIT 1"
        ";", (imdb_id, barcode_type, frame_type, metric))
    row = cur.fetchone()

    _maybe_close(con, owned)

    return row[0] if row else None

def upsert_job(job_id: str, data: dict, upload_metadata: dict, json_loc: str, poster_loc: str, db_path: Path = films_db, con: sqlite3.Connection | None = None):
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
            released = released_raw  # Keep original if parsing fails

    genres = [g.strip() for g in movie.get("genre", "").split(",") if g and g != "N/A"]
    directors = [d.strip() for d in movie.get("director", "").split(",") if d and d != "N/A"]
    writers = [w.strip() for w in raw.get("Writer", "").split(",") if w and w != "N/A"]
    actors = [a.strip() for a in raw.get("Actors", "").split(",") if a and a != "N/A"]
    languages = [l.strip() for l in raw.get("Language", "").split(",") if l and l != "N/A"]
    countries = [c.strip() for c in raw.get("Country", "").split(",") if c and c != "N/A"]

    con, owned = _get_con(con, db_path)
    cur = con.cursor()

    # Insert film record
    cur.execute(
        "INSERT OR REPLACE INTO films (title, imdb_id, released, type, runtime_minutes, job_id) VALUES (?, ?, ?, ?, ?, ?)",
        (title, imdb_id, released, type_, runtime, job_id)
    )

    # Clear and re-insert all junction table entries
    for junction_table in ("film_genres", "film_directors", "film_writers", "film_actors", "film_languages", "film_countries"):
        cur.execute(f"DELETE FROM {junction_table} WHERE job_id = ?", (job_id,))

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
         datetime.fromisoformat(data.get("submittedAt")).date() or datetime.now().date(),
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
    _maybe_close(con, owned)

def update_search_table(job_id: str, db_path: Path = films_db, con: sqlite3.Connection | None = None):
    con, owned = _get_con(con, db_path)
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
    _maybe_close(con, owned)

def get_job_metadata(job_id: str) -> dict:
    metadata_path = Path(f'/home/kalmus/kalmus/results/{job_id}/metadata.json')
    try:
        with metadata_path.open("r") as f:
            data = json.load(f)
        return data
    except json.JSONDecodeError:
        print("Invalid JSON:", metadata_path)
        return {}


# Additional helper functions for editing database from dev script
def get_job(job_id: str, db_path: Path = films_db, con: sqlite3.Connection | None = None) -> dict:
    con, owned = _get_con(con, db_path)
    cur = con.cursor()

    cur.execute("SELECT * FROM films WHERE job_id = ?", (job_id,))
    row = cur.fetchone()
    if row is None:
        _maybe_close(con, owned)
        return {}

    film = {
        "job_id": row[0],
        "title": row[1],
        "imdb_id": row[2],
        "released": row[3],
        "type": row[4],
        "runtime_minutes": row[5],
    }

    cur.execute("SELECT * FROM analyzed_files WHERE job_id = ?", (job_id,))
    row = cur.fetchone()
    if row is None:
        _maybe_close(con, owned)
        return {}

    film["job"] = {
        "uploader": row[1],
        "process_date": row[2],
        "json": row[3],
        "poster": row[4],
        "barcode_type": row[5],
        "frame_type": row[6],
        "metric": row[7],
        "source_width": row[8],
        "source_height": row[9],
        "source_fps": row[10],
        "source_frame_count": row[11],
    }

    cur.execute(
        "SELECT a.name FROM actors a "
        "JOIN film_actors fa ON a.id = fa.actor_id "
        "WHERE fa.job_id = ?"
    ";", (job_id,))
    film["actors"] = [r[0] for r in cur.fetchall()]

    cur.execute(
        "SELECT g.name FROM genres g "
        "JOIN film_genres fg ON g.id = fg.genre_id "
        "WHERE fg.job_id = ?"
    ";", (job_id,))
    film["genres"] = [r[0] for r in cur.fetchall()]

    cur.execute(
        "SELECT d.name FROM directors d "
        "JOIN film_directors fd ON d.id = fd.director_id "
        "WHERE fd.job_id = ?"
    ";", (job_id,))
    film["directors"] = [r[0] for r in cur.fetchall()]

    cur.execute(
        "SELECT w.name FROM writers w "
        "JOIN film_writers fw ON w.id = fw.writer_id "
        "WHERE fw.job_id = ?"
    ";", (job_id,))
    film["writers"] = [r[0] for r in cur.fetchall()]

    cur.execute(
        "SELECT l.name FROM languages l "
        "JOIN film_languages fl ON l.id = fl.language_id "
        "WHERE fl.job_id = ?"
    ";", (job_id,))
    film["languages"] = [r[0] for r in cur.fetchall()]

    cur.execute(
        "SELECT c.name FROM countries c "
        "JOIN film_countries fc ON c.id = fc.country_id "
        "WHERE fc.job_id = ?"
    ";", (job_id,))
    film["countries"] = [r[0] for r in cur.fetchall()]

    _maybe_close(con, owned)
    return film

def get_recent_jobs(limit: int = 10, db_path: Path = films_db, con: sqlite3.Connection | None = None) -> list[dict]:
    con, owned = _get_con(con, db_path)
    cur = con.cursor()

    cur.execute(
        "SELECT job_id "
        "FROM analyzed_files "
        "ORDER BY process_date DESC "
        "LIMIT ?"
    ";", (limit,)
    )
    job_ids = [row[0] for row in cur.fetchall()]

    results = [get_job(job_id, db_path, con) for job_id in job_ids]

    _maybe_close(con, owned)

    return results

def delete_job(job_id: str, db_path: Path = films_db, con: sqlite3.Connection | None = None):
    con, owned = _get_con(con, db_path)
    cur = con.cursor()

    for junction_table in ("film_genres", "film_directors", "film_writers", "film_actors", "film_languages", "film_countries"):
        cur.execute(f"DELETE FROM {junction_table} WHERE job_id = ?", (job_id,))

    cur.execute("DELETE FROM films WHERE job_id = ?", (job_id,))
    cur.execute("DELETE FROM analyzed_files WHERE job_id = ?", (job_id,))

    cur.execute("DELETE FROM films_search WHERE job_id = ?", (job_id,))

    con.commit()
    _maybe_close(con, owned)
