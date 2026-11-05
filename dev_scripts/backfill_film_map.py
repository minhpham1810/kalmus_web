"""
Fill in the film_map table for average, whole-frame color-barcode jobs processed before it (or its palette
columns or dominant-hue frame) existed. Safe to re-run: only jobs missing any of those are
computed.

--rebuild recomputes every job and replaces the whole table (and every dominant-hue frame), keeping the most
recently processed job of each film and edition. Jobs whose barcode can't be read drop off the map.
"""


from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from database import FilmsDb
from film_map import HUE_FRAME, INSERT_FILM_MAP, film_map_row, map_point

films = FilmsDb()


def main(rebuild: bool = False):
    films.create_db()  # adds the film_map table and its palette columns to older databases
    with films.connect(readonly=True) as con:
        jobs = con.execute(
            "SELECT job_id, json, barcode_type, metric, frame_type, m.mean_hue FROM analyzed_files af "
            "LEFT JOIN film_map m USING (job_id) "
            "WHERE barcode_type = 'color' AND metric = 'average' AND frame_type = 'whole_frame' AND json IS NOT NULL "
            # Newest first: INSERT_FILM_MAP keeps the first job of each film and edition
            "ORDER BY af.process_date DESC, af.job_id DESC"
        ).fetchall()

    # Compute before writing, so the database isn't locked while barcodes are parsed
    points = []
    for job_id, json_rel, barcode_type, metric, frame_type, mean_hue in jobs:
        json_loc = films.results_dir / json_rel
        # B/W films never get a mean_hue or frame, so they are recomputed each run; there are few and it's cheap
        if not rebuild and mean_hue is not None and (json_loc.parent / HUE_FRAME).exists():
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

    # One transaction, so a rebuild never leaves the map half empty
    with films.connect() as con:
        if rebuild:
            con.execute("DELETE FROM film_map")
        con.executemany(INSERT_FILM_MAP, points)
        mapped = con.execute("SELECT COUNT(*) FROM film_map").fetchone()[0]
    print(f"{'Rebuilt from' if rebuild else 'Updated'} {len(points)} jobs; {mapped} films on the map")


if __name__ == "__main__":
    main(rebuild="--rebuild" in sys.argv[1:])
