"""
Render a comparison sheet for choosing the Most-vivid cutoffs from a picture.

The video is read once and every --every-th frame is shrunk to 256 px on the long side. For each frame
it computes the average color, the old Most-vivid (no size or lightness test) and a 3x3 grid of Most-vivid
with min_area_ratio in {1%, 3%, 5%} and min_lightness in {25, 35, 45}. The PNG has 11 rows (one strip of
frame colors each, labelled at the left), and for each grid row the share of frames that fell back to
the average color is printed.

Whole frames only: no letterbox removal, so black bars in the video count as part of the frame.

Usage: python dev_scripts/most_vivid_sheet.py --video <path> --out <png> [--every 24] [--width 2000]
"""

import argparse
from pathlib import Path
import sys

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from kalmus.utils.artist import compute_mean_color, compute_most_vivid_color

AREAS = (0.01, 0.03, 0.05)
LIGHTNESSES = (25, 35, 45)
ROW_HEIGHT = 80
GAP = 6
SHRINK = 256


def read_frames(video, every):
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        sys.exit(f"Cannot open video: {video}")
    frames = []
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if i % every == 0:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            scale = SHRINK / max(rgb.shape[:2])
            if scale < 1:
                rgb = cv2.resize(rgb, (max(1, round(rgb.shape[1] * scale)), max(1, round(rgb.shape[0] * scale))),
                                 interpolation=cv2.INTER_AREA)
            frames.append(rgb)
        i += 1
    cap.release()
    return frames


def label_row(strip, text):
    (tw, th), base = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
    cv2.rectangle(strip, (0, 0), (tw + 12, th + base + 12), (0, 0, 0), -1)
    cv2.putText(strip, text, (6, th + 6), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--video", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--every", type=int, default=24)
    parser.add_argument("--width", type=int, default=2000)
    args = parser.parse_args()
    if args.every < 1:
        sys.exit("--every must be at least 1")

    frames = read_frames(args.video, args.every)
    if not frames:
        sys.exit(f"No frames were read from {args.video} (every {args.every}); check the path and --every")

    rows = [("average", [compute_mean_color(f) for f in frames]),
            ("most-vivid (old)", [compute_most_vivid_color(f, min_area_ratio=0, min_lightness=0) for f in frames])]
    fallback = []
    for area in AREAS:
        for light in LIGHTNESSES:
            colors = [compute_most_vivid_color(f, min_area_ratio=area, min_lightness=light) for f in frames]
            rows.append((f"area {area * 100:.0f}% L {light}", colors))
            means = [compute_mean_color(f) for f in frames]
            share = np.mean([np.array_equal(c, m) for c, m in zip(colors, means)])
            fallback.append((rows[-1][0], share))

    strips = []
    for text, colors in rows:
        strip = np.clip(np.round(np.array(colors, dtype=float)), 0, 255).astype(np.uint8).reshape(1, -1, 3)
        strip = cv2.resize(strip, (args.width, ROW_HEIGHT), interpolation=cv2.INTER_NEAREST)
        label_row(strip, text)
        strips.append(strip)
    gap = np.zeros((GAP, args.width, 3), np.uint8)
    parts = []
    for i, s in enumerate(strips):
        if i:
            parts.append(gap)
        parts.append(s)
    sheet = np.vstack(parts)
    if not cv2.imwrite(str(args.out), cv2.cvtColor(sheet, cv2.COLOR_RGB2BGR)):
        sys.exit(f"Cannot write {args.out}")

    print(f"{len(frames)} frames sampled, sheet {sheet.shape[1]}x{sheet.shape[0]} written to {args.out}")
    print("Share of frames that fell back to average:")
    for text, share in fallback:
        print(f"  {text:<14} {share * 100:5.1f}%")


if __name__ == "__main__":
    main()
