from typing import TypedDict
from typing_extensions import NotRequired

import sqlite3
from pathlib import Path
import json
from datetime import datetime

import os
from dotenv import load_dotenv

from film_map import INSERT_FILM_MAP, film_map_row, map_point

# Shares the frontend's env file; vars already in the environment (e.g. from sbatch) take priority.
load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env.local")


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required env var {name} (see frontend/.env.local.example)")
    return value


class DbConnection:
    """
    Context manager for database connections. Commits on success, rolls back on error, and closes the connection.

    If an existing connection is passed in, it is used as-is and left open and uncommitted for its owner.
    """

    def __init__(self, db_path: Path, readonly: bool = False, con: sqlite3.Connection | None = None):
        """Initialize the database connection context manager."""
        self.readonly = readonly
        self.db_path = db_path
        self.con = con
        self.owned = con is None

    def __enter__(self) -> sqlite3.Connection:
        """Enter the context manager, opening a connection unless one was passed in."""
        if self.con is None:
            self.con = DbConnection._connect(self.db_path, readonly=self.readonly)
        return self.con

    def __exit__(self, exc_type, exc_val, exc_tb):  # type: ignore
        """Exit the context manager, committing only if no exception occurred, and close the connection if we opened it."""
        if not self.owned or self.con is None:
            return
        if not self.readonly:
            if exc_type is None:
                self.con.commit()
            else:
                self.con.rollback()
        DbConnection._close(self.con)

    @staticmethod
    def _connect(db_path: Path, readonly: bool = False) -> sqlite3.Connection:
        """Connect to the SQLite database at the specified path. If readonly is True, the connection is opened in read-only mode."""
        con = sqlite3.connect(db_path)
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA busy_timeout=5000")
        con.execute("PRAGMA foreign_keys=ON")
        if readonly:
            con.execute("PRAGMA readonly=ON")
        return con

    @staticmethod
    def _close(con: sqlite3.Connection) -> None:
        """Close the database connection, ensuring that any pending transactions are properly handled and the connection is cleanly closed."""
        con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        con.close()


class Db:
    """Generic database: one SQLite file. Subclasses pick their default file, define the schema in create_db, and add their own queries."""

    def __init__(self, path: Path):
        self.path = path

    def connect(self, readonly: bool = False, con: sqlite3.Connection | None = None) -> DbConnection:
        """Connection context for this database. Pass con to reuse a caller's connection (and its transaction)."""
        return DbConnection(self.path, readonly=readonly, con=con)

    def create_db(self, con: sqlite3.Connection | None = None) -> None:
        """Create the database schema if it does not already exist."""
        raise NotImplementedError


class FilmsDb(Db):
    """The films database: analysis jobs, the films they analyze, and the search index."""

    def __init__(self, path: Path | None = None):
        super().__init__(path or Path(require_env("FILMS_DB_PATH")))
        self.results_dir = Path(require_env("RESULTS_DIR"))

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
        edition: NotRequired[str]  # free-text version of the film, e.g. "Criterion Color"


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
        Ratings: NotRequired[list["FilmsDb.Rating"]]
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
        raw: NotRequired["FilmsDb.MovieRaw"]


    class Job(TypedDict):
        """Job information, as submitted by the frontend. Contains configuration, user info, and movie info."""
        jobId: str
        slurmJobId: str
        videoPath: str
        videoFilename: str
        config: "FilmsDb.Config"
        submittedAt: str  # ISO 8601 date
        status: str
        user: "FilmsDb.User"
        movie: "FilmsDb.Movie"


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
        edition: str | None
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
        job: "FilmsDb.JobDetails"
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


    # All editions of a film's analyses, comma separated, for the search table. {film} is the film id expression.
    _EDITIONS_SQL = "COALESCE((SELECT GROUP_CONCAT(DISTINCT a.edition) FROM analyzed_files a WHERE a.film_id = {film}), '')"


    def _refresh_search(self, cur: sqlite3.Cursor, film_id: int):
        """Rebuild a film's full-text search row from its current metadata, related entities and editions."""
        cols = ", ".join(col for _, col, _ in self.ENTITIES)
        names = ", ".join(
            f"COALESCE((SELECT GROUP_CONCAT(DISTINCT e.name) FROM film_{table} j JOIN {table} e ON e.id = j.{col}_id WHERE j.film_id = f.id), '')"
            for table, col, _ in self.ENTITIES
        )
        cur.execute("DELETE FROM films_search WHERE film_id = ?", (film_id,))
        cur.execute(
            f"INSERT INTO films_search (film_id, title, {cols}, edition) SELECT f.id, f.title, {names}, {self._EDITIONS_SQL.format(film='f.id')} FROM films f WHERE f.id = ?",
            (film_id,)
        )


    def _results_relative(self, path: str | None) -> str | None:
        """Store file paths relative to results_dir so the database survives the results directory moving. Raises if the file is outside it."""
        return Path(path).resolve().relative_to(self.results_dir.resolve()).as_posix() if path else None


    def get_job_metadata(self, job_id: str) -> Job:
        """
        Retrieve the job metadata for a given job ID by reading the corresponding JSON file from the filesystem.

        This function assumes that the metadata JSON files are stored in a specific directory structure based on the job ID.
        """
        metadata_path = self.results_dir / job_id / "metadata.json"
        try:
            with metadata_path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            return data
        except json.JSONDecodeError:
            print("Invalid JSON:", metadata_path)
            raise

    def create_db(self, con: sqlite3.Connection | None = None):
        """
        Create the database schema if it does not already exist.

        Films are shared between analysis jobs: each analyzed_files row (one per job) points at one film.
        Deleting the last job of a film deletes the film, its links, and its search row (via triggers and cascades).
        """
        with self.connect(con=con) as con:
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

            for table, col, _ in self.ENTITIES:
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
                  edition TEXT,
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
            # Migration: databases created before editions existed
            if "edition" not in {r[1] for r in cur.execute("PRAGMA table_info(analyzed_files)")}:
                cur.execute("ALTER TABLE analyzed_files ADD COLUMN edition TEXT")

            # Film-map position of each color-barcode job. primary_hue is NULL for black-and-white films
            cur.execute(
                """
              CREATE TABLE IF NOT EXISTS film_map (
                  job_id TEXT PRIMARY KEY,
                  primary_hue REAL,
                  lightness REAL NOT NULL,
                  mean_hue REAL,
                  hue_hist TEXT,
                  display_hist TEXT,
                  FOREIGN KEY (job_id) REFERENCES analyzed_files(job_id) ON DELETE CASCADE
              )
              """
            )

            # Migration: film maps created before the palette features (mean_hue, hue_hist JSON) or display_hist existed
            film_map_cols = {r[1] for r in cur.execute("PRAGMA table_info(film_map)")}
            for col, type_ in (("mean_hue", "REAL"), ("hue_hist", "TEXT"), ("display_hist", "TEXT")):
                if col not in film_map_cols:
                    cur.execute(f"ALTER TABLE film_map ADD COLUMN {col} {type_}")

            # One row per failed run (non-zero exit or SLURM timeout), with the configuration it was submitted with
            cur.execute(
                """
              CREATE TABLE IF NOT EXISTS failed_runs (
                  job_id TEXT PRIMARY KEY,
                  slurm_job_id TEXT,
                  status TEXT NOT NULL,
                  exit_code INTEGER,
                  failed_at TEXT NOT NULL,
                  submitted_at TEXT,
                  uploader TEXT,
                  title TEXT,
                  imdb_id TEXT,
                  video_filename TEXT,
                  config TEXT NOT NULL
              )
              """
            )

            # Search table, one row per film. edition holds the editions of all the film's analyses.
            # Migration: FTS columns cannot be added, so an older search table is rebuilt
            rebuild_search = (
                bool(cur.execute("SELECT 1 FROM sqlite_master WHERE name = 'films_search'").fetchone())
                and "edition" not in {r[1] for r in cur.execute("PRAGMA table_info(films_search)")}
            )
            if rebuild_search:
                cur.execute("DROP TABLE films_search")
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
                  edition,
                  tokenize = "unicode61 remove_diacritics 2"
              )
              """
            )
            if rebuild_search:
                for (film_id,) in cur.execute("SELECT id FROM films").fetchall():
                    self._refresh_search(cur, film_id)

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
            # Keep each film's searchable editions in sync as its jobs are added, edited, moved or deleted
            for name, event, film_ids in (
                ("insert", "INSERT", ("NEW",)),
                ("update", "UPDATE OF edition, film_id", ("OLD", "NEW")),
                ("delete", "DELETE", ("OLD",)),
            ):
                updates = "".join(
                    f"UPDATE films_search SET edition = {self._EDITIONS_SQL.format(film=f'{row}.film_id')} WHERE film_id = {row}.film_id;"
                    for row in film_ids
                )
                cur.execute(f"CREATE TRIGGER IF NOT EXISTS sync_search_edition_{name} AFTER {event} ON analyzed_files BEGIN {updates} END")

    def find_existing_analysis(self, imdb_id: str | None, barcode_type: str, frame_type: str, metric: str, edition: str | None = None, con: sqlite3.Connection | None = None) -> str | None:
        """Find an existing analysis job ID for a given IMDb ID, edition (case-insensitive, None matches no edition) and analysis parameters."""
        if not imdb_id:
            return None

        with self.connect(readonly=True, con=con) as con:
            cur = con.cursor()

            cur.execute(
                """
              SELECT analyzed_files.job_id
              FROM analyzed_files
              JOIN films ON analyzed_files.film_id = films.id
              WHERE films.imdb_id = ?
                  AND LOWER(COALESCE(analyzed_files.edition, '')) = LOWER(?)
                  AND analyzed_files.barcode_type = ?
                  AND analyzed_files.frame_type = ?
                  AND analyzed_files.metric = ?
              ORDER BY analyzed_files.process_date DESC
              LIMIT 1
              """,
                (imdb_id, (edition or "").strip(), barcode_type, frame_type, metric)
            )
            row = cur.fetchone()

            if row:
                (job_id,) = row
                return job_id
            return None

    def upsert_job(self, job_id: str, data: Job, upload_metadata: UploadMetadata, json_loc: str, poster_loc: str | None, con: sqlite3.Connection | None = None):
        """
        Insert or update a job record and link it to its film.

        The film (with its related entities and search row) is only created when no film with the same IMDb ID exists,
        so a new upload never overwrites edits made to a shared film. Films without an IMDb ID are always created new.
        json_loc and poster_loc must be inside results_dir; they are stored relative to it.
        """
        json_rel = self._results_relative(json_loc)
        poster_rel = self._results_relative(poster_loc)
        config = data.get("config")
        map_features = map_point(json_loc, config["barcode_type"], config["color_metric"], config["frame_type"])
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

        with self.connect(con=con) as con:
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

                    for table, col, raw_key in self.ENTITIES:
                        for name in [v.strip() for v in raw.get(raw_key, "").split(",") if v and v != "N/A"]:
                            cur.execute(
                                f"INSERT OR IGNORE INTO film_{table} (film_id, {col}_id) VALUES (?, ?)",
                                (film_id, insert_or_get_id(table, name))
                            )

                self._refresh_search(cur, film_id)

            # Insert or update job metadata (ON CONFLICT rather than REPLACE so the orphan-film trigger fires on relink)
            job_cols = ("job_id", "film_id", "edition", "uploader", "process_date", "json", "barcode_type", "frame_type",
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
                    (config.get("edition") or "").strip() or None,
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
                    upload_metadata.get("frame_count"),
                )
            )
            if map_features is not None:
                cur.execute(INSERT_FILM_MAP, film_map_row(job_id, map_features))

    # Additional helper functions for editing database from dev script
    def get_job(self, job_id: str, con: sqlite3.Connection | None = None) -> FilmRecord | None:
        """Retrieve a complete film record for a given job ID."""
        with self.connect(readonly=True, con=con) as con:
            cur = con.cursor()
            cur.row_factory = sqlite3.Row

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

            names = {table: fetch_names(table, col) for table, col, _ in self.ENTITIES}
            return self.FilmRecord(
                job_id=row["job_id"],
                film_id=row["film_id"],
                title=row["title"],
                imdb_id=row["imdb_id"],
                released=row["released"],
                type=row["type"],
                runtime_minutes=row["runtime_minutes"],
                poster=row["poster"],
                job={k: row[k] for k in self.JobDetails.__annotations__},  # type: ignore
                actors=names["actors"],
                genres=names["genres"],
                directors=names["directors"],
                writers=names["writers"],
                languages=names["languages"],
                countries=names["countries"],
            )

    def get_recent_jobs(self, limit: int = 10, con: sqlite3.Connection | None = None) -> list[FilmRecord]:
        """Retrieve a list of recent film records, limited by the specified number of entries."""
        with self.connect(readonly=True, con=con) as con:
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

            return [record for job_id in job_ids if (record := self.get_job(job_id, con)) is not None]

    def update_film(self, film_id: int, title: str, released: str | None, type_: str | None, runtime_minutes: int | None, con: sqlite3.Connection | None = None):
        """Update a film's basic info (shared by all of its analyses) and its search row."""
        with self.connect(con=con) as con:
            cur = con.cursor()
            cur.execute(
                "UPDATE films SET title = ?, released = ?, type = ?, runtime_minutes = ? WHERE id = ?",
                (title, released, type_, runtime_minutes, film_id)
            )
            self._refresh_search(cur, film_id)

    def delete_job(self, job_id: str, con: sqlite3.Connection | None = None):
        """Delete a job. Its film (with links and search row) is removed by triggers once no other job uses it."""
        with self.connect(con=con) as con:
            con.execute("DELETE FROM analyzed_files WHERE job_id = ?", (job_id,))

    def record_failure(self, job_id: str, status: str, exit_code: int | None = None, failed_at: datetime | None = None, con: sqlite3.Connection | None = None):
        """Record a failed run (status FAILED or TIMEOUT, failed now unless failed_at is given) with the configuration from its metadata.json. A rerun of the same job replaces its row."""
        data = self.get_job_metadata(job_id)
        movie = data.get("movie", {})
        with self.connect(con=con) as con:
            self.create_db(con)  # the run may have failed before command_line_generator created the schema
            con.execute(
                """
              INSERT OR REPLACE INTO failed_runs
                  (job_id, slurm_job_id, status, exit_code, failed_at, submitted_at, uploader, title, imdb_id, video_filename, config)
              VALUES
                  (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              """,
                (
                    job_id,
                    data.get("slurmJobId"),
                    status,
                    exit_code,
                    (failed_at or datetime.now()).isoformat(timespec="seconds"),
                    data.get("submittedAt"),
                    data.get("config", {}).get("email", "").lower(),
                    movie.get("title"),
                    movie.get("imdb_id") or None,
                    data.get("videoFilename"),
                    json.dumps(data.get("config", {})),
                )
            )


class AdminDb(Db):
    """The admin database: the usernames allowed into the admin pages."""

    def __init__(self, path: Path | None = None):
        super().__init__(path or Path(require_env("ADMIN_DB_PATH")))

    # Admins when the table is first created (Bucknell usernames, from frontend/proxy.ts)
    INITIAL_ADMINS = ["efaden", "jtr029", "kp025", "lgom001", "jly006"]

    def create_db(self, con: sqlite3.Connection | None = None):
        """Create the admins table if it does not already exist, seeding it with INITIAL_ADMINS on first creation."""
        with self.connect(con=con) as con:
            new = not con.execute("SELECT 1 FROM sqlite_master WHERE name = 'admins'").fetchone()
            con.execute("CREATE TABLE IF NOT EXISTS admins (username TEXT PRIMARY KEY COLLATE NOCASE)")
            if new:
                con.executemany("INSERT INTO admins (username) VALUES (?)", [(u,) for u in self.INITIAL_ADMINS])

    def get_admins(self, con: sqlite3.Connection | None = None) -> list[str]:
        """All admin usernames, sorted."""
        with self.connect(readonly=True, con=con) as con:
            return [r[0] for r in con.execute("SELECT username FROM admins ORDER BY username")]

    def add_admin(self, username: str, con: sqlite3.Connection | None = None):
        """Add an admin. Usernames are stored lowercase, without @bucknell.edu."""
        with self.connect(con=con) as con:
            con.execute("INSERT OR IGNORE INTO admins (username) VALUES (?)", (username.strip().lower(),))

    def remove_admin(self, username: str, con: sqlite3.Connection | None = None):
        """Remove an admin."""
        with self.connect(con=con) as con:
            con.execute("DELETE FROM admins WHERE username = ?", (username.strip(),))

