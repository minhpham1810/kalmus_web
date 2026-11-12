#!/usr/bin/env python3
"""
KALMUS Barcode Comparison

This script compares two KALMUS barcodes using native comparison metrics
"""

import os
import sys
import json
import sqlite3
from pathlib import Path

# Import the visualizer module
import kalmus_visualizer as visualizer
from film_compare import FilmProfile, compare
from credits_trim import Timeline, job_trim_inputs, keep_slice, keep_window


def barcode_window(barcode, job_id, ranged):
    """Credits-trim slice of a barcode's samples, or None for the whole film. A barcode the user cut to a
    range is left alone. Without a usable database the auto rule still applies (no year, no override)."""
    if ranged:
        return None
    year, override = None, None
    db_path = os.environ.get('FILMS_DB_PATH')
    if db_path:
        try:
            con = sqlite3.connect(Path(db_path).resolve().as_uri() + '?mode=ro', uri=True)
            try:
                year, override = job_trim_inputs(con, job_id)
            finally:
                con.close()
        except sqlite3.Error:
            year, override = None, None
    tl = Timeline(n=len(barcode.colors), fps=float(barcode.fps or 0),
                  rate=int(barcode.sampled_frame_rate or 1), skip_over=int(barcode.skip_over or 0),
                  length_frames=int(barcode.film_length_in_frames or 0))
    return keep_slice(tl, keep_window(year, override, tl.length_s()))


def film_report(barcode_1, barcode_2, title_1, title_2, windows=(None, None)):
    """Palette, lightness and editing comparison (film_compare.py). Colour barcodes only.
    windows: per barcode, a slice of its samples to profile (None = whole)."""
    if barcode_1.barcode_type != 'color':
        return None
    try:
        profiles = [FilmProfile.from_frames(b.colors if w is None else b.colors[w],
                                           b.fps / b.sampled_frame_rate, name=name)
                    for b, name, w in ((barcode_1, title_1, windows[0]), (barcode_2, title_2, windows[1]))]
    except ValueError as e:   # range too short to profile
        return {'error': str(e)}
    return compare(*profiles).to_dict()


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Compare two KALMUS barcodes')
    parser.add_argument('--job-id-1', required=True, help='First job ID')
    parser.add_argument('--job-id-2', required=True, help='Second job ID')
    parser.add_argument('--title-1', required=True, help='First barcode title')
    parser.add_argument('--title-2', required=True, help='Second barcode title')
    parser.add_argument('--start-1', type=int,
                        help='Start frame index for the first barcode')
    parser.add_argument('--end-1', type=int,
                        help='End frame index for the first barcode')
    parser.add_argument('--start-2', type=int,
                        help='Start frame index for the second barcode')
    parser.add_argument('--end-2', type=int,
                        help='End frame index for the second barcode')
    parser.add_argument('--results-dir', default='/shared/kalmus/results',
                        help='Results directory')

    args = parser.parse_args()

    # Load both barcodes
    json_path_1 = Path(args.results_dir) / args.job_id_1 / 'barcode.json'
    json_path_2 = Path(args.results_dir) / args.job_id_2 / 'barcode.json'

    barcode_1 = visualizer.load_barcode_from_json(json_path_1)
    barcode_2 = visualizer.load_barcode_from_json(json_path_2)

    ranged_1 = args.start_1 is not None or args.end_1 is not None
    ranged_2 = args.start_2 is not None or args.end_2 is not None
    windows = (barcode_window(barcode_1, args.job_id_1, ranged_1),
               barcode_window(barcode_2, args.job_id_2, ranged_2))

    if ranged_1:
        barcode_1 = visualizer.slice_barcode_by_frame_range(
            barcode_1, args.start_1, args.end_1)

    if ranged_2:
        barcode_2 = visualizer.slice_barcode_by_frame_range(
            barcode_2, args.start_2, args.end_2)

    # Generate comparison metrics
    metrics = visualizer.generate_comparison_metrics(barcode_1, barcode_2)
    metrics['film'] = film_report(barcode_1, barcode_2, args.title_1, args.title_2, windows)

    # Output as JSON
    print(json.dumps(metrics, indent=2))


if __name__ == '__main__':
    main()
