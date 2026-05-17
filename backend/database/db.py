from typing import TypedDict
from typing_extensions import NotRequired

import sqlite3
from pathlib import Path
import json
from datetime import datetime


films_db = Path("/home/kalmus/kalmus/app/databases/films.db")


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
    poster: str | None
    barcode_type: str
    frame_type: str
    metric: str
    source_width: int
    source_height: int
    source_fps: float
    source_frame_count: int


class FilmRecord(TypedDict):
    """A complete record of a film in the database, including basic info, job details, and related entities like actors, genres, directors, writers, languages, and countries."""
    job_id: str
    title: str
    imdb_id: str | None
    released: str | None
    type: str | None
    runtime_minutes: int | None
    job: JobDetails
    actors: list[str]
    genres: list[str]
    directors: list[str]
    writers: list[str]
    languages: list[str]
    countries: list[str]


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
        """Exit the context manager, ensuring that the database connection is properly closed."""
        if self.con:
            if not self.readonly:
                self.con.commit()
            _maybe_close(self.con, True)


# Basic functions, used for updating database from uploads to frontend
def _connect(db_path: Path = films_db, readonly: bool = False) -> sqlite3.Connection:
    """Connect to the SQLite database at the specified path. If readonly is True, the connection is opened in read-only mode."""
    con = sqlite3.connect(db_path)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA busy_timeout=5000")
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

    This includes tables for films, related entities (genres, directors, writers, actors, languages, countries), analyzed files, and a virtual table for full-text search.
    """
    with DbConnection(db_path=db_path) as con:
        cur = con.cursor()

        # Main table, contains references to other tables
        cur.execute(
            """
          CREATE TABLE IF NOT EXISTS films (
              job_id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              imdb_id TEXT,
              released DATE,
              released_year INTEGER GENERATED ALWAYS AS (CAST(strftime('%Y', released) AS INTEGER)) STORED,
              type TEXT,
              runtime_minutes INTEGER
          )
          """
        )

        def create_entity_table(cur: sqlite3.Cursor, table: str) -> None:
            cur.execute(
                f"""
              CREATE TABLE IF NOT EXISTS {table} (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  name TEXT NOT NULL
              )
              """
            )
        create_entity_table(cur, "genres")
        create_entity_table(cur, "directors")
        create_entity_table(cur, "writers")
        create_entity_table(cur, "actors")
        create_entity_table(cur, "languages")
        create_entity_table(cur, "countries")

        def create_link_table(cur: sqlite3.Cursor, table: str, col: str) -> None:
            cur.execute(
                f"""
              CREATE TABLE IF NOT EXISTS film_{table} (
                  job_id TEXT,
                  {col}_id INTEGER,
                  PRIMARY KEY (job_id, {col}_id),
                  FOREIGN KEY (job_id) REFERENCES films(job_id),
                  FOREIGN KEY ({col}_id) REFERENCES {table}(id)
              )
              """
            )
        create_link_table(cur, "genres", "genre")
        create_link_table(cur, "directors", "director")
        create_link_table(cur, "writers", "writer")
        create_link_table(cur, "actors", "actor")
        create_link_table(cur, "languages", "language")
        create_link_table(cur, "countries", "country")

        # Analyzed films
        cur.execute(
            """
          CREATE TABLE IF NOT EXISTS analyzed_files (
              job_id TEXT PRIMARY KEY,
              uploader TEXT,
              process_date DATE NOT NULL,
              json TEXT,
              poster TEXT,
              barcode_type TEXT NOT NULL,
              frame_type TEXT NOT NULL,
              metric TEXT NOT NULL,
              source_width INTEGER,
              source_height INTEGER,
              source_fps REAL,
              source_frame_count INTEGER,
              FOREIGN KEY (job_id) REFERENCES films(job_id)
          )
          """
        )

        # Search table
        cur.execute(
            """
          CREATE VIRTUAL TABLE IF NOT EXISTS films_search USING fts5 (
              job_id UNINDEXED,
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


def find_existing_analysis(imdb_id: str | None, barcode_type: str, frame_type: str, metric: str, db_path: Path = films_db, con: sqlite3.Connection | None = None) -> str | None:
    """Find an existing analysis job ID for a given IMDb ID and analysis parameters."""
    if imdb_id is None:
        return None

    with DbConnection(db_path=db_path, readonly=True) as con:
        cur = con.cursor()

        cur.execute(
            """
          SELECT films.job_id
          FROM analyzed_files
          JOIN films ON analyzed_files.job_id = films.job_id
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


def upsert_job(job_id: str, data: Job, upload_metadata: UploadMetadata, json_loc: str, poster_loc: str | None, db_path: Path = films_db, con: sqlite3.Connection | None = None):
    """Insert or update a job record in the database, along with related entities and analyzed file metadata."""
    config = data.get("config")
    movie = data.get("movie")
    raw = movie.get("raw", None)

    title = movie.get("title")
    imdb_id = movie.get("imdb_id")
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

        # Insert film record
        cur.execute(
            """
          INSERT OR REPLACE INTO films
              (title, imdb_id, released, type, runtime_minutes, job_id)
          VALUES
              (?, ?, ?, ?, ?, ?)
          """,
            (title, imdb_id, released, type_, runtime, job_id)
        )

        # If raw data is available, update junction tables for genres, directors, writers, actors, languages, and countries
        if raw:
            # Clear and re-insert all junction table entries
            for junction_table in ("film_genres", "film_directors", "film_writers", "film_actors", "film_languages", "film_countries"):
                cur.execute(
                    f"DELETE FROM {junction_table} WHERE job_id = ?",
                    (job_id,)
                )

            def insert_or_get_id(table: str, col: str, value: str) -> int | None:
                cur.execute(
                    f"SELECT id FROM {table} WHERE {col} = ?",
                    (value,)
                )
                row = cur.fetchone()
                if row:
                    (id,) = row
                    return id
                cur.execute(
                    f"INSERT INTO {table} ({col}) VALUES (?)",
                    (value,)
                )
                return cur.lastrowid

            def clean_and_split(col: str) -> list[str]:
                return [g.strip() for g in raw.get(col, "").split(",") if g and g != "N/A"]

            def insert_links(key: str, table: str, col: str):
                keys = clean_and_split(key)
                for key in keys:
                    id = insert_or_get_id(table, "name", key)
                    cur.execute(
                        f"INSERT OR IGNORE INTO film_{table} (job_id, {col}_id) VALUES (?, ?)",
                        (job_id, id)
                    )
            insert_links("Genre", "genres", "genre")
            insert_links("Director", "directors", "director")
            insert_links("Writer", "writers", "writer")
            insert_links("Actors", "actors", "actor")
            insert_links("Language", "languages", "language")
            insert_links("Country", "countries", "country")

        # Insert job metadata
        cur.execute(
            """
          INSERT OR REPLACE INTO analyzed_files
              (job_id, uploader, process_date, json, poster, barcode_type, frame_type,
              metric, source_width, source_height, source_fps, source_frame_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
            (
                job_id,
                config.get("email", "").lower(),
                datetime.fromisoformat(
                    data.get("submittedAt").replace("Z", "+00:00")
                ).date() or datetime.now().date(),
                json_loc,
                poster_loc,
                config.get("barcode_type").lower(),
                config.get("frame_type").lower(),
                config.get("color_metric").lower(),
                upload_metadata.get("width"),
                upload_metadata.get("height"),
                upload_metadata.get("fps"),
                upload_metadata.get("frame_count")
            )
        )


def update_search_table(job_id: str, db_path: Path = films_db, con: sqlite3.Connection | None = None):
    """Update the full-text search table for a given job ID, aggregating related entities into concatenated strings for efficient searching."""
    with DbConnection(db_path=db_path) as con:
        cur = con.cursor()

        cur.execute(
            """
          INSERT INTO films_search
              (job_id, title, director, actor, country, genre, language, writer)
          SELECT
              f.job_id,
              f.title,
              COALESCE(d.directors, ''),
              COALESCE(a.actors, ''),
              COALESCE(c.countries, ''),
              COALESCE(g.genres, ''),
              COALESCE(l.languages, ''),
              COALESCE(w.writers, '')
          FROM films f
          LEFT JOIN (
              SELECT fd.job_id, GROUP_CONCAT(DISTINCT d.name) AS directors
              FROM film_directors fd
              JOIN directors d ON d.id = fd.director_id
              GROUP BY fd.job_id
          ) d ON d.job_id = f.job_id
          LEFT JOIN (
              SELECT fa.job_id, GROUP_CONCAT(DISTINCT a.name) AS actors
              FROM film_actors fa
              JOIN actors a ON a.id = fa.actor_id
              GROUP BY fa.job_id
          ) a ON a.job_id = f.job_id
          LEFT JOIN (
              SELECT fc.job_id, GROUP_CONCAT(DISTINCT c.name) AS countries
              FROM film_countries fc
              JOIN countries c ON c.id = fc.country_id
              GROUP BY fc.job_id
          ) c ON c.job_id = f.job_id
          LEFT JOIN (
              SELECT fg.job_id, GROUP_CONCAT(DISTINCT g.name) AS genres
              FROM film_genres fg
              JOIN genres g ON g.id = fg.genre_id
              GROUP BY fg.job_id
          ) g ON g.job_id = f.job_id
          LEFT JOIN (
              SELECT fl.job_id, GROUP_CONCAT(DISTINCT l.name) AS languages
              FROM film_languages fl
              JOIN languages l ON l.id = fl.language_id
              GROUP BY fl.job_id
          ) l ON l.job_id = f.job_id
          LEFT JOIN (
              SELECT fw.job_id, GROUP_CONCAT(DISTINCT w.name) AS writers
              FROM film_writers fw
              JOIN writers w ON w.id = fw.writer_id
              GROUP BY fw.job_id
          ) w ON w.job_id = f.job_id
          WHERE f.job_id = ?
          """,
            (job_id,)
        )


def get_job_metadata(job_id: str) -> Job:
    """
    Retrieve the job metadata for a given job ID by reading the corresponding JSON file from the filesystem.

    This function assumes that the metadata JSON files are stored in a specific directory structure based on the job ID.
    """
    metadata_path = Path(f'/home/kalmus/kalmus/results/{job_id}/metadata.json')
    try:
        with metadata_path.open("r") as f:
            data = json.load(f)
        return data
    except json.JSONDecodeError:
        print("Invalid JSON:", metadata_path)
        raise


# Additional helper functions for editing database from dev script
def get_job(job_id: str, db_path: Path = films_db, con: sqlite3.Connection | None = None) -> FilmRecord | None:
    """Retrieve a complete film record for a given job ID."""
    with DbConnection(db_path=db_path, readonly=True) as con:
        cur = con.cursor()

        cur.execute(
            "SELECT * FROM films WHERE job_id = ?",
            (job_id,)
        )
        film_row = cur.fetchone()
        if film_row is None:
            return None

        cur.execute(
            "SELECT * FROM analyzed_files WHERE job_id = ?",
            (job_id,)
        )
        analyzed_file_row = cur.fetchone()
        if analyzed_file_row is None:
            return None

        def fetch_names(table: str, join_table: str, col: str) -> list[str]:
            cur.execute(
                f"""
                SELECT {table[0]}.name FROM {table} {table[0]}
                JOIN {join_table} j ON {table[0]}.id = j.{col}_id
                WHERE j.job_id = ?
                """,
                (job_id,),
            )
            return [r[0] for r in cur.fetchall()]

        film = FilmRecord(
            job_id=film_row[0],
            title=film_row[1],
            imdb_id=film_row[2],
            released=film_row[3],
            type=film_row[4],
            runtime_minutes=film_row[5],
            job={
                "uploader": analyzed_file_row[1],
                "process_date": analyzed_file_row[2],
                "json": analyzed_file_row[3],
                "poster": analyzed_file_row[4],
                "barcode_type": analyzed_file_row[5],
                "frame_type": analyzed_file_row[6],
                "metric": analyzed_file_row[7],
                "source_width": analyzed_file_row[8],
                "source_height": analyzed_file_row[9],
                "source_fps": analyzed_file_row[10],
                "source_frame_count": analyzed_file_row[11],
            },
            actors=fetch_names("actors", "film_actors", "actor"),
            genres=fetch_names("genres", "film_genres", "genre"),
            directors=fetch_names("directors", "film_directors", "director"),
            writers=fetch_names("writers", "film_writers", "writer"),
            languages=fetch_names("languages", "film_languages", "language"),
            countries=fetch_names("countries", "film_countries", "country")
        )

        return film


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


def delete_job(job_id: str, db_path: Path = films_db, con: sqlite3.Connection | None = None):
    """Delete a job and all related records from the database for a given job ID."""
    with DbConnection(db_path=db_path) as con:
        cur = con.cursor()

        def delete_job_from_table(table: str):
            cur.execute(
                f"DELETE FROM {table} WHERE job_id = ?",
                (job_id,)
            )

        delete_job_from_table("film_genres")
        delete_job_from_table("film_directors")
        delete_job_from_table("film_writers")
        delete_job_from_table("film_actors")
        delete_job_from_table("film_languages")
        delete_job_from_table("film_countries")
        delete_job_from_table("films")
        delete_job_from_table("analyzed_files")
        delete_job_from_table("films_search")
