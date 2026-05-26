from typing import TypedDict

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
    from kalmus.barcodes.Barcode import Barcode
except ImportError:
    print("ERROR: KALMUS library not found. Please ensure it is installed in the Python environment.")
    sys.exit(1)

THUMBNAIL_CAPTURE_INTERVAL_FRAMES = 24
THUMBNAIL_HEIGHT = 200
THUMBNAIL_SHEET_MAX_WIDTH = 4096
THUMBNAIL_SHEET_MAX_HEIGHT = 4096
THUMBNAIL_SHEET_QUALITY = 70


class Thumbnail(TypedDict):
    """
    Data structure representing a thumbnail image extracted from the video, along with its corresponding frame index and timestamp.
    """
    frame_index: int
    time_seconds: float | None
    image: Image.Image


class ThumbnailSheet(TypedDict):
    """Data structure representing a sprite sheet containing multiple thumbnail images, along with metadata about the sheet."""
    index: int
    filename: str
    width: int
    height: int


class ThumbnailSheetEntry(TypedDict):
    """Data structure representing the position and metadata of a single thumbnail within a sprite sheet."""
    image: NotRequired[Image.Image]
    index: int
    frame_index: int
    time_seconds: float | None
    sheet_index: int
    x: int
    y: int
    width: int
    height: int


class ThumbnailManifest(TypedDict):
    """Data structure representing the manifest for hover-preview thumbnails."""
    version: int
    enabled: bool
    capture_interval_frames: int
    thumbnail_height: int
    processed_frame_start: int
    processed_frame_end: int
    count: int
    fps: float | None
    barcode: dict[str, int]
    sheets: list[ThumbnailSheet]
    thumbnails: list[ThumbnailSheetEntry]


class BarcodeSummary(TypedDict):
    job_id: str
    video_path: str
    total_frames: int
    film_length_in_frames: int
    barcode_shape: list[int]
    color_metric: str
    frame_type: str
    barcode_type: str
    sampled_frame_rate: int
    frames_per_column: int
    thumbnails_enabled: bool
    thumbnail_count: int
    thumbnail_interval_frames: int
    thumbnail_sheet_count: int


def parse_args_into_dict(args: list[str]) -> argparse.Namespace:
    """Helper function to parse command line arguments into a dictionary"""
    parser = argparse.ArgumentParser(
        description='Generate movie barcode using KALMUS')
    parser.add_argument('--video-path', required=True,
                        help='Path to input video file')
    parser.add_argument('--output-dir', required=True,
                        help='Directory for output files')
    parser.add_argument('--color-metric', default='Average',
                        help='Color metric to use')
    parser.add_argument('--frame-type', default='Whole_frame',
                        help='Frame type to analyze')
    parser.add_argument('--barcode-type', default='Color',
                        help='Type of barcode (Color or Brightness)')
    parser.add_argument('--sampled-rate', type=int,
                        default=2, help='Frame sampling rate')
    parser.add_argument('--skip-over', type=int, default=0,
                        help='Number of frames to skip at start')
    parser.add_argument('--total-frames', type=int,
                        default=100000000, help='Maximum frames to process')
    parser.add_argument('--frames-per-column', type=int,
                        default=50, help='Frames per column in barcode')
    parser.add_argument('--save-thumbnails', action='store_true',
                        help='Capture hover-preview thumbnails')
    parser.add_argument('--force-reprocess', action='store_true',
                        help='Allow reprocessing even if an equivalent analysis already exists')
    parser.add_argument('--job-id', required=True,
                        help='Unique job identifier')
    return parser.parse_args(args)


def write_duplicate_marker(output_dir: str, existing_job_id: str):
    """Helper function to write a marker file when a duplicate analysis is detected. This can be used for debugging and tracking purposes."""
    duplicate_path = Path(output_dir) / "duplicate.json"
    with duplicate_path.open("w") as f:
        json.dump({
            "existing_job_id": existing_job_id,
            "detected_at": datetime.now().isoformat() + "Z",
        }, f, indent=2)


def download_poster(url: str | None, save_dir: str) -> str:
    """Helper function to download a poster image from a URL and save it to the specified directory. Returns the path to the saved poster or an empty string if download fails."""
    if not url:
        return ""

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


def get_upload_metadata(video_path: str) -> UploadMetadata:
    """Helper function to extract metadata from the uploaded video file, such as width, height, fps, and frame count. This information can be used for validation and stored in the database."""
    cap = cv.VideoCapture(video_path)
    width = int(cap.get(cv.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv.CAP_PROP_FRAME_HEIGHT))
    fps = float(cap.get(cv.CAP_PROP_FPS))
    frame_count = int(cap.get(cv.CAP_PROP_FRAME_COUNT))
    cap.release()

    return UploadMetadata(
        width=width,
        height=height,
        fps=fps,
        frame_count=frame_count,
    )


def verify_upload_metadata(upload_metadata: UploadMetadata, expected_fps: float = 24, expected_runtime_min: int = 120):
    """
    Helper function to verify that the uploaded video metadata matches expected values based on the film's known properties.

    This can help catch issues with incorrectly ripped videos or mismatches between the video and the film metadata.
    This method assumes a true framerate of 24fps, which is common for films. It checks that the actual framerate is within +-2 fps of this expected value.
    It also checks that the runtime (calculated from frame count and fps) is within 10% of the expected runtime based on the film's known length.
    """
    fps = upload_metadata.get("fps")
    frame_count = upload_metadata.get("frame_count")

    runtime = frame_count / fps if fps > 0 else 0
    if abs(fps - expected_fps) > 2:
        print(
            f"WARNING: Video framerate is {fps}, which is outside the expected range of {expected_fps - 2}-{expected_fps + 2} fps.")
    if abs(runtime - expected_runtime_min * 60) > expected_runtime_min * 60 * 0.1:  # 10% of expected runtime
        print(
            f"WARNING: Video length is {runtime} seconds, which is outside the expected range of {expected_runtime_min * 60 * 0.9}-{expected_runtime_min * 60 * 1.1} seconds.")


def _extract_thumbnail_frames(video_path: str, barcode_obj: Barcode, start_frame: int, end_frame: int) -> list[Thumbnail]:
    """
    Helper function to extract thumbnail frames from the video at regular intervals.

    It captures frames, removes letterboxing, resizes them, and returns a list of thumbnail data including frame index and timestamp.
    """
    cap = cv.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(
            f"Could not open video for thumbnail extraction: {video_path}")

    fps = float(barcode_obj.fps) if barcode_obj.fps else None  # type: ignore
    thumbnails: list[Thumbnail] = []

    try:
        for frame_index in range(start_frame, end_frame, THUMBNAIL_CAPTURE_INTERVAL_FRAMES):
            cap.set(cv.CAP_PROP_POS_FRAMES, frame_index)
            success, frame = cap.read()  # type: ignore
            if not success:
                continue

            frame: cv.Mat = barcode_obj.remove_letter_box_from_frame(  # type: ignore
                frame)
            if frame is None or frame.size == 0:  # type: ignore
                continue

            rgb_frame: cv.Mat = cv.cvtColor(
                frame, cv.COLOR_BGR2RGB)  # type: ignore
            frame_height, frame_width = rgb_frame.shape[:2]
            if frame_height <= 0 or frame_width <= 0:
                continue

            thumbnail_width = max(
                1, int(round(frame_width * (THUMBNAIL_HEIGHT / frame_height))))
            resized = cv.resize(
                rgb_frame,
                dsize=(thumbnail_width, THUMBNAIL_HEIGHT),
                interpolation=cv.INTER_AREA,
            )

            thumbnails.append(Thumbnail(
                frame_index=int(frame_index),
                time_seconds=round(frame_index / fps, 3) if fps else None,
                image=Image.fromarray(resized),
            ))
    finally:
        cap.release()

    return thumbnails


def _write_thumbnail_sheets(thumbnails: list[Thumbnail], output_dir: str) -> dict[str, list[ThumbnailSheet] | list[ThumbnailSheetEntry]]:
    if not thumbnails:
        return {
            "sheets": [],
            "thumbnails": [],
        }

    sheets: list[ThumbnailSheet] = []
    sheet_entries: list[ThumbnailSheetEntry] = []
    sheet_index = 0
    current_items: list[ThumbnailSheetEntry] = []
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
            sprite.paste(item["image"], (item["x"], item["y"]))  # type: ignore

        sprite.save(
            os.path.join(output_dir, filename),
            format="WEBP",
            quality=THUMBNAIL_SHEET_QUALITY,
            method=6,
        )
        sheets.append(ThumbnailSheet(
            index=sheet_index,
            filename=filename,
            width=sheet_width,
            height=final_height,
        ))

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
            raise ValueError(
                "Thumbnail width exceeds available sprite sheet width")

        current_items.append(ThumbnailSheetEntry(
            image=image,
            x=cursor_x,
            y=cursor_y,
            width=thumb_width,
            height=thumb_height,
            frame_index=thumb["frame_index"],
            time_seconds=thumb["time_seconds"],
            index=thumb_index,
            sheet_index=sheet_index,
        ))
        sheet_entries.append(ThumbnailSheetEntry(
            x=cursor_x,
            y=cursor_y,
            width=thumb_width,
            height=thumb_height,
            frame_index=thumb["frame_index"],
            time_seconds=thumb["time_seconds"],
            index=thumb_index,
            sheet_index=sheet_index,
        ))

        cursor_x += thumb_width
        row_height = max(row_height, thumb_height)
        sheet_width = max(sheet_width, cursor_x)

    flush_sheet()

    return {
        "sheets": sheets,
        "thumbnails": sheet_entries,
    }


def maybe_generate_thumbnail_manifest(video_path: str, barcode_obj: Barcode, output_dir: str, start_frame: int, processed_frames: int) -> ThumbnailManifest | None:
    if processed_frames <= 0:
        return None

    end_frame = min(int(start_frame + processed_frames),
                    int(barcode_obj.film_length_in_frames))  # type: ignore
    extracted = _extract_thumbnail_frames(
        video_path, barcode_obj, int(start_frame), end_frame)
    if not extracted:
        return None

    packed = _write_thumbnail_sheets(extracted, output_dir)
    barcode_shape = list(barcode_obj.get_barcode().shape)  # type: ignore
    manifest = ThumbnailManifest(
        version=1,
        enabled=True,
        capture_interval_frames=THUMBNAIL_CAPTURE_INTERVAL_FRAMES,
        thumbnail_height=THUMBNAIL_HEIGHT,
        processed_frame_start=int(start_frame),
        processed_frame_end=int(end_frame),
        count=len(packed["thumbnails"]),
        fps=(float(barcode_obj.fps) if barcode_obj.fps else None),  # type: ignore
        barcode={
            "width": int(barcode_shape[1]),  # type: ignore
            "height": int(barcode_shape[0]),  # type: ignore
        },
        sheets=packed["sheets"],  # type: ignore
        thumbnails=packed["thumbnails"],  # type: ignore
    )

    manifest_path = os.path.join(output_dir, "thumbnails.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    return manifest


def check_should_process(
    imdb_id: str | None,
    barcode_type: str,
    frame_type: str,
    metric: str,
    *,
    force_reprocess: bool,
    output_dir: str,
) -> bool:
    existing_job_id = find_existing_analysis(
        imdb_id, barcode_type, frame_type, metric)
    if existing_job_id and not force_reprocess:
        # NOTE: This prevents rerunning a film with the same parameters
        # This should not be an issue unless a film had issues with how it was ripped
        print(
            f"Equivalent analysis already exists for this movie/configuration: {existing_job_id}")
        write_duplicate_marker(
            output_dir, existing_job_id)
        return False

    return True


def generate_barcode(args: argparse.Namespace) -> Barcode:
    # Registered types
    import kalmus.barcodes  # type: ignore
    import kalmus.frames  # type: ignore
    import kalmus.metrics  # type: ignore

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
    generator.generate_barcode(  # type: ignore
        video_file_path=args.video_path,
        num_thread=4,  # Use 4 threads as specified in SLURM script
        save_frames=False,
    )

    print("Processing barcode data...")
    barcode_obj: Barcode = generator.get_barcode()  # type: ignore

    # Reshape barcode for visualization
    barcode_obj.reshape_barcode(  # type: ignore
        frames_per_column=args.frames_per_column)

    return barcode_obj  # type: ignore


def save_barcode(barcode_obj: Barcode, args: argparse.Namespace, film_metadata: Job, upload_metadata: UploadMetadata):
    # Save as JSON
    json_path = os.path.join(args.output_dir, 'barcode.json')
    print(f"Saving barcode to {json_path}...")
    barcode_obj.save_as_json(filename=json_path)  # type: ignore

    # Save as PNG image for email attachment
    image_path = os.path.join(args.output_dir, 'barcode.png')
    print(f"Saving barcode image to {image_path}...")

    # Get barcode data as numpy array
    barcode_data = barcode_obj.get_barcode()  # type: ignore

    # Convert to uint8 if needed (KALMUS uses float values 0-255)
    if barcode_data.dtype != np.uint8:  # type: ignore
        barcode_data = barcode_data.astype(np.uint8)  # type: ignore

    # Create PIL Image and save as PNG
    img = Image.fromarray(barcode_data)  # type: ignore
    img.save(image_path, 'PNG')

    thumbnail_manifest = None
    if args.save_thumbnails:
        print("Generating hover-preview thumbnails...")
        processed_source_frames = int(
            barcode_obj.total_frames * barcode_obj.sampled_frame_rate)  # type: ignore
        thumbnail_manifest = maybe_generate_thumbnail_manifest(
            args.video_path,
            barcode_obj,
            args.output_dir,
            args.skip_over,
            processed_source_frames,
        )

    # Also save a summary with metadata
    summary_path = os.path.join(args.output_dir, 'summary.json')
    summary = BarcodeSummary(
        job_id=args.job_id,
        video_path=args.video_path,
        total_frames=int(barcode_obj.total_frames),  # type: ignore
        film_length_in_frames=(int(
            barcode_obj.film_length_in_frames)),  # type: ignore
        barcode_shape=list(barcode_obj.get_barcode().shape),  # type: ignore
        color_metric=args.color_metric,
        frame_type=args.frame_type,
        barcode_type=args.barcode_type,
        sampled_frame_rate=args.sampled_rate,
        frames_per_column=args.frames_per_column,
        thumbnails_enabled=bool(thumbnail_manifest),
        thumbnail_count=thumbnail_manifest["count"] if thumbnail_manifest else 0,
        thumbnail_interval_frames=THUMBNAIL_CAPTURE_INTERVAL_FRAMES,
        thumbnail_sheet_count=len(
            thumbnail_manifest["sheets"]) if thumbnail_manifest else 0,
    )

    with open(summary_path, 'w') as f:
        json.dump(summary, f, indent=2)

    # Download poster if present; missing poster metadata should not fail the job.
    movie_metadata = film_metadata.get("movie")

    poster_path = download_poster(
        movie_metadata.get("poster_url"), args.output_dir)

    # Save to database
    upsert_job(args.job_id, film_metadata,
               upload_metadata, json_path, poster_path)

    # Update search table
    update_search_table(args.job_id)


def validate_video(film_metadata: Job, upload_metadata: UploadMetadata):
    movie = film_metadata.get("movie")
    raw = movie.get("raw")
    if not raw:
        print("No raw movie metadata available for validation.")
        return
    runtime_raw = (raw.get("Runtime")).split()
    if runtime_raw:
        verify_upload_metadata(upload_metadata, 24, int(runtime_raw[0]))


def main(args: list[str] = sys.argv[1:]) -> int:
    parsed = parse_args_into_dict(args=args)

    # Validate inputs
    if not os.path.exists(parsed.video_path):
        print(f"ERROR: Video file not found: {parsed.video_path}")
        sys.exit(1)

    # Create directories
    os.makedirs("/home/kalmus/kalmus/app/databases", exist_ok=True)
    os.makedirs(parsed.output_dir, exist_ok=True)

    create_db()

    film_metadata = get_job_metadata(parsed.job_id)
    upload_metadata = get_upload_metadata(parsed.video_path)

    if not check_should_process(film_metadata.get("movie").get("imdb_id"),
                                film_metadata["config"]["barcode_type"].lower(),
                                film_metadata["config"]["frame_type"].lower(),
                                film_metadata["config"]["color_metric"].lower(),
                                force_reprocess=parsed.force_reprocess,
                                output_dir=parsed.output_dir):
        return 0

    print()
    print()
    print(f"Starting KALMUS processing...")
    print(f"Video: {parsed.video_path}")
    print(f"Output: {parsed.output_dir}")
    print()

    try:
        barcode_obj = generate_barcode(parsed)
        save_barcode(barcode_obj, parsed, film_metadata, upload_metadata)

        validate_video(film_metadata, upload_metadata)

        print()
        print("=" * 50)
        print("SUCCESS! Barcode generation completed.")
        print("Total frames processed: "
              f"{barcode_obj.total_frames}")  # type: ignore
        print("Film length: "
              f"{barcode_obj.film_length_in_frames} frames")  # type: ignore
        print("Barcode shape: "
              f"{barcode_obj.get_barcode().shape}")  # type: ignore
        print(f"Output saved to: {parsed.output_dir}")
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
