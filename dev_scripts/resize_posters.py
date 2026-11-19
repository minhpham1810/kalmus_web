"""
Resize every stored poster (RESULTS_DIR/<job_id>/poster.jpg or .png) to 80x120, so only that size is kept.
Safe to re-run: posters already at 80x120 are left alone.
"""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from database import FilmsDb
from poster import resize_poster


def main():
    results_dir = FilmsDb().results_dir
    resized = 0
    for path in sorted(results_dir.glob("*/poster.*")):
        try:
            if resize_poster(str(path)):
                resized += 1
        except OSError as e:  # unreadable or not an image
            print(f"Skipping {path}: {e}")
    print(f"Resized {resized} poster(s)")


if __name__ == "__main__":
    main()
