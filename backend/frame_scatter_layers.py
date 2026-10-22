from __future__ import annotations

import colorsys
import math
import random
from dataclasses import dataclass, field
import zlib
from typing import Dict, List, Optional, Sequence, Tuple

HUE_BIN_DEGREES = 2.5
LIGHTNESS_BIN_SIZE = 0.15

SATURATION_THRESHOLD = 0.1

SATURATION_THRESHOLDS: List[Tuple[str, float]] = [
    ("frames", SATURATION_THRESHOLD),
]

CELL_SELECTION_FRACTION = 1
MIN_FRAMES_PER_CELL = 2
MAX_FRAMES_PER_CELL = 20

INTRO_SKIP_SECONDS = 60.0

MIN_FRAME_SEPARATION_FRAMES = 48

TARGET_CANVAS_WIDTH = 50000
TARGET_CANVAS_HEIGHT = 15000

MARGIN_LEFT = 140
MARGIN_RIGHT = 40
MARGIN_TOP = 40
MARGIN_BOTTOM = 90

CELL_FILL_FRACTION = 1

JITTER_FRACTION = 0.45


@dataclass
class FrameCandidate:
    slice_index: int
    absolute_frame: int
    hue: float
    lightness: float
    saturation: float


@dataclass
class PlacedFrame:
    candidate: FrameCandidate
    hue_bin: int
    lightness_bin: int
    cell_slot_index: int
    cell_total: int
    jitter_x: float
    jitter_y: float


@dataclass
class LayerSelection:
    label: str
    frames: List[PlacedFrame] = field(default_factory=list)


def load_frame_colors(job_id: str) -> Tuple[List[Tuple[int, int, int]], float, int, int]:
    raise NotImplementedError(
        "wire to metadata source"
    )


def rgb_to_hsv_deg(r: int, g: int, b: int) -> Tuple[float, float, float]:
    """
    convert rgb to hsv to match degree format (0-360)
    """
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    return h * 360.0, s, v


def first_eligible_slice_index(fps: float, skip_over: int, sampled_frame_rate: int) -> int:
    """

    """
    intro_skip_frames = INTRO_SKIP_SECONDS * fps
    if sampled_frame_rate <= 0:
        return 0
    raw = (intro_skip_frames - skip_over) / sampled_frame_rate
    return max(0, math.ceil(raw))



def seeded_jitter(seed: int) -> Tuple[float, float]:
    """
        derives two 'random' (nnot with random library) floats in [-1, 1] from a
        single integer seed.
    """
    h = (seed + 0x9E3779B9) & 0xFFFFFFFF
    h = ((h ^ (h >> 15)) * 0x85EBCA6B) & 0xFFFFFFFF
    a = (h & 0xFFFF) / 65535.0
    h = ((h ^ (h >> 13)) * 0xC2B2AE35) & 0xFFFFFFFF
    b = (h & 0xFFFF) / 65535.0
    return (a * 2 - 1), (b * 2 - 1)


def bucket_candidates(
    colors: List[Tuple[int, int, int]],
    fps: float,
    skip_over: int,
    sampled_frame_rate: int,
    saturation_floor: float,
    thumbnail_frames: Optional[Sequence[int]] = None, # added for test
) -> Dict[Tuple[int, int], List[FrameCandidate]]:
    start_index = first_eligible_slice_index(fps, skip_over, sampled_frame_rate)
    hue_bin_count = int(360 / HUE_BIN_DEGREES)
    light_bin_count = int(360 / LIGHTNESS_BIN_SIZE)
    buckets: Dict[Tuple[int, int], List[FrameCandidate]] = {}

    # if frame has no thmbanil (test add)
    if thumbnail_frames is None:
        sources = [
            (i, skip_over + i * sampled_frame_rate) for i in range(start_index, len(colors))]
    else:
        step = max(1, sampled_frame_rate)
        sources = []
        for frame in sorted({int(f) for f in thumbnail_frames}):
            i = int(round(frame - skip_over) / step)
            if i < start_index or i >= len(colors):
                continue
            sources.append((i, frame))

    for i, absolute_frame in sources:
        r, g, b = colors[i]
        hue, sat, light = rgb_to_hsv_deg(r, g, b)

        if sat < saturation_floor:
            continue

        hue_bin = int(hue / HUE_BIN_DEGREES) % hue_bin_count
        light_bin = min(int( light / LIGHTNESS_BIN_SIZE), light_bin_count - 1)

        candidate = FrameCandidate(
            slice_index = i,
            absolute_frame = absolute_frame,
            hue = hue,
            lightness = light,
            saturation = sat,
        )
        buckets.setdefault((hue_bin, light_bin), []).append(candidate)
    # out for testing for faden
    # for i in range(start_index, len(colors)):
    #     r, g, b = colors[i]
    #     hue, sat, light = rgb_to_hsv_deg(r, g, b)
    #
    #     if sat < saturation_floor:
    #         continue
    #
    #     hue_bin = int(hue / HUE_BIN_DEGREES) % int(360 / HUE_BIN_DEGREES)
    #     light_bin = min(int(light / LIGHTNESS_BIN_SIZE), 9)
    #
    #     candidate = FrameCandidate(
    #         slice_index=i,
    #         absolute_frame=skip_over + i * sampled_frame_rate,
    #         hue=hue,
    #         lightness=light,
    #         saturation=sat,
    #     )
    #     buckets.setdefault((hue_bin, light_bin), []).append(candidate)

    return buckets


def cell_target_count(n_candidates: int) -> int:
    proportional = round(n_candidates * CELL_SELECTION_FRACTION)
    return max(MIN_FRAMES_PER_CELL, min(MAX_FRAMES_PER_CELL, proportional, n_candidates))


def pick_spaced(
    candidates: List[FrameCandidate],
    k: int,
    min_separation_frames: float,
    rng: random.Random,
) -> List[FrameCandidate]:
    if len(candidates) <= k:
        return list(candidates)

    pool = list(candidates)
    rng.shuffle(pool)
    chosen: List[FrameCandidate] = []

    def far_enough(c: FrameCandidate) -> bool:
        return all(
            abs(c.absolute_frame - picked.absolute_frame) >= min_separation_frames
            for picked in chosen
        )

    for c in pool:
        if len(chosen) >= k:
            break
        if far_enough(c):
            chosen.append(c)

    remaining = [c for c in pool if c not in chosen]
    while len(chosen) < k and remaining:
        best = max(
            remaining,
            key=lambda c: min(
                (abs(c.absolute_frame - picked.absolute_frame) for picked in chosen),
                default=float("inf"),
            ),
        )
        chosen.append(best)
        remaining.remove(best)

    return chosen


def select_frames_for_threshold(
    # colors: List[Tuple[int, int, int]],
    # fps: float,
    # skip_over: int,
    # sampled_frame_rate: int,
    # saturation_floor: float,
    # seed: Optional[int],
    colors, fps, skip_over, sampled_frame_rate, saturation_floor,
        seed, thumbnail_frames: Optional[Sequence[int]] = None
) -> LayerSelection:
    buckets = bucket_candidates(colors, fps, skip_over,
                                sampled_frame_rate, saturation_floor, thumbnail_frames)

    min_separation_frames = MIN_FRAME_SEPARATION_FRAMES
    rng = random.Random(seed)

    # sorted
    selection = LayerSelection(label=f"sat_{saturation_floor}")
    for (hue_bin, light_bin), candidates in sorted(buckets.items()):
        k = cell_target_count(len(candidates))
        picked = pick_spaced(candidates, k, min_separation_frames, rng)
        for slot_index, c in enumerate(picked):
            jx, jy = seeded_jitter(c.absolute_frame)
            selection.frames.append(
                PlacedFrame(
                    candidate=c,
                    hue_bin=hue_bin,
                    lightness_bin=light_bin,
                    cell_slot_index=slot_index,
                    cell_total=len(picked),
                    jitter_x=jx,
                    jitter_y=jy,
                )
            )

    return selection


def select_layered_frames(
    job_id: str,
    seed: Optional[int] = None,
    thumbnail_frames: Optional[Sequence[int]] = None,
) -> Dict[str, LayerSelection]:
    colors, fps, skip_over, sampled_frame_rate = load_frame_colors(job_id)
    rng_seed = seed if seed is not None else zlib.crc32(job_id.encode("utf-8"))
    # rng_seed = seed if seed is not None else hash(job_id) & 0xFFFFFFFF

    results: Dict[str, LayerSelection] = {}
    for label, floor in SATURATION_THRESHOLDS:
        results[label] = select_frames_for_threshold(
            colors, fps, skip_over, sampled_frame_rate, floor, rng_seed, thumbnail_frames
        )
        results[label].label = label

    return results


@dataclass
class CanvasLayout:
    canvas_width: int
    canvas_height: int
    margin_left: int
    margin_bottom: int
    margin_top: int
    margin_right: int
    hue_bin_count: int
    lightness_bin_count: int
    cell_width: float
    cell_height: float
    display_thumb_width: float
    display_thumb_height: float

    def hue_to_x(self, hue: float) -> float:
        plot_width = self.canvas_width - self.margin_left - self.margin_right
        return self.margin_left + (hue / 360.0) * plot_width

    def lightness_to_y(self, lightness: float) -> float:
        plot_height = self.canvas_height - self.margin_top - self.margin_bottom
        return self.margin_top + (1.0 - lightness) * plot_height


def compute_canvas_layout(
    thumbnail_width: int,
    thumbnail_height: int,
) -> CanvasLayout:
    hue_bin_count = int(360 / HUE_BIN_DEGREES)
    lightness_bin_count = int(round(1.0 / LIGHTNESS_BIN_SIZE))

    plot_width = TARGET_CANVAS_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
    plot_height = TARGET_CANVAS_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM

    cell_width = plot_width / hue_bin_count
    cell_height = plot_height / lightness_bin_count

    display_thumb_width = cell_width * CELL_FILL_FRACTION
    aspect = thumbnail_height / thumbnail_width
    display_thumb_height = display_thumb_width * aspect

    return CanvasLayout(
        canvas_width = TARGET_CANVAS_WIDTH,
        canvas_height = TARGET_CANVAS_HEIGHT,
        margin_left = MARGIN_LEFT,
        margin_bottom = MARGIN_BOTTOM,
        margin_top = MARGIN_TOP,
        margin_right = MARGIN_RIGHT,
        hue_bin_count = hue_bin_count,
        lightness_bin_count = lightness_bin_count,
        cell_width = cell_width,
        cell_height = cell_height,
        display_thumb_width = display_thumb_width,
        display_thumb_height = display_thumb_height,
    )


def grid_slot_geometry(
    placed: PlacedFrame, layout: CanvasLayout
) -> Tuple[float, float, float, float]:
    n = max(1, placed.cell_total)
    cols = max(1, math.ceil(math.sqrt(n)))
    rows = max(1, math.ceil(n / cols))

    slot_width = layout.cell_width / cols
    slot_height = layout.cell_height / rows

    col = placed.cell_slot_index % cols
    row = placed.cell_slot_index // cols

    offset_x = (col - (cols - 1) / 2) * slot_width
    offset_y = (row - (rows - 1) / 2) * slot_height

    offset_x += placed.jitter_x * slot_width * 0.15
    offset_y += placed.jitter_y * slot_height * 0.15

    return offset_x, offset_y, slot_width, slot_height