import os
import argparse
import json
import sys
import numpy as np
from PIL import Image

try:
    from kalmus.barcodes.BarcodeGenerator import BarcodeGenerator

    # Registered types
    import kalmus.barcodes
    import kalmus.frames
    import kalmus.metrics
except ImportError:
    print("ERROR: KALMUS library not found. Please ensure it is installed in the Python environment.")
    sys.exit(1)

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
    parser.add_argument('--job-id', required=True, help='Unique job identifier')
    return parser.parse_args(args)

def main(args=sys.argv[1:]):
    args = parse_args_into_dict(args=args)

    # Validate inputs
    if not os.path.exists(args.video_path):
        print(f"ERROR: Video file not found: {args.video_path}")
        sys.exit(1)

    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)

    print()
    print()
    print(f"Starting KALMUS processing...")
    print(f"Video: {args.video_path}")
    print(f"Output: {args.output_dir}")
    print()

    try:
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
            save_frames=False,  # Don't save individual frames to keep storage minimal
            # save_frames_rate=1,
            # rescale_frames_factor=1
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
        print(barcode_data)
        img = Image.fromarray(barcode_data)
        img.save(image_path, 'PNG')

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
            'frames_per_column': args.frames_per_column
        }

        with open(summary_path, 'w') as f:
            json.dump(summary, f, indent=2)

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