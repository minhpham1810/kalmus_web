#!/usr/bin/env python3
"""
KALMUS Visualization Generator

This script provides functions to generate visualizations from KALMUS barcode data
using the native KALMUS visualization utilities.
"""

import sys
import json
import io
import base64
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
from pathlib import Path

# Import KALMUS visualization utilities
try:
    # Add the KALMUS backend to the path
    kalmus_path = Path('/home/kalmus/backend/tmp')
    if str(kalmus_path) not in sys.path:
        sys.path.insert(0, str(kalmus_path))

    from kalmus.utils.visualization_utils import (
        show_colors_in_cube,
        show_colors_in_hue_light_scatter_plot,
        show_colors_in_hue_light_3d_bar_plot
    )
    from kalmus.tkinter_windows.gui_utils import (
        paint_hue_hist,
        compare_two_barcodes
    )
    from skimage.color import rgb2hsv
except ImportError as e:
    print(f"ERROR: Failed to import KALMUS libraries: {e}")
    sys.exit(1)


class BarcodeData:
    """
    Simple wrapper class to hold barcode data and metadata
    """
    def __init__(self, colors, metadata):
        self.colors = np.array(colors)
        self.barcode_type = metadata.get('barcode_type', 'color')
        self.color_metric = metadata.get('color_metric', 'Average')
        self.frame_type = metadata.get('frame_type', 'Whole_frame')
        self.total_frames = metadata.get('total_frames', len(colors))
        self.film_length_in_frames = metadata.get('film_length_in_frames', len(colors))
        self.sampled_frame_rate = metadata.get('sampled_frame_rate', 1)
        self.fps = metadata.get('fps', 30)
        self.skip_over = metadata.get('skip_over', 0)
        self.brightness = self.colors if self.barcode_type == 'Brightness' else None
        self.metric = self.color_metric
        self.scale_factor = 1
        self.meta_data = {}

    def get_barcode(self):
        """Return barcode data as numpy array"""
        return self.colors


def load_barcode_from_json(json_path):
    """
    Load barcode data from JSON file

    :param json_path: Path to the barcode JSON file
    :return: BarcodeData object
    """
    with open(json_path, 'r') as f:
        data = json.load(f)

    # Load summary metadata if available
    summary_path = Path(json_path).parent / 'summary.json'
    metadata = {}
    if summary_path.exists():
        with open(summary_path, 'r') as f:
            metadata = json.load(f)

    colors = np.array(data.get('colors', []))

    return BarcodeData(colors, metadata)


def fig_to_base64(fig):
    """
    Convert matplotlib figure to base64-encoded PNG

    :param fig: Matplotlib figure
    :return: Base64-encoded string
    """
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight', dpi=150)
    buf.seek(0)
    img_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close(fig)
    return img_base64


def generate_hue_histogram(barcode_data, bin_step=5):
    """
    Generate hue histogram using KALMUS native method

    :param barcode_data: BarcodeData object
    :param bin_step: Step size for histogram bins
    :return: Base64-encoded PNG image
    """
    fig, ax = plt.subplots(figsize=(9, 5))

    if barcode_data.barcode_type == "color":
        # Convert RGB to HSV and extract hue
        normalized_barcode = barcode_data.colors.astype("float") / 255
        hsv_colors = rgb2hsv(normalized_barcode.reshape(-1, 1, 3))
        hue = hsv_colors[..., 0] * 360

        N, bins, patches = ax.hist(hue[:, 0], bins=np.arange(0, 361, bin_step))

        # Paint each bin with its corresponding color
        paint_hue_hist(bin_step, patches)

        ax.set_xticks(np.arange(0, 361, 30))
        ax.set_xlabel("Color Hue (0 - 360)")
        ax.set_ylabel("Number of frames")
        ax.set_title("Hue Distribution")
    else:
        # Brightness histogram
        brightness = barcode_data.brightness.flatten()
        N, bins, patches = ax.hist(brightness, bins=np.arange(0, 256, bin_step))

        ax.set_xticks(np.arange(0, 256, 32))
        ax.set_xlabel("Brightness (0 - 255)")
        ax.set_ylabel("Number of frames")
        ax.set_title("Brightness Distribution")

    plt.tight_layout()
    return fig_to_base64(fig)


def generate_rgb_cube(barcode_data, sampling=3000):
    """
    Generate RGB color cube using KALMUS native method

    :param barcode_data: BarcodeData object
    :param sampling: Number of points to sample
    :return: Base64-encoded PNG image
    """
    if barcode_data.barcode_type != "color":
        raise ValueError("RGB cube visualization only available for color barcodes")

    if sampling > barcode_data.colors.shape[0]:
        sampling = barcode_data.colors.shape[0]

    fig, ax = show_colors_in_cube(
        barcode_data.colors,
        return_figure=True,
        figure_size=(8, 8),
        sampling=sampling,
        grid_off=True,
        background_off=True
    )

    ax.set_title("Colors in RGB Space")

    return fig_to_base64(fig)


def generate_hue_light_scatter(barcode_data, saturation_threshold=0.15):
    """
    Generate hue vs light scatter plot using KALMUS native method

    :param barcode_data: BarcodeData object
    :param saturation_threshold: Minimum saturation to include
    :return: Base64-encoded PNG image
    """
    if barcode_data.barcode_type != "color":
        raise ValueError("Hue-Light scatter plot only available for color barcodes")

    fig, ax = show_colors_in_hue_light_scatter_plot(
        barcode_data.colors,
        figure_size=(10, 5),
        return_figure=True,
        remove_border=True,
        saturation_threshold=saturation_threshold
    )

    frame_type = barcode_data.frame_type.replace("_", " ").title()
    ax.set_title(f"{barcode_data.color_metric} Color of {frame_type} "
                f"(Only colors with saturation > {saturation_threshold:.2f} are included)")

    plt.tight_layout()
    return fig_to_base64(fig)


def generate_hue_light_3d_bar(barcode_data, hue_resolution=10, bri_resolution=0.02,
                               shaded=False, saturation_threshold=0.15):
    """
    Generate hue vs light 3D bar plot using KALMUS native method

    :param barcode_data: BarcodeData object
    :param hue_resolution: Resolution on hue axis
    :param bri_resolution: Resolution on light axis
    :param shaded: Whether to shade 3D bars
    :param saturation_threshold: Minimum saturation to include
    :return: Base64-encoded PNG image
    """
    if barcode_data.barcode_type != "color":
        raise ValueError("Hue-Light 3D bar plot only available for color barcodes")

    fig, ax = show_colors_in_hue_light_3d_bar_plot(
        barcode_data.colors,
        figure_size=(8, 8),
        hue_resolution=hue_resolution,
        bri_resolution=bri_resolution,
        return_figure=True,
        shaded=shaded,
        grid_off=False,
        background_off=True,
        invert_light_axis=True,
        saturation_threshold=saturation_threshold
    )

    ax.set_title("Hue vs Light Distribution (3D Bar Plot)")
    ax.view_init(elev=30, azim=-60)  # Default diagonal view

    return fig_to_base64(fig)


def generate_comparison_metrics(barcode_data_1, barcode_data_2):
    """
    Compare two barcodes using KALMUS native comparison metrics

    :param barcode_data_1: First BarcodeData object
    :param barcode_data_2: Second BarcodeData object
    :return: Dictionary with comparison metrics
    """
    if barcode_data_1.barcode_type != barcode_data_2.barcode_type:
        raise ValueError("Cannot compare barcodes of different types")

    # Use KALMUS native comparison function
    cross_corre, loc_cross_corre, nrmse, ssim, needleman, smith = compare_two_barcodes(
        barcode_data_1, barcode_data_2
    )

    return {
        'nrmse': float(nrmse),
        'ssim': float(ssim),
        'crossCorrelation': float(cross_corre),
        'localCrossCorrelation': float(loc_cross_corre),
        'needlemanWunsch': float(needleman),
        'smithWaterman': float(smith)
    }


if __name__ == '__main__':
    # Test the functions
    import argparse

    parser = argparse.ArgumentParser(description='Generate KALMUS visualizations')
    parser.add_argument('--job-id', required=True, help='Job ID')
    parser.add_argument('--type', required=True,
                       choices=['histogram', 'cube', 'scatter', '3dbar'],
                       help='Visualization type')
    parser.add_argument('--results-dir', default='/shared/kalmus/results',
                       help='Results directory')

    args = parser.parse_args()

    # Load barcode data
    json_path = Path(args.results_dir) / args.job_id / 'barcode.json'
    barcode = load_barcode_from_json(json_path)

    # Generate visualization
    if args.type == 'histogram':
        img = generate_hue_histogram(barcode)
    elif args.type == 'cube':
        img = generate_rgb_cube(barcode)
    elif args.type == 'scatter':
        img = generate_hue_light_scatter(barcode)
    elif args.type == '3dbar':
        img = generate_hue_light_3d_bar(barcode)

    print(img)
