import os
import argparse
import json
import sys
import numpy as np
from PIL import Image

import sqlite3
from datetime import datetime
from pathlib import Path

try:
    from kalmus.barcodes.BarcodeGenerator import BarcodeGenerator
except ImportError:
    print("ERROR: KALMUS library not found. Please ensure it is installed in the Python environment.")
    sys.exit(1)

films_db = Path("/home/kalmus/kalmus/app/backend/databases/films.db")

def parse_args_into_dict(args):
    parser = argparse.ArgumentParser(description='Generate movie barcode using KALMUS')
    parser.add_argument('--video-path', required=True, help='Path to input video file')
    parser.add_argument('--output-dir', required=True, help='Directory for output files')
    parser.add_argument('--color-metric', default='Average', help='Color metric to use')
    parser.add_argument('--frame-type', default='Whole_frame', help='Frame type to analyze')
    parser.add_argument('--barcode-type', default='Color', help='Type of barcode (Color or Brightness)')
    parser.add_argument('--sampled-rate', type=int, default=2, help='Frame sampling rate')
    parser.add_argument('--skip-over', type=int, default=0, help='Number of frames to skip at start')
    parser.add_argument('--total-frames', type=int, default=100000000, help='Maximum frames to process')
    parser.add_argument('--frames-per-column', type=int, default=50, help='Frames per column in barcode')
    parser.add_argument('--job-id', required=True, help='Unique job identifier')
    return parser.parse_args(args)

def create_db():
    con = sqlite3.connect(films_db)
    cur = con.cursor()

    # Main table, contains references to other tables
    cur.execute(
        "CREATE TABLE IF NOT EXISTS films (" \
        "id TEXT PRIMARY KEY, " \
        "title TEXT NOT NULL, " \
        "imdb_id TEXT, " \
        "released DATE, " \
        "country TEXT, " \
        "type TEXT" \
        ");"
    )
    
    # Entity tables
    cur.execute(
        "CREATE TABLE IF NOT EXISTS genres (" \
        "id INTEGER PRIMARY KEY AUTOINCREMENT, " \
        "genre TEXT NOT NULL" \
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS directors (" \
        "id INTEGER PRIMARY KEY AUTOINCREMENT, " \
        "director TEXT NOT NULL" \
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS writers (" \
        "id INTEGER PRIMARY KEY AUTOINCREMENT, " \
        "writer TEXT NOT NULL" \
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS actors (" \
        "id INTEGER PRIMARY KEY AUTOINCREMENT, " \
        "actor TEXT NOT NULL" \
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS languages (" \
        "id INTEGER PRIMARY KEY AUTOINCREMENT, " \
        "language TEXT NOT NULL" \
        ");"
    )

    # Many-to-many mappings
    cur.execute(
        "CREATE TABLE IF NOT EXISTS film_genres (" \
        "film_id TEXT, " \
        "genre_id INTEGER, " \
        "PRIMARY KEY (film_id, genre_id), " \
        "FOREIGN KEY (film_id) REFERENCES films(id), " \
        "FOREIGN KEY (genre_id) REFERENCES genres(id)" \
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS film_directors (" \
        "film_id TEXT, " \
        "director_id INTEGER, " \
        "PRIMARY KEY (film_id, director_id), " \
        "FOREIGN KEY (film_id) REFERENCES films(id), " \
        "FOREIGN KEY (director_id) REFERENCES directors(id)" \
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS film_writers (" \
        "film_id TEXT, " \
        "writer_id INTEGER, " \
        "PRIMARY KEY (film_id, writer_id), " \
        "FOREIGN KEY (film_id) REFERENCES films(id), " \
        "FOREIGN KEY (writer_id) REFERENCES writers(id)" \
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS film_actors (" \
        "film_id TEXT, " \
        "actor_id INTEGER, " \
        "PRIMARY KEY (film_id, actor_id), " \
        "FOREIGN KEY (film_id) REFERENCES films(id), " \
        "FOREIGN KEY (actor_id) REFERENCES actors(id)" \
        ");"
    )
    cur.execute(
        "CREATE TABLE IF NOT EXISTS film_languages (" \
        "film_id TEXT, " \
        "language_id INTEGER, " \
        "PRIMARY KEY (film_id, language_id), " \
        "FOREIGN KEY (film_id) REFERENCES films(id), " \
        "FOREIGN KEY (language_id) REFERENCES languages(id)" \
        ");"
    )

    # Analyzed films
    cur.execute(
        "CREATE TABLE IF NOT EXISTS analyzed_files (" \
        "film_id TEXT PRIMARY KEY, " \
        "json TEXT, " \
        "barcode_type TEXT NOT NULL, " \
        "frame_type TEXT NOT NULL, " \
        "metric TEXT NOT NULL, " \
        "process_date DATE NOT NULL, " \
        "FOREIGN KEY (film_id) REFERENCES films(id)" \
        ");"
    )

    con.commit()
    con.close()

def get_metadata(job_id):
    metadata_path = Path(f'/home/kalmus/kalmus/results/{job_id}/metadata.json')
    with metadata_path.open("r") as f:
        data = json.load(f)
    return data

def in_db(imdb_id, barcode_type, frame_type, metric):
    if imdb_id is None:
        return False

    con = sqlite3.connect(films_db)
    cur = con.cursor()

    cur.execute(
        "SELECT 1 " \
        "FROM analyzed_files " \
        "JOIN films ON analyzed_files.film_id = films.id " \
        "WHERE films.imdb_id = ? " \
        "AND analyzed_files.barcode_type = ? " \
        "AND analyzed_files.frame_type = ? " \
        "AND analyzed_files.metric = ? " \
        "LIMIT 1" \
        ";", (imdb_id, barcode_type, frame_type, metric))
    exists = cur.fetchone() is not None

    con.close()

    return exists

def add_to_db(job_id, data, json_loc):
    config = data.get("config")
    movie = data.get("movie")
    raw = movie.get("raw")
    
    title = movie.get("title")
    imdb_id = movie.get("imdb_id")
    country = raw.get("Country", "") if raw else ""
    type_ = raw.get("Type", "") if raw else ""

    released_raw = raw.get("Released") if raw else ""
    released = ""
    if released_raw and released_raw != "N/A":
        try:
            released = datetime.strptime(released_raw, "%d %b %Y").date()
        except ValueError:
            released = ""

    genres = [g.strip() for g in movie.get("genre", "").split(",") if g and g != "N/A"]
    directors = [d.strip() for d in movie.get("director", "").split(",") if d and d != "N/A"]
    writers = [w.strip() for w in (raw.get("Writer", "") if raw else "").split(",") if w and w != "N/A"]
    actors = [a.strip() for a in (raw.get("Actors", "") if raw else "").split(",") if a and a != "N/A"]
    languages = [l.strip() for l in (raw.get("Language", "") if raw else "").split(",") if l and l != "N/A"]


    con = sqlite3.connect(films_db)
    cur = con.cursor()

    cur.execute(
        "INSERT INTO films (id, title, imdb_id, released, country, type) VALUES (?, ?, ?, ?, ?, ?)",
        (job_id, title, imdb_id, released, country, type_)
    )

    def insert_or_get_id(table, column, value):
        cur.execute(f"SELECT id FROM {table} WHERE {column} = ?", (value,))
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute(f"INSERT INTO {table} ({column}) VALUES (?)", (value,))
        return cur.lastrowid

    for genre in genres:
        genre_id = insert_or_get_id("genres", "genre", genre)
        cur.execute("INSERT OR IGNORE INTO film_genres (film_id, genre_id) VALUES (?, ?)", (job_id, genre_id))
    for director in directors:
        director_id = insert_or_get_id("directors", "director", director)
        cur.execute("INSERT OR IGNORE INTO film_directors (film_id, director_id) VALUES (?, ?)", (job_id, director_id))
    for writer in writers:
        writer_id = insert_or_get_id("writers", "writer", writer)
        cur.execute("INSERT OR IGNORE INTO film_writers (film_id, writer_id) VALUES (?, ?)", (job_id, writer_id))
    for actor in actors:
        actor_id = insert_or_get_id("actors", "actor", actor)
        cur.execute("INSERT OR IGNORE INTO film_actors (film_id, actor_id) VALUES (?, ?)", (job_id, actor_id))
    for language in languages:
        language_id = insert_or_get_id("languages", "language", language)
        cur.execute("INSERT OR IGNORE INTO film_languages (film_id, language_id) VALUES (?, ?)", (job_id, language_id))

    process_date = datetime.now().date()

    cur.execute(
        "INSERT OR REPLACE INTO analyzed_files "
        "(film_id, json, barcode_type, frame_type, metric, process_date) "
        "VALUES (?, ?, ?, ?, ?, ?);",
        (job_id,
         json_loc,
         config.get("barcode_type").lower(),
         config.get("frame_type").lower(),
         config.get("color_metric").lower(),
         process_date)
    )

    con.commit()
    con.close()

def main(args=sys.argv[1:]):
    args = parse_args_into_dict(args=args)

    # Validate inputs
    if not os.path.exists(args.video_path):
        print(f"ERROR: Video file not found: {args.video_path}")
        sys.exit(1)

    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)

    create_db()

    metadata = get_metadata(args.job_id)
    if in_db(metadata.get("movie").get("imdb_id"),
             metadata["config"]["barcode_type"].lower(),
             metadata["config"]["frame_type"].lower(),
             metadata["config"]["color_metric"].lower()):
        # TODO: Return file to frontend
        # This might need to happen before a new file is uploaded
        # We create a new job_id when uploaded
        # Maybe send a request to check if in database first
        # Then if we do not have it, send a request to process a film
        return 0

    print()
    print()
    print(f"Starting KALMUS processing...")
    print(f"Video: {args.video_path}")
    print(f"Output: {args.output_dir}")
    print()

    try:
        # Registered types
        import kalmus.barcodes
        import kalmus.frames
        import kalmus.metrics

        print("Initializing BarcodeGenerator...")
        generator = BarcodeGenerator(
            color_metric=args.color_metric,
            frame_type=args.frame_type,
            barcode_type=args.barcode_type,
            skip_over=args.skip_over,
            sampled_frame_rate=args.sampled_rate,
            total_frames=args.total_frames
        )

        print("Generating barcode (this may take several minutes)...")
        generator.generate_barcode(
            video_file_path=args.video_path,
            num_thread=4,  # Use 4 threads as specified in SLURM script
            save_frames=False,  # Don't save individual frames to keep storage minimal
            # save_frames_rate=1,
            # rescale_frames_factor=1
        )

        print("Processing barcode data...")
        barcode_obj = generator.get_barcode()

        # Reshape barcode for visualization
        barcode_obj.reshape_barcode(frames_per_column=args.frames_per_column)

        # Save as JSON
        json_path = os.path.join(args.output_dir, 'barcode.json')
        print(f"Saving barcode to {json_path}...")
        barcode_obj.save_as_json(filename=json_path)

        # Save as PNG image for email attachment
        image_path = os.path.join(args.output_dir, 'barcode.png')
        print(f"Saving barcode image to {image_path}...")

        # Get barcode data as numpy array
        barcode_data = barcode_obj.get_barcode()

        # Convert to uint8 if needed (KALMUS uses float values 0-255)
        if barcode_data.dtype != np.uint8:
            barcode_data = barcode_data.astype(np.uint8)

        # Create PIL Image and save as PNG
        print(barcode_data)
        img = Image.fromarray(barcode_data)
        img.save(image_path, 'PNG')

        # Also save a summary with metadata
        summary_path = os.path.join(args.output_dir, 'summary.json')
        summary = {
            'job_id': args.job_id,
            'video_path': args.video_path,
            'total_frames': int(barcode_obj.total_frames),
            'film_length_in_frames': int(barcode_obj.film_length_in_frames),
            'barcode_shape': list(barcode_obj.get_barcode().shape),
            'color_metric': args.color_metric,
            'frame_type': args.frame_type,
            'barcode_type': args.barcode_type,
            'sampled_frame_rate': args.sampled_rate,
            'frames_per_column': args.frames_per_column
        }

        with open(summary_path, 'w') as f:
            json.dump(summary, f, indent=2)

        # Save to Database
        add_to_db(args.job_id, metadata, os.path.join(args.output_dir, "barcode.json"))

        print()
        print("=" * 50)
        print("SUCCESS! Barcode generation completed.")
        print(f"Total frames processed: {barcode_obj.total_frames}")
        print(f"Film length: {barcode_obj.film_length_in_frames} frames")
        print(f"Barcode shape: {barcode_obj.get_barcode().shape}")
        print(f"Output saved to: {args.output_dir}")
        print("=" * 50)

        return 0

    except Exception as e:
        print()
        print("=" * 50)
        print("ERROR: Barcode generation failed!")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        print("=" * 50)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())