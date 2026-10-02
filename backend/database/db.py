from typing import TypedDict
from typing_extensions import NotRequired

import sqlite3
from pathlib import Path
import json
from datetime import datetime

import os
from dotenv import load_dotenv

# Shares the frontend's env file; vars already in the environment (e.g. from sbatch) take priority.
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env.local")


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required env var {name} (see frontend/.env.local.example)")
    return value


films_db = Path(require_env("FILMS_DB_PATH"))
RESULTS_DIR = Path(require_env("RESULTS_DIR"))


class Config(TypedDict):
    """Configuration for processing a video, as submitted by the frontend."""
    sampled_rate: int
    skip_over: int
    total_frames: int
    frames_per_column: int
    save_thumbnails: bool
    partition: str
    email: str
    color_metric: str
    frame_type: str
    barcode_type: str
    video_title: str
    force_reprocess: bool


class User(TypedDict):
    """User information, as submitted by the frontend."""
    username: str
    email: str
    fullName: str


class Rating(TypedDict):
    """Rating information for a movie."""
    Source: str
    Value: str


class MovieRaw(TypedDict):
    """Raw movie data from OMDb API."""
    Title: NotRequired[str]
    Year: NotRequired[str]
    Rated: NotRequired[str]
    Released: str | None
    Runtime: str | None
    Genre: NotRequired[str]
    Director: NotRequired[str]
    Writer: NotRequired[str]
    Actors: NotRequired[str]
    Plot: NotRequired[str]
    Language: NotRequired[str]
    Country: NotRequired[str]
    Awards: NotRequired[str]
    Poster: NotRequired[str]
    Ratings: NotRequired[list[Rating]]
    Metascore: NotRequired[str]
    imdbRating: NotRequired[str]
    imdbVotes: NotRequired[str]
    imdbID: NotRequired[str]
    Type: str | None
    DVD: NotRequired[str]
    BoxOffice: NotRequired[str]
    Production: NotRequired[str]
    Website: NotRequired[str]
    Response: NotRequired[str]


class Movie(TypedDict):
    """Movie information, as submitted by the frontend. Contains both basic info and raw data from OMDb if available."""
    title: str
    imdb_id: NotRequired[str | None]
    year: NotRequired[str]
    genre: NotRequired[str]
    director: NotRequired[str]
    plot: NotRequired[str]
    poster_url: NotRequired[str]
    raw: NotRequired[MovieRaw]


class Job(TypedDict):
    """Job information, as submitted by the frontend. Contains configuration, user info, and movie info."""
    jobId: str
    slurmJobId: str
    videoPath: str
    videoFilename: str
    config: Config
    submittedAt: str  # ISO 8601 date
    status: str
    user: User
    movie: Movie


class UploadMetadata(TypedDict):
    """Metadata about the uploaded video file, used for storing in the database and validation."""
    width: int
    height: int
    fps: float
    frame_count: int


class JobDetails(TypedDict):
    """Details about a processed job, stored in the database. Contains information about the uploader, processing date, file locations, and video properties."""
    uploader: str
    process_date: str
    json: str
    barcode_type: str
    frame_type: str
    metric: str
    source_width: int
    source_height: int
    source_fps: float
    source_frame_count: int


class FilmRecord(TypedDict):
    """A complete record of an analysis job: its film's info, the job details, and the film's related entities like actors, genres, directors, writers, languages, and countries."""
    job_id: str
    film_id: int
    title: str
    imdb_id: str | None
    released: str | None
    type: str | None
    runtime_minutes: int | None
    poster: str | None
    job: JobDetails
    actors: list[str]
    genres: list[str]
    directors: list[str]
    writers: list[str]
    languages: list[str]
    countries: list[str]


# (entity table, link column prefix, OMDb raw key). Each entity has a film_<table> link table.
ENTITIES = [
    ("genres", "genre", "Genre"),
    ("directors", "director", "Director"),
    ("writers", "writer", "Writer"),
    ("actors", "actor", "Actors"),
    ("languages", "language", "Language"),
    ("countries", "country", "Country"),
]


class DbConnection:
    """Context manager for database connections. Ensures that connections are properly closed after use, and allows for optional read-only mode."""

    def __init__(self, readonly: bool = False, db_path: Path = films_db):
        """Initialize the database connection context manager."""
        self.readonly = readonly
        self.db_path = db_path
        self.con: sqlite3.Connection | None = None

    def __enter__(self) -> sqlite3.Connection:
        """Enter the context manager, establishing a database connection. If readonly is True, the connection is opened in read-only mode."""
        self.con, _ = _get_con(self.con, self.db_path, readonly=self.readonly)
        return self.con

    def __exit__(self, exc_type, exc_val, exc_tb):  # type: ignore
        """Exit the context manager, committing only if no exception occurred, and close the connection."""
        if self.con:
            if not self.readonly:
                if exc_type is None:
                    self.con.commit()
                else:
                    self.con.rollback()
            _maybe_close(self.con, True)


# Basic functions, used for updating database from uploads to frontend
def _connect(db_path: Path = films_db, readonly: bool = False) -> sqlite3.Connection:
    """Connect to the SQLite database at the specified path. If readonly is True, the connection is opened in read-only mode."""
    con = sqlite3.connect(db_path)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA busy_timeout=5000")
    con.execute("PRAGMA foreign_keys=ON")
    if readonly:
        con.execute("PRAGMA readonly=ON")
    return con


def _close(con: sqlite3.Connection):
    """Close the database connection, ensuring that any pending transactions are properly handled and the connection is cleanly closed."""
    con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    con.close()


def _get_con(con: sqlite3.Connection | None, db_path: Path, readonly: bool = False) -> tuple[sqlite3.Connection, bool]:
    """
    Get a database connection.

    If a connection is provided, it is returned along with False to indicate that the caller does not own the connection.
    If no connection is provided, a new connection is created and returned along with True to indicate that the caller owns the connection and is responsible for closing it.
    """
    if con is not None:
        return con, False
    return _connect(db_path, readonly=readonly), True


def _maybe_close(con: sqlite3.Connection, owned: bool):
    """Close the database connection if the caller owns it."""
    if owned:
        _close(con)


def create_db(db_path: Path = films_db, con: sqlite3.Connection | None = None):
    """
    Create the database schema if it does not already exist.

    Films are shared between analysis jobs: each analyzed_files row (one per job) points at one film.
    Deleting the last job of a film deletes the film, its links, and its search row (via triggers and cascades).
    """
    with DbConnection(db_path=db_path) as con:
        cur = con.cursor()

        # Film metadata, shared by all analyses of the same film
        cur.execute(
            """
          CREATE TABLE IF NOT EXISTS films (
              id INTEGER PRIMARY KEY,
              imdb_id TEXT UNIQUE,
              title TEXT NOT NULL,
              released DATE,
              released_year INTEGER GENERATED ALWAYS AS (CAST(strftime('%Y', released) AS INTEGER)) STORED,
              type TEXT,
              runtime_minutes INTEGER,
              poster TEXT
          )
          """
        )

        for table, col, _ in ENTITIES:
            cur.execute(
                f"""
              CREATE TABLE IF NOT EXISTS {table} (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL
              )
              """
            )
            cur.execute(
                f"""
              CREATE TABLE IF NOT EXISTS film_{table} (
                  film_id INTEGER,
                  {col}_id INTEGER,
                  PRIMARY KEY (film_id, {col}_id),
                  FOREIGN KEY (film_id) REFERENCES films(id) ON DELETE CASCADE,
                  FOREIGN KEY ({col}_id) REFERENCES {table}(id)
              )
              """
            )

        # One row per analysis job
        cur.execute(
            """
          CREATE TABLE IF NOT EXISTS analyzed_files (
              job_id TEXT PRIMARY KEY,
              film_id INTEGER NOT NULL,
              uploader TEXT,
              process_date DATE NOT NULL,
              json TEXT,
              barcode_type TEXT NOT NULL,
              frame_type TEXT NOT NULL,
              metric TEXT NOT NULL,
              source_width INTEGER,
              source_height INTEGER,
              source_fps REAL,
              source_frame_count INTEGER,
              FOREIGN KEY (film_id) REFERENCES films(id)
          )
          """
        )
        cur.execute("CREATE INDEX IF NOT EXISTS analyzed_files_film_id ON analyzed_files(film_id)")

        # Search table, one row per film
        cur.execute(
            """
          CREATE VIRTUAL TABLE IF NOT EXISTS films_search USING fts5 (
              film_id UNINDEXED,
              title,
              director,
              actor,
              country,
              genre,
              language,
              writer,
              tokenize = "unicode61 remove_diacritics 2"
          )
          """
        )

        # Remove a film once no job references it (job deleted, or job relinked to another film)
        for event in ("DELETE", "UPDATE OF film_id"):
            cur.execute(
                f"""
              CREATE TRIGGER IF NOT EXISTS delete_orphan_film_{event.split()[0].lower()}
              AFTER {event} ON analyzed_files
              WHEN NOT EXISTS (SELECT 1 FROM analyzed_files WHERE film_id = OLD.film_id)
              BEGIN
                  DELETE FROM films WHERE id = OLD.film_id;
              END
              """
            )
        # FTS tables cannot have foreign keys
        cur.execute(
            """
          CREATE TRIGGER IF NOT EXISTS delete_film_search
          AFTER DELETE ON films
          BEGIN
              DELETE FROM films_search WHERE film_id = OLD.id;
          END
          """
        )


def find_existing_analysis(imdb_id: str | None, barcode_type: str, frame_type: str, metric: str, db_path: Path = films_db, con: sqlite3.Connection | None = None) -> str | None:
    """Find an existing analysis job ID for a given IMDb ID and analysis parameters."""
    if not imdb_id:
        return None

    with DbConnection(db_path=db_path, readonly=True) as con:
        cur = con.cursor()

        cur.execute(
            """
          SELECT analyzed_files.job_id
          FROM analyzed_files
          JOIN films ON analyzed_files.film_id = films.id
          WHERE films.imdb_id = ?
              AND analyzed_files.barcode_type = ?
              AND analyzed_files.frame_type = ?
              AND analyzed_files.metric = ?
          ORDER BY analyzed_files.process_date DESC
          LIMIT 1
          """,
            (imdb_id, barcode_type, frame_type, metric)
        )
        row = cur.fetchone()

        if row:
            (job_id,) = row
            return job_id
        return None


def _refresh_search(cur: sqlite3.Cursor, film_id: int):
    """Rebuild a film's full-text search row from its current metadata and related entities."""
    cols = ", ".join(col for _, col, _ in ENTITIES)
    names = ", ".join(
        f"COALESCE((SELECT GROUP_CONCAT(DISTINCT e.name) FROM film_{table} j JOIN {table} e ON e.id = j.{col}_id WHERE j.film_id = f.id), '')"
        for table, col, _ in ENTITIES
    )
    cur.execute("DELETE FROM films_search WHERE film_id = ?", (film_id,))
    cur.execute(
        f"INSERT INTO films_search (film_id, title, {cols}) SELECT f.id, f.title, {names} FROM films f WHERE f.id = ?",
        (film_id,)
    )


def _results_relative(path: str | None) -> str | None:
    """Store file paths relative to RESULTS_DIR so the database survives the results directory moving. Raises if the file is outside it."""
    return Path(path).resolve().relative_to(RESULTS_DIR.resolve()).as_posix() if path else None


def upsert_job(job_id: str, data: Job, upload_metadata: UploadMetadata, json_loc: str, poster_loc: str | None, db_path: Path = films_db, con: sqlite3.Connection | None = None):
    """
    Insert or update a job record and link it to its film.

    The film (with its related entities and search row) is only created when no film with the same IMDb ID exists,
    so a new upload never overwrites edits made to a shared film. Films without an IMDb ID are always created new.
    json_loc and poster_loc must be inside RESULTS_DIR; they are stored relative to it.
    """
    json_rel = _results_relative(json_loc)
    poster_rel = _results_relative(poster_loc)
    config = data.get("config")
    movie = data.get("movie")
    raw = movie.get("raw", None)

    title = movie.get("title")
    imdb_id = movie.get("imdb_id") or None  # UNIQUE allows many NULLs, but not many empty strings
    type_ = raw.get("Type") if raw else ""
    runtime_raw = raw.get("Runtime") if raw else ""
    runtime = int(runtime_raw.split()[0]) if runtime_raw else None

    released_raw = raw.get("Released") if raw else ""
    released = ""
    if released_raw and released_raw != "N/A":
        try:
            released = datetime.strptime(released_raw, "%d %b %Y").date()
        except ValueError:
            released = released_raw  # Keep original if parsing fails

    with DbConnection(db_path=db_path) as con:
        cur = con.cursor()

        row = cur.execute("SELECT id FROM films WHERE imdb_id = ?", (imdb_id,)).fetchone() if imdb_id else None
        if row:
            (film_id,) = row
            cur.execute("UPDATE films SET poster = COALESCE(poster, ?) WHERE id = ?", (poster_rel, film_id))
        else:
            cur.execute(
                """
              INSERT INTO films
                  (imdb_id, title, released, type, runtime_minutes, poster)
              VALUES
                  (?, ?, ?, ?, ?, ?)
              """,
                (imdb_id, title, released, type_, runtime, poster_rel)
            )
            film_id = cur.lastrowid

            if raw:
                def insert_or_get_id(table: str, value: str) -> int | None:
                    row = cur.execute(f"SELECT id FROM {table} WHERE name = ?", (value,)).fetchone()
                    if row:
                        (id,) = row
                        return id
                    cur.execute(f"INSERT INTO {table} (name) VALUES (?)", (value,))
                    return cur.lastrowid

                for table, col, raw_key in ENTITIES:
                    for name in [v.strip() for v in raw.get(raw_key, "").split(",") if v and v != "N/A"]:
                        cur.execute(
                            f"INSERT OR IGNORE INTO film_{table} (film_id, {col}_id) VALUES (?, ?)",
                            (film_id, insert_or_get_id(table, name))
                        )

            _refresh_search(cur, film_id)

        # Insert or update job metadata (ON CONFLICT rather than REPLACE so the orphan-film trigger fires on relink)
        job_cols = ("job_id", "film_id", "uploader", "process_date", "json", "barcode_type", "frame_type",
                    "metric", "source_width", "source_height", "source_fps", "source_frame_count")
        cur.execute(
            f"""
          INSERT INTO analyzed_files ({", ".join(job_cols)})
          VALUES ({", ".join("?" for _ in job_cols)})
          ON CONFLICT(job_id) DO UPDATE SET {", ".join(f"{c} = excluded.{c}" for c in job_cols[1:])}
          """,
            (
                job_id,
                film_id,
                config.get("email", "").lower(),
                datetime.fromisoformat(
                    data.get("submittedAt").replace("Z", "+00:00")
                ).date() or datetime.now().date(),
                json_rel,
                config.get("barcode_type").lower(),
                config.get("frame_type").lower(),
                config.get("color_metric").lower(),
                upload_metadata.get("width"),
                upload_metadata.get("height"),
                upload_metadata.get("fps"),
                upload_metadata.get("frame_count")
            )
        )


def get_job_metadata(job_id: str) -> Job:
    """
    Retrieve the job metadata for a given job ID by reading the corresponding JSON file from the filesystem.

    This function assumes that the metadata JSON files are stored in a specific directory structure based on the job ID.
    """
    metadata_path = RESULTS_DIR / job_id / "metadata.json"
    try:
        with metadata_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data
    except json.JSONDecodeError:
        print("Invalid JSON:", metadata_path)
        raise


# Additional helper functions for editing database from dev script
def get_job(job_id: str, db_path: Path = films_db, con: sqlite3.Connection | None = None) -> FilmRecord | None:
    """Retrieve a complete film record for a given job ID."""
    with DbConnection(db_path=db_path, readonly=True) as con:
        con.row_factory = sqlite3.Row
        cur = con.cursor()

        row = cur.execute(
            """
          SELECT f.id AS film_id, f.title, f.imdb_id, f.released, f.type, f.runtime_minutes, f.poster, af.*
          FROM analyzed_files af
          JOIN films f ON f.id = af.film_id
          WHERE af.job_id = ?
          """,
            (job_id,)
        ).fetchone()
        if row is None:
            return None

        def fetch_names(table: str, col: str) -> list[str]:
            cur.execute(
                f"SELECT e.name FROM {table} e JOIN film_{table} j ON e.id = j.{col}_id WHERE j.film_id = ?",
                (row["film_id"],),
            )
            return [r[0] for r in cur.fetchall()]

        names = {table: fetch_names(table, col) for table, col, _ in ENTITIES}
        return FilmRecord(
            job_id=row["job_id"],
            film_id=row["film_id"],
            title=row["title"],
            imdb_id=row["imdb_id"],
            released=row["released"],
            type=row["type"],
            runtime_minutes=row["runtime_minutes"],
            poster=row["poster"],
            job={k: row[k] for k in JobDetails.__annotations__},  # type: ignore
            actors=names["actors"],
            genres=names["genres"],
            directors=names["directors"],
            writers=names["writers"],
            languages=names["languages"],
            countries=names["countries"],
        )


def get_recent_jobs(limit: int = 10, db_path: Path = films_db, con: sqlite3.Connection | None = None) -> list[FilmRecord]:
    """Retrieve a list of recent film records, limited by the specified number of entries."""
    with DbConnection(db_path=db_path, readonly=True) as con:
        cur = con.cursor()

        cur.execute(
            """
          SELECT job_id FROM analyzed_files
          ORDER BY process_date DESC
          LIMIT ?
          """,
            (limit,)
        )
        job_ids = [row[0] for row in cur.fetchall()]

        results = [record for job_id in job_ids if (
            record := get_job(job_id, db_path, con)) is not None]

        return results


def update_film(film_id: int, title: str, released: str | None, type_: str | None, runtime_minutes: int | None, db_path: Path = films_db, con: sqlite3.Connection | None = None):
    """Update a film's basic info (shared by all of its analyses) and its search row."""
    with DbConnection(db_path=db_path) as con:
        cur = con.cursor()
        cur.execute(
            "UPDATE films SET title = ?, released = ?, type = ?, runtime_minutes = ? WHERE id = ?",
            (title, released, type_, runtime_minutes, film_id)
        )
        _refresh_search(cur, film_id)


def delete_job(job_id: str, db_path: Path = films_db, con: sqlite3.Connection | None = None):
    """Delete a job. Its film (with links and search row) is removed by triggers once no other job uses it."""
    with DbConnection(db_path=db_path) as con:
        con.execute("DELETE FROM analyzed_files WHERE job_id = ?", (job_id,))
