"""
Fill in the film_map table for average, whole-frame colour-barcode jobs processed before it existed. Safe to re-run:
only jobs without a film_map row are computed.
"""


from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from database import *
from film_map import map_point


def main():
    create_db()  # adds the film_map table to older databases
    with DbConnection(readonly=True) as con:
        jobs = con.execute(
            "SELECT job_id, json, barcode_type, metric, frame_type FROM analyzed_files af "
            "WHERE barcode_type = 'color' AND metric = 'average' AND frame_type = 'whole_frame' AND json IS NOT NULL "
            "AND NOT EXISTS (SELECT 1 FROM film_map m WHERE m.job_id = af.job_id)"
        ).fetchall()

    # Compute before writing, so the database isn't locked while barcodes are parsed
    points = []
    for job_id, json_rel, barcode_type, metric, frame_type in jobs:
        try:
            primary_hue, lightness = map_point(str(RESULTS_DIR / json_rel), barcode_type, metric, frame_type)
        except ValueError as e:  # includes JSONDecodeError
            print(f"Skipping {job_id}: {e}")
            continue
        if lightness is None:
            print(f"Skipping {job_id}: no barcode colours")
            continue
        points.append((job_id, primary_hue, lightness))

    with DbConnection() as con:
        con.executemany("INSERT OR REPLACE INTO film_map (job_id, primary_hue, lightness) VALUES (?, ?, ?)", points)
    print(f"Updated {len(points)} jobs")


if __name__ == "__main__":
    main()
