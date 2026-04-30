import os
import argparse
import json
import sys
import numpy as np
from PIL import Image
import requests
import cv2 as cv

from datetime import datetime
from pathlib import Path

from database import *

try:
    from kalmus.barcodes.BarcodeGenerator import BarcodeGenerator
except ImportError:
    print("ERROR: KALMUS library not found. Please ensure it is installed in the Python environment.")
    sys.exit(1)

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

def write_duplicate_marker(output_dir, existing_job_id):
    duplicate_path = Path(output_dir) / "duplicate.json"
    with duplicate_path.open("w") as f:
        json.dump({
            "existing_job_id": existing_job_id,
            "detected_at": datetime.utcnow().isoformat() + "Z",
        }, f, indent=2)

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

def get_upload_metadata(video_path):
    cap = cv.VideoCapture(video_path)
    width = cap.get(cv.CAP_PROP_FRAME_WIDTH)
    height = cap.get(cv.CAP_PROP_FRAME_HEIGHT)
    fps = cap.get(cv.CAP_PROP_FPS)
    frame_count = cap.get(cv.CAP_PROP_FRAME_COUNT)
    cap.release()

    return {
        "width": width,
        "height": height,
        "fps": fps,
        "frame_count": frame_count,
    }

#NOTE: This assumes a 24fps true framerate
# We verify the framerate within +-2 fps
# We verify the length is within 10% of the expected runtime

def verify_upload_metadata(upload_metadata, expected_fps=24, expected_runtime_min=120):
    fps = upload_metadata.get("fps")
    frame_count = upload_metadata.get("frame_count")

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

def check_should_process(imdb_id, barcode_type, frame_type, metric):
    existing_job_id = find_existing_analysis(imdb_id, barcode_type, frame_type, metric)
    if existing_job_id and not args.force_reprocess:
        # NOTE: This prevents rerunning a film with the same parameters
        # This should not be an issue unless a film had issues with how it was ripped
        print(f"Equivalent analysis already exists for this movie/configuration: {existing_job_id}")
        write_duplicate_marker(args.output_dir, existing_job_id)
        return False
    
    return True

def generate_barcode(args):
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

    return barcode_obj

def save_barcode(barcode_obj, args, film_metadata, upload_metadata):
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
    movie_metadata = film_metadata.get("movie") or {}
    poster_path = download_poster(movie_metadata.get("poster_url"), args.output_dir)

    # Save to database
    add_to_db(args.job_id, film_metadata, upload_metadata, os.path.join(args.output_dir, "barcode.json"), poster_path)

    # Update search table
    update_search_table(args.job_id)

def validate_video(film_metadata, upload_metadata):
    runtime_raw = (((film_metadata.get("movie") or {}).get("raw") or {}).get("Runtime") or "").split()
    if runtime_raw:
        verify_upload_metadata(upload_metadata, 24, float(runtime_raw[0]))

def main(args=sys.argv[1:]):
    args = parse_args_into_dict(args=args)

    # Validate inputs
    if not os.path.exists(args.video_path):
        print(f"ERROR: Video file not found: {args.video_path}")
        sys.exit(1)

    # Create directories
    os.makedirs("/home/kalmus/kalmus/app/backend/databases", exist_ok=True)
    os.makedirs(args.output_dir, exist_ok=True)

    create_db()

    film_metadata = get_job_metadata(args.job_id)
    upload_metadata = get_upload_metadata(args.video_path)
    
    if not check_should_process((film_metadata.get("movie") or {}).get("imdb_id"),
                                film_metadata["config"]["barcode_type"].lower(),
                                film_metadata["config"]["frame_type"].lower(),
                                film_metadata["config"]["color_metric"].lower()):
        return 0

    print()
    print()
    print(f"Starting KALMUS processing...")
    print(f"Video: {args.video_path}")
    print(f"Output: {args.output_dir}")
    print()

    try:
        barcode_obj = generate_barcode(args)
        save_barcode(barcode_obj, args, film_metadata, upload_metadata)

        validate_video(film_metadata, upload_metadata)

        print()
        print("=" * 50)
        print("SUCCESS! Barcode generation completed.")
        print(f"Total frames processed: {barcode_obj.total_frames}")
        print(f"Film length: {barcode_obj.film_length_in_frames} frames")
        print(f"Barcode shape: {barcode_obj.get_barcode().shape}")
        print(f"Output saved to: {args.output_dir}")
        print("=" * 50)
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
    return 0


if __name__ == "__main__":
    sys.exit(main())
