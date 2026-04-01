import os
import argparse
import json
import sys
import numpy as np
from PIL import Image
import requests
import cv2 as cv

import sqlite3
from datetime import datetime
from pathlib import Path

try:
    from kalmus.barcodes.BarcodeGenerator import BarcodeGenerator
except ImportError:
    print("ERROR: KALMUS library not found. Please ensure it is installed in the Python environment.")
    sys.exit(1)

films_db = Path("/home/kalmus/kalmus/app/backend/databases/films.db")

THUMBNAIL_CAPTURE_INTERVAL_FRAMES = 24
THUMBNAIL_HEIGHT = 200
THUMBNAIL_SHEET_MAX_WIDTH = 4096
THUMBNAIL_SHEET_MAX_HEIGHT = 4096
THUMBNAIL_SHEET_QUALITY = 70

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
    parser.add_argument('--save-thumbnails', action='store_true', help='Capture hover-preview thumbnails')
    parser.add_argument('--force-reprocess', action='store_true', help='Allow reprocessing even if an equivalent analysis already exists')
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
    cur.execute(
        "CREATE TABLE IF NOT EXISTS countries (" \
        "id INTEGER PRIMARY KEY AUTOINCREMENT, " \
        "country TEXT NOT NULL" \
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
    cur.execute(
        "CREATE TABLE IF NOT EXISTS film_countries (" \
        "film_id TEXT, " \
        "country_id INTEGER, " \
        "PRIMARY KEY (film_id, country_id), " \
        "FOREIGN KEY (film_id) REFERENCES films(id), " \
        "FOREIGN KEY (country_id) REFERENCES countries(id)" \
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

def find_existing_analysis(imdb_id, barcode_type, frame_type, metric):
    if imdb_id is None:
        return None

    con = sqlite3.connect(films_db)
    cur = con.cursor()

    cur.execute(
        "SELECT films.id " \
        "FROM analyzed_files " \
        "JOIN films ON analyzed_files.film_id = films.id " \
        "WHERE films.imdb_id = ? " \
        "AND analyzed_files.barcode_type = ? " \
        "AND analyzed_files.frame_type = ? " \
        "AND analyzed_files.metric = ? " \
        "ORDER BY analyzed_files.process_date DESC " \
        "LIMIT 1" \
        ";", (imdb_id, barcode_type, frame_type, metric))
    row = cur.fetchone()

    con.close()

    return row[0] if row else None

def write_duplicate_marker(output_dir, existing_job_id):
    duplicate_path = Path(output_dir) / "duplicate.json"
    with duplicate_path.open("w") as f:
        json.dump({
            "existing_job_id": existing_job_id,
            "detected_at": datetime.utcnow().isoformat() + "Z",
        }, f, indent=2)

def update_search_table(film_id):
    con = sqlite3.connect(films_db)
    cur = con.cursor()

    cur.execute("""
INSERT INTO films_search (
    film_id, title, directors, actors, countries, genres, languages, writers, released
)
SELECT
    f.id,
    f.title,
    IFNULL((SELECT GROUP_CONCAT(DISTINCT d.director)
            FROM film_directors fd
            JOIN directors d ON fd.director_id = d.id
            WHERE fd.film_id = f.id), ''),
    IFNULL((SELECT GROUP_CONCAT(DISTINCT a.actor)
            FROM film_actors fa
            JOIN actors a ON fa.actor_id = a.id
            WHERE fa.film_id = f.id), ''),
    IFNULL((SELECT GROUP_CONCAT(DISTINCT c.country)
            FROM film_countries fc
            JOIN countries c ON fc.country_id = c.id
            WHERE fc.film_id = f.id), ''),
    IFNULL((SELECT GROUP_CONCAT(DISTINCT g.genre)
            FROM film_genres fg
            JOIN genres g ON fg.genre_id = g.id
            WHERE fg.film_id = f.id), ''),
    IFNULL((SELECT GROUP_CONCAT(DISTINCT l.language)
            FROM film_languages fl
            JOIN languages l ON fl.language_id = l.id
            WHERE fl.film_id = f.id), ''),
    IFNULL((SELECT GROUP_CONCAT(DISTINCT w.writer)
            FROM film_writers fw
            JOIN writers w ON fw.writer_id = w.id
            WHERE fw.film_id = f.id), ''),
    IFNULL(CAST(f.released AS TEXT), '')
FROM films f
WHERE f.id = ?;
""", (film_id,)
    )

    con.commit()
    con.close()

def add_to_db(job_id, data, json_loc, poster_loc):
    config = data.get("config")
    movie = data.get("movie") or {}
    raw = movie.get("raw") or {}
    
    title = movie.get("title")
    imdb_id = movie.get("imdb_id")
    type_ = raw.get("Type", "")

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

    cur.execute(
        "INSERT INTO films (id, title, imdb_id, released, type) VALUES (?, ?, ?, ?, ?)",
        (job_id, title, imdb_id, released, type_)
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
    for country in countries:
        country_id = insert_or_get_id("countries", "country", country)
        cur.execute("INSERT OR IGNORE INTO film_countries (film_id, country_id) VALUES (?, ?)", (job_id, country_id))

    process_date = datetime.now().date()

    cur.execute(
        "INSERT OR REPLACE INTO analyzed_files "
        "(film_id, json, poster, barcode_type, frame_type, metric, process_date) "
        "VALUES (?, ?, ?, ?, ?, ?, ?);",
        (job_id,
         json_loc,
         poster_loc,
         config.get("barcode_type").lower(),
         config.get("frame_type").lower(),
         config.get("color_metric").lower(),
         process_date)
    )
    
    con.commit()
    con.close()

def download_poster(url, save_dir):
    if not url:
        return None

    ext = ".jpg"
    if url.lower().endswith(".png"):
        ext = ".png"

    output_path = os.path.join(save_dir, f"poster{ext}")

    with requests.get(url, stream=True) as r:
        r.raise_for_status()
        with open(output_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
    
    return output_path

#NOTE: This assumes a 24fps true framerate
# We verify the framerate within +-2 fps
# We verify the length is within 10% of the expected runtime
def verify_video(video_path, expected_fps=24, expected_runtime_min=120):
    cap = cv.VideoCapture(video_path)
    fps = cap.get(cv.CAP_PROP_FPS)
    frame_count = cap.get(cv.CAP_PROP_FRAME_COUNT)
    cap.release()

    runtime = frame_count / fps if fps > 0 else 0
    if abs(fps - expected_fps) > 2:
        print(f"WARNING: Video framerate is {fps}, which is outside the expected range of {expected_fps - 2}-{expected_fps + 2} fps.")
    if abs(runtime - expected_runtime_min * 60) > expected_runtime_min * 60 * 0.1:  # 10% of expected runtime
        print(f"WARNING: Video length is {runtime} seconds, which is outside the expected range of {expected_runtime_min * 60 * 0.9}-{expected_runtime_min * 60 * 1.1} seconds.")

def _extract_thumbnail_frames(video_path, barcode_obj, start_frame, end_frame):
    cap = cv.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video for thumbnail extraction: {video_path}")

    fps = float(barcode_obj.fps) if barcode_obj.fps else None
    thumbnails = []

    try:
        for frame_index in range(start_frame, end_frame, THUMBNAIL_CAPTURE_INTERVAL_FRAMES):
            cap.set(cv.CAP_PROP_POS_FRAMES, frame_index)
            success, frame = cap.read()
            if not success:
                continue

            frame = barcode_obj.remove_letter_box_from_frame(frame)
            if frame is None or frame.size == 0:
                continue

            rgb_frame = cv.cvtColor(frame, cv.COLOR_BGR2RGB)
            frame_height, frame_width = rgb_frame.shape[:2]
            if frame_height <= 0 or frame_width <= 0:
                continue

            thumbnail_width = max(1, int(round(frame_width * (THUMBNAIL_HEIGHT / frame_height))))
            resized = cv.resize(
                rgb_frame,
                dsize=(thumbnail_width, THUMBNAIL_HEIGHT),
                interpolation=cv.INTER_AREA,
            )

            thumbnails.append({
                "frame_index": int(frame_index),
                "time_seconds": round(frame_index / fps, 3) if fps else None,
                "image": Image.fromarray(resized),
            })
    finally:
        cap.release()

    return thumbnails

def _write_thumbnail_sheets(thumbnails, output_dir):
    if not thumbnails:
        return {
            "sheets": [],
            "thumbnails": [],
        }

    sheets = []
    sheet_entries = []
    sheet_index = 0
    current_items = []
    cursor_x = 0
    cursor_y = 0
    row_height = 0
    sheet_width = 0

    def flush_sheet():
        nonlocal sheet_index, current_items, cursor_x, cursor_y, row_height, sheet_width
        if not current_items:
            return

        final_height = cursor_y + row_height
        filename = f"thumbnails_{sheet_index:03d}.webp"
        sprite = Image.new("RGB", (sheet_width, final_height))
        for item in current_items:
            sprite.paste(item["image"], (item["x"], item["y"]))

        sprite.save(
            os.path.join(output_dir, filename),
            format="WEBP",
            quality=THUMBNAIL_SHEET_QUALITY,
            method=6,
        )
        sheets.append({
            "index": sheet_index,
            "filename": filename,
            "width": sheet_width,
            "height": final_height,
        })

        sheet_index += 1
        current_items = []
        cursor_x = 0
        cursor_y = 0
        row_height = 0
        sheet_width = 0

    for thumb_index, thumb in enumerate(thumbnails):
        image = thumb["image"]
        thumb_width, thumb_height = image.size

        if thumb_width > THUMBNAIL_SHEET_MAX_WIDTH or thumb_height > THUMBNAIL_SHEET_MAX_HEIGHT:
            raise ValueError("Thumbnail dimensions exceed sprite sheet limits")

        if cursor_x + thumb_width > THUMBNAIL_SHEET_MAX_WIDTH:
            cursor_x = 0
            cursor_y += row_height
            row_height = 0

        if cursor_y + thumb_height > THUMBNAIL_SHEET_MAX_HEIGHT and current_items:
            flush_sheet()

        if cursor_x + thumb_width > THUMBNAIL_SHEET_MAX_WIDTH:
            raise ValueError("Thumbnail width exceeds available sprite sheet width")

        current_items.append({
            "image": image,
            "x": cursor_x,
            "y": cursor_y,
            "width": thumb_width,
            "height": thumb_height,
            "frame_index": thumb["frame_index"],
            "time_seconds": thumb["time_seconds"],
            "index": thumb_index,
            "sheet_index": sheet_index,
        })
        sheet_entries.append({
            "index": thumb_index,
            "frame_index": thumb["frame_index"],
            "time_seconds": thumb["time_seconds"],
            "sheet_index": sheet_index,
            "x": cursor_x,
            "y": cursor_y,
            "width": thumb_width,
            "height": thumb_height,
        })

        cursor_x += thumb_width
        row_height = max(row_height, thumb_height)
        sheet_width = max(sheet_width, cursor_x)

    flush_sheet()

    return {
        "sheets": sheets,
        "thumbnails": sheet_entries,
    }

def maybe_generate_thumbnail_manifest(video_path, barcode_obj, output_dir, start_frame, processed_frames):
    if processed_frames <= 0:
        return None

    end_frame = min(int(start_frame + processed_frames), int(barcode_obj.film_length_in_frames))
    extracted = _extract_thumbnail_frames(video_path, barcode_obj, int(start_frame), end_frame)
    if not extracted:
        return None

    packed = _write_thumbnail_sheets(extracted, output_dir)
    barcode_shape = list(barcode_obj.get_barcode().shape)
    manifest = {
        "version": 1,
        "enabled": True,
        "capture_interval_frames": THUMBNAIL_CAPTURE_INTERVAL_FRAMES,
        "thumbnail_height": THUMBNAIL_HEIGHT,
        "processed_frame_start": int(start_frame),
        "processed_frame_end": int(end_frame),
        "count": len(packed["thumbnails"]),
        "fps": float(barcode_obj.fps) if barcode_obj.fps else None,
        "barcode": {
            "width": int(barcode_shape[1]),
            "height": int(barcode_shape[0]),
        },
        "sheets": packed["sheets"],
        "thumbnails": packed["thumbnails"],
    }

    manifest_path = os.path.join(output_dir, "thumbnails.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    return manifest

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
    movie_metadata = metadata.get("movie") or {}
    existing_job_id = find_existing_analysis(movie_metadata.get("imdb_id"),
             metadata["config"]["barcode_type"].lower(),
             metadata["config"]["frame_type"].lower(),
             metadata["config"]["color_metric"].lower())
    if existing_job_id and not args.force_reprocess:
        # NOTE: This prevents rerunning a film with the same parameters
        # This should not be an issue unless a film had issues with how it was ripped
        print(f"Equivalent analysis already exists for this movie/configuration: {existing_job_id}")
        write_duplicate_marker(args.output_dir, existing_job_id)
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
            save_frames=False,
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
        img = Image.fromarray(barcode_data)
        img.save(image_path, 'PNG')

        thumbnail_manifest = None
        if args.save_thumbnails:
            print("Generating hover-preview thumbnails...")
            processed_source_frames = int(barcode_obj.total_frames * barcode_obj.sampled_frame_rate)
            thumbnail_manifest = maybe_generate_thumbnail_manifest(
                args.video_path,
                barcode_obj,
                args.output_dir,
                args.skip_over,
                processed_source_frames,
            )

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
            'frames_per_column': args.frames_per_column,
            'thumbnails_enabled': bool(thumbnail_manifest),
            'thumbnail_count': thumbnail_manifest["count"] if thumbnail_manifest else 0,
            'thumbnail_interval_frames': THUMBNAIL_CAPTURE_INTERVAL_FRAMES,
            'thumbnail_sheet_count': len(thumbnail_manifest["sheets"]) if thumbnail_manifest else 0,
        }

        with open(summary_path, 'w') as f:
            json.dump(summary, f, indent=2)

        # Download poster if present; missing poster metadata should not fail the job.
        movie_metadata = metadata.get("movie") or {}
        poster_path = download_poster(movie_metadata.get("poster_url"), args.output_dir)

        # Save to database
        add_to_db(args.job_id, metadata, os.path.join(args.output_dir, "barcode.json"), poster_path)

        # Update search table
        update_search_table(args.job_id)

        runtime_raw = ((movie_metadata.get("raw") or {}).get("Runtime") or "").split()
        if runtime_raw:
            verify_video(args.video_path, 24, float(runtime_raw[0]))

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
