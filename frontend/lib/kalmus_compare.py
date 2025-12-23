#!/usr/bin/env python3
"""
KALMUS Barcode Comparison

This script compares two KALMUS barcodes using native comparison metrics
"""

import sys
import json
from pathlib import Path

# Import the visualizer module
import kalmus_visualizer as visualizer


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Compare two KALMUS barcodes')
    parser.add_argument('--job-id-1', required=True, help='First job ID')
    parser.add_argument('--job-id-2', required=True, help='Second job ID')
    parser.add_argument('--results-dir', default='/shared/kalmus/results',
                       help='Results directory')

    args = parser.parse_args()

    # Load both barcodes
    json_path_1 = Path(args.results_dir) / args.job_id_1 / 'barcode.json'
    json_path_2 = Path(args.results_dir) / args.job_id_2 / 'barcode.json'

    barcode_1 = visualizer.load_barcode_from_json(json_path_1)
    barcode_2 = visualizer.load_barcode_from_json(json_path_2)

    # Generate comparison metrics
    metrics = visualizer.generate_comparison_metrics(barcode_1, barcode_2)

    # Output as JSON
    print(json.dumps(metrics, indent=2))


if __name__ == '__main__':
    main()
