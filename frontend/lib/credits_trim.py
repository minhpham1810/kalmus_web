"""
Shared credits-trim rule: which part of a film's barcode counts for the film map and film comparisons.

Auto rule: films released after 1975 (or with no year) keep [60 s, length - 300 s); older films keep everything.
A per-(film, edition) override gives positions on the source video and replaces the auto rule. If the kept window
is shorter than MIN_KEEP_FRACTION of the film, or keeps no samples, the whole film is used.
"""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass

import numpy as np

AUTO_LAST_WHOLE_YEAR = 1975
MIN_PLAUSIBLE_YEAR = 1800
AUTO_START_S = 60.0
AUTO_END_S = 300.0
MIN_KEEP_FRACTION = 0.5
HUE_FRAME_MARGIN = 0.04

# (film_start_s, credits_start_s); None = start of video / end of video
Override = tuple["float | None", "float | None"]


@dataclass(frozen=True)
class Timeline:
    n: int
    fps: float
    rate: int
    skip_over: int
    length_frames: int

    @classmethod
    def from_barcode(cls, d: dict) -> "Timeline":
        return cls(
            n=len(d.get("colors") or []),
            fps=float(d.get("fps") or 0),
            rate=int(d.get("sampled_frame_rate") or 1),
            skip_over=int(d.get("skip_over") or 0),
            length_frames=int(d.get("film_length_in_frames") or 0),
        )

    def times(self) -> np.ndarray:
        """Source-video seconds of each sample (the sample index when fps is unknown)."""
        idx = np.arange(self.n, dtype=np.float64)
        if self.fps <= 0:
            return idx
        return (self.skip_over + idx * self.rate) / self.fps

    def length_s(self) -> float:
        if self.fps <= 0:
            return float(self.n)
        if self.length_frames > 0:
            return self.length_frames / self.fps
        if self.n == 0:
            return 0.0
        return float(self.times()[-1]) + 1.0 / self.fps


def keep_window(year: int | None, override: Override | None, length_s: float) -> tuple[float, float]:
    whole = (0.0, float(length_s))
    if override is not None:
        start = override[0] if override[0] is not None else 0.0
        end = override[1] if override[1] is not None else length_s
    elif year is not None and year <= AUTO_LAST_WHOLE_YEAR:
        return whole
    else:
        start, end = AUTO_START_S, length_s - AUTO_END_S
    start = min(max(float(start), 0.0), length_s)
    end = min(max(float(end), 0.0), length_s)
    if end - start < MIN_KEEP_FRACTION * length_s:
        return whole
    return (start, end)


def keep_slice(tl: Timeline, window: tuple[float, float]) -> slice:
    whole = slice(0, tl.n)
    if tl.fps <= 0:
        return whole
    t = tl.times()
    idx = np.flatnonzero((t >= window[0]) & (t < window[1]))
    if idx.size == 0:
        return whole
    return slice(int(idx[0]), int(idx[-1]) + 1)


def hue_frame_mask(tl: Timeline) -> np.ndarray:
    """Samples whose source time lies in [4%, 96%) of the film, whatever the trim."""
    t = tl.times()
    length = tl.length_s()
    return (t >= HUE_FRAME_MARGIN * length) & (t < (1 - HUE_FRAME_MARGIN) * length)


def job_trim_inputs(con: sqlite3.Connection, job_id: str) -> tuple[int | None, Override | None]:
    """(released_year, override) for a job's film and edition; override is None when there is no row
    or the database has no credits_override table yet."""
    row = con.execute(
        "SELECT f.released_year, f.id, LOWER(COALESCE(TRIM(a.edition), '')) "
        "FROM analyzed_files a JOIN films f ON f.id = a.film_id WHERE a.job_id = ?",
        (job_id,),
    ).fetchone()
    if row is None:
        return None, None
    year, film_id, edition_key = row
    if year is not None and year < MIN_PLAUSIBLE_YEAR:
        year = None  # e.g. a digits-only "released" is read as a Julian day by the generated column
    try:
        o = con.execute(
            "SELECT film_start_s, credits_start_s FROM credits_override WHERE film_id = ? AND edition_key = ?",
            (film_id, edition_key),
        ).fetchone()
    except sqlite3.OperationalError:
        return year, None
    return year, (o[0], o[1]) if o else None
