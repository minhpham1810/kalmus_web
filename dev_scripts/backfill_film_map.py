"""
Fill in the film_map table for average, whole-frame color-barcode jobs processed before it (or its palette
columns, display histogram or dominant-hue frame) existed. Safe to re-run: only jobs missing any of those are
computed.
"""


from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from database import FilmsDb
from film_map import HUE_FRAME, INSERT_FILM_MAP, film_map_row, map_point

films = FilmsDb()


def main():
    films.create_db()  # adds the film_map table and its palette columns to older databases
    with films.connect(readonly=True) as con:
        jobs = con.execute(
            "SELECT job_id, json, barcode_type, metric, frame_type, m.mean_hue, m.display_hist FROM analyzed_files af "
            "LEFT JOIN film_map m USING (job_id) "
            "WHERE barcode_type = 'color' AND metric = 'average' AND frame_type = 'whole_frame' AND json IS NOT NULL"
        ).fetchall()

    # Compute before writing, so the database isn't locked while barcodes are parsed
    points = []
    for job_id, json_rel, barcode_type, metric, frame_type, mean_hue, shown in jobs:
        json_loc = films.results_dir / json_rel
        # B/W films never get a mean_hue or frame, so they are recomputed each run; there are few and it's cheap
        if mean_hue is not None and shown is not None and (json_loc.parent / HUE_FRAME).exists():
            continue
        try:
            features = map_point(str(json_loc), barcode_type, metric, frame_type)
        except ValueError as e:  # includes JSONDecodeError
            print(f"Skipping {job_id}: {e}")
            continue
        if features is None:
            print(f"Skipping {job_id}: no barcode colors")
            continue
        points.append(film_map_row(job_id, features))

    with films.connect() as con:
        con.executemany(INSERT_FILM_MAP, points)
    print(f"Updated {len(points)} jobs")


if __name__ == "__main__":
    main()
