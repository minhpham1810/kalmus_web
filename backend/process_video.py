"""
Standalone KALMUS video processing script for SLURM execution.
This script runs on compute nodes and processes videos independently.
"""
import argparse
import json
import sys
from pathlib import Path
from kalmus.barcodes.BarcodeGenerator import BarcodeGenerator
import matplotlib.pyplot as plt


def main():
    parser = argparse.ArgumentParser(description='Generate KALMUS barcode from video')
    parser.add_argument('--video', required=True, help='Path to input video file')
    parser.add_argument('--output', required=True, help='Output directory for results')
    parser.add_argument('--color-metric', default='Average', help='Color metric')
    parser.add_argument('--frame-type', default='whole_frame', help='Frame type')
    parser.add_argument('--barcode-type', default='color', help='Barcode type')
    parser.add_argument('--sampled-rate', type=int, default=1, help='Frame sampling rate')
    parser.add_argument('--skip-over', type=int, default=0, help='Frames to skip at start')
    parser.add_argument('--total-frames', type=int, default=-1, help='Total frames to process')
    parser.add_argument('--frames-per-column', type=int, default=1, help='Frames per column')
    
    args = parser.parse_args()
    
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Update status
    with open(output_dir / 'status.txt', 'w') as f:
        f.write('PROCESSING')
    
    try:
        # Initialize barcode generator
        generator = BarcodeGenerator()
        
        # Generate barcode from video
        barcode = generator.generate_barcode(
            video_file_path=args.video,
            color_metric=args.color_metric,
            frame_type=args.frame_type,
            barcode_type=args.barcode_type,
            sampled_frame_rate=args.sampled_rate,
            skip_over=args.skip_over,
            total_frames=args.total_frames if args.total_frames > 0 else None
        )
        
        # Get barcode data
        barcode_data = barcode.get_barcode()
        
        # Save as JSON
        json_output = {
            'barcode': barcode_data.tolist(),
            'shape': barcode_data.shape,
            'color_metric': args.color_metric,
            'frame_type': args.frame_type,
            'barcode_type': args.barcode_type,
            'metadata': {
                'sampled_rate': args.sampled_rate,
                'skip_over': args.skip_over,
                'total_frames': args.total_frames,
                'frames_per_column': args.frames_per_column
            }
        }
        
        with open(output_dir / 'barcode.json', 'w') as f:
            json.dump(json_output, f)
        
        # Save as PNG
        plt.figure(figsize=(12, 6))
        plt.imshow(barcode_data, aspect='auto')
        plt.axis('off')
        plt.tight_layout()
        plt.savefig(output_dir / 'barcode.png', dpi=150, bbox_inches='tight')
        plt.close()
        
        # Update status
        with open(output_dir / 'status.txt', 'w') as f:
            f.write('COMPLETED')
        
        print(f"Barcode generated successfully: {output_dir}")
        
    except Exception as e:
        # Log error
        with open(output_dir / 'status.txt', 'w') as f:
            f.write('FAILED')
        with open(output_dir / 'error.txt', 'w') as f:
            f.write(str(e))
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
