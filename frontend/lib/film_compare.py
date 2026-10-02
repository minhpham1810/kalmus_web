"""
film_compare.py - human-friendly colour, lightness and editing similarity between two films.

Input per film: one sRGB colour per frame, shape (N, 3), values 0-255 or 0-1, plus fps.
Shape (N, K, 3) also works (e.g. a 4x4 grid per frame, K=16). That makes cut detection far
more reliable, because cuts between similar-looking shots no longer average away.

    a = FilmProfile.from_frames(rgb_a, fps=24, name="Heat")       # once per film; cache it
    b = FilmProfile.from_frames(rgb_b, fps=24, name="Collateral")
    print(compare(a, b).to_text())                                # or .to_dict() for JSON

Every metric reports a raw distance in natural units (degrees of hue, lightness units,
doublings of shot length), a 0-100 score, a plain-language summary, and the numbers behind
it. Requires numpy and scipy.
"""
from __future__ import annotations

import itertools
import textwrap
from dataclasses import asdict, dataclass, field, fields
from typing import Callable

import numpy as np
from scipy.ndimage import gaussian_filter1d, median_filter

# bump whenever profile features change, so cached profiles get rebuilt
FEATURE_VERSION = 1
# ~1 just-noticeable colour difference in OKLab (the value CSS Color 4 uses)
JND = 0.02
N_HUE_BINS = 36       # 10-degree hue bins
N_QUANTILES = 100     # distributions are stored as 100 quantiles: tiny, and exact enough
N_ARC = 100           # "shape over time" curves: one point per 1% of runtime
# frames darker than this count as dark scenes (about sRGB grey 45/255)
DARK_L = 0.30
MONO_CHROMA = 0.01    # mean chroma below this = effectively black-and-white

# Distance at which each score falls to 50 (two half-lives -> 25, and so on). These are
# starting guesses; replace them with Calibrator.suggested_half_lives() from your library.
HALF_LIFE = {
    "hue": 30.0,          # degrees of average hue rotation
    "saturation": 0.02,   # OKLab chroma (about 1 JND)
    "lightness": 0.06,    # OKLab lightness (0 = black, 1 = white)
    # doublings of shot length (1.0 = shots twice as long)
    "pacing": 0.75,
    "turbulence": 1.0,    # doublings of within-shot colour movement
    "cut_contrast": 1.0,  # doublings of the colour jump at cuts
}


# ------------------------------------------------------------------ colour space
_M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],     # linear sRGB -> LMS
                [0.2119034982, 0.6806995451, 0.1073969566],
                [0.0883024619, 0.2817188376, 0.6299787005]])
_M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],    # cube-rooted LMS -> OKLab
                [1.9779984951, -2.4285922050, 0.4505937099],
                [0.0259040371, 0.7827717662, -0.8086757660]])


def srgb_to_oklab(rgb):
    """sRGB in [0, 1], shape (..., 3) -> OKLab (L, a, b). L runs from 0 (black) to 1 (white)."""
    rgb = np.clip(np.asarray(rgb, dtype=np.float64), 0.0, 1.0)
    linear = np.where(rgb <= 0.04045, rgb / 12.92,
                      ((rgb + 0.055) / 1.055) ** 2.4)
    return np.cbrt(linear @ _M1.T) @ _M2.T


def oklab_to_srgb(lab):
    """Inverse of srgb_to_oklab; out-of-gamut colours are clipped."""
    lms = (np.asarray(lab, dtype=np.float64) @ np.linalg.inv(_M2).T) ** 3
    linear = np.clip(lms @ np.linalg.inv(_M1).T, 0.0, 1.0)
    return np.where(linear <= 0.0031308, 12.92 * linear, 1.055 * linear ** (1 / 2.4) - 0.055)


def _hue_angle(lab):
    return np.degrees(np.arctan2(lab[..., 2], lab[..., 1])) % 360


# Hue-family names, anchored at the OKLab hue of a representative colour, for the summaries.
_HUE_ANCHORS = {name: float(_hue_angle(srgb_to_oklab(rgb))) for name, rgb in {
    "red": (1, 0, 0), "orange": (1, 0.5, 0), "yellow": (1, 1, 0), "green": (0, 1, 0),
    "teal": (0, 1, 1), "blue": (0, 0, 1), "purple": (0.5, 0, 1), "magenta": (1, 0, 1)}.items()}


# ------------------------------------------------------------------ distribution helpers
_QS = (np.arange(N_QUANTILES) + 0.5) / N_QUANTILES


def quantiles(x):
    x = np.asarray(x, dtype=np.float64).ravel()
    x = x[np.isfinite(x)]
    return np.quantile(x, _QS) if x.size else np.full(N_QUANTILES, np.nan)


def at(q, p):
    """Read a percentile (0-1) back out of a stored quantile signature."""
    return float(np.interp(p, _QS, q))


def w1(qa, qb):
    """1-D earth mover's (Wasserstein-1) distance from two quantile signatures, in the data's
    own units: how far values must move, on average, to turn one distribution into the other."""
    return float(np.mean(np.abs(qa - qb)))


def circular_emd(p, q, bin_width_deg):
    """Earth mover's distance between two histograms on a circle (hue), in degrees. Closed
    form: the median of the cumulative difference is the optimal place to 'cut' the circle."""
    d = np.cumsum(np.asarray(p, dtype=np.float64) -
                  np.asarray(q, dtype=np.float64))
    return float(bin_width_deg * np.abs(d - np.median(d)).sum())


def _arc(x, sigma=2.0):
    """Mean of x within each 1% of runtime, lightly smoothed."""
    points = np.array([chunk.mean()
                      for chunk in np.array_split(np.asarray(x, float), N_ARC)])
    return gaussian_filter1d(points, sigma, mode="mirror")


def _pearson(x, y):
    if np.std(x) < 1e-9 or np.std(y) < 1e-9:
        return np.nan
    return float(np.corrcoef(x, y)[0, 1])


# ------------------------------------------------------------------ cut detection
def _rms_diff(x, y):
    """Colour difference between frames: OKLab distance, RMS over the cells of each frame."""
    return np.sqrt(((x - y) ** 2).sum(-1).mean(-1))


def detect_cuts(cells, fps, min_jump_jnd=1.5, ratio=4.0, window_s=1.0, min_shot_s=0.25, persist=2):
    """Hard cuts from frame-to-frame colour change. Frame t is a cut when the jump into it is
    (1) bigger than min_jump_jnd, (2) well above the local background of camera and subject
    motion (ratio x rolling median), (3) still there `persist` frames later, which rejects
    flashes, muzzle flare and strobes, and (4) at least min_shot_s after the previous cut.
    Dissolves and fades are not detected. Returns (cut frame indices, per-frame jump)."""
    n = len(cells)
    idx = np.arange(n)
    jump = np.zeros(n)
    jump[1:] = _rms_diff(cells[1:], cells[:-1])
    background = median_filter(jump, size=max(
        3, int(window_s * fps) | 1), mode="nearest")
    lasting = _rms_diff(
        cells[np.minimum(idx + persist, n - 1)], cells[np.maximum(idx - 1, 0)])
    candidates = np.flatnonzero((jump > min_jump_jnd * JND) & (jump > ratio * background)
                                & (lasting > 0.5 * jump))
    cuts, min_gap = [], max(1, int(round(min_shot_s * fps)))
    for t in candidates:                # keep only the biggest jump inside any min_gap window
        if cuts and t - cuts[-1] < min_gap:
            if jump[t] > jump[cuts[-1]]:
                cuts[-1] = t
        else:
            cuts.append(t)
    return np.asarray(cuts, dtype=int), jump


# ------------------------------------------------------------------ per-film profile
@dataclass
class FilmProfile:
    """Everything the comparisons need, computed once per film. A few KB: cache it."""
    name: str
    fps: float
    duration_s: float
    version: int
    # colour
    hue_hist: np.ndarray        # chroma-weighted share of colour in each 10-degree hue bin
    colourfulness: float        # mean chroma; ~0 for black-and-white
    mean_a: float               # tint: green (-) <-> magenta (+)
    mean_b: float               # temperature: blue (-) <-> amber (+)
    chroma_q: np.ndarray
    # lightness
    light_q: np.ndarray
    dark_share: float           # fraction of runtime darker than DARK_L
    # editing
    n_cuts: int
    asl_s: float                # average shot length in seconds
    shot_q: np.ndarray          # log2(shot length in s)
    cut_jump_q: np.ndarray      # log2(colour jump at each cut, in JND)
    # log2(within-shot colour movement, in JND per second)
    motion_q: np.ndarray
    # shape over time: one point per 1% of runtime
    arc_lightness: np.ndarray
    arc_warmth: np.ndarray
    arc_cut_rate: np.ndarray    # cuts per minute

    @classmethod
    def from_frames(cls, rgb, fps, name="film", trim_start_s=0.0, trim_end_s=0.0, **cut_options):
        """rgb: (N, 3) or (N, K, 3) sRGB per frame, 0-255 or 0-1. Trim credits and logos:
        a long, dark credit roll skews every lightness and pacing statistic."""
        rgb = np.asarray(rgb, dtype=np.float64)
        if rgb.max() > 1.0:
            rgb = rgb / 255.0
        lo, hi = int(round(trim_start_s * fps)), len(rgb) - \
            int(round(trim_end_s * fps))
        if hi - lo < 2 * N_ARC:
            raise ValueError("too few frames left after trimming")
        cells = srgb_to_oklab(rgb[lo:hi].reshape(
            hi - lo, -1, 3))     # (N, K, 3)
        # one colour per frame
        frame = cells.mean(axis=1)
        lightness, green_magenta, blue_amber = frame.T
        pix = cells.reshape(-1, 3)
        chroma = np.hypot(pix[:, 1], pix[:, 2])
        hue_bin = (_hue_angle(pix) // (360 / N_HUE_BINS)
                   ).astype(int) % N_HUE_BINS
        hist = np.bincount(hue_bin, weights=chroma, minlength=N_HUE_BINS)

        n = len(frame)
        cuts, jump = detect_cuts(cells, fps, **cut_options)
        shots_s = np.diff(np.r_[0, cuts, n]) / fps
        in_shot = np.ones(n, dtype=bool)
        in_shot[0] = False
        for k in (-1, 0, 1):                   # frames touching a cut aren't "within a shot"
            in_shot[np.clip(cuts + k, 0, n - 1)] = False
        cut_flags = np.zeros(n)
        cut_flags[cuts] = 1.0

        return cls(
            name=name, fps=float(fps), duration_s=n / fps, version=FEATURE_VERSION,
            hue_hist=hist / hist.sum() if hist.sum() > 0 else np.full(N_HUE_BINS, 1 / N_HUE_BINS),
            colourfulness=float(chroma.mean()),
            mean_a=float(green_magenta.mean()), mean_b=float(blue_amber.mean()),
            chroma_q=quantiles(chroma),
            light_q=quantiles(pix[:, 0]), dark_share=float(np.mean(lightness < DARK_L)),
            n_cuts=len(cuts), asl_s=n / fps / (len(cuts) + 1),
            shot_q=quantiles(np.log2(shots_s)),
            cut_jump_q=quantiles(np.log2(jump[cuts] / JND)),
            motion_q=quantiles(
                np.log2(np.maximum(jump[in_shot] * fps / JND, 0.05))),
            arc_lightness=_arc(lightness), arc_warmth=_arc(blue_amber),
            arc_cut_rate=_arc(cut_flags * fps * 60, sigma=3.0),
        )

    def save(self, path):
        """Save as .npz. Profiles are small, so a whole library fits in memory."""
        np.savez_compressed(path, **asdict(self))

    @classmethod
    def load(cls, path):
        with np.load(path) as z:
            values = {f.name: z[f.name] for f in fields(cls)}
        values = {k: v.item() if v.ndim == 0 else v for k, v in values.items()}
        if values["version"] != FEATURE_VERSION:
            raise ValueError(
                f"{path} was built by an older feature version; rebuild it")
        return cls(**values)


# ------------------------------------------------------------------ metric plumbing
@dataclass
class Measure:
    """What a metric function returns."""
    distance: float              # raw, in natural units; 0 = identical
    unit: str
    summary: str                 # plain-language sentence(s)
    details: dict = field(default_factory=dict)
    score: float | None = None   # leave None to derive it from HALF_LIFE


@dataclass
class MetricResult(Measure):
    """What a report holds: the measure plus labels and, optionally, a library percentile."""
    key: str = ""
    label: str = ""
    section: str = ""
    percentile: float | None = None   # "closer than X% of the pairs in your library"


METRICS: dict[str, tuple[str, str, Callable]] = {}


def metric(key, label, section):
    """Register a comparison: fn(profile_a, profile_b) -> Measure."""
    def register(fn):
        METRICS[key] = (label, section, fn)
        return fn
    return register


def similarity(distance, half_life):
    """Distance -> 0-100. Identical = 100, one half-life apart = 50, two = 25, ..."""
    return 100.0 * 0.5 ** (max(distance, 0.0) / half_life)


def run_metric(key, a, b):
    label, section, fn = METRICS[key]
    m = fn(a, b)
    score = m.score
    if score is None and key in HALF_LIFE and np.isfinite(m.distance):
        score = similarity(m.distance, HALF_LIFE[key])
    return MetricResult(m.distance, m.unit, m.summary, m.details, score,
                        key=key, label=label, section=section)


def _amount(delta, slight, clear, large):
    d = abs(delta)
    if d < slight:
        return None
    return "slightly" if d < clear else "noticeably" if d < large else "much"


def _families(hist, top=2):
    """The biggest named hue families, e.g. [("orange", 0.58), ("teal", 0.21)]."""
    centres = (np.arange(N_HUE_BINS) + 0.5) * 360 / N_HUE_BINS
    anchors = np.array(list(_HUE_ANCHORS.values()))
    nearest = np.argmin(
        np.abs((centres[:, None] - anchors + 180) % 360 - 180), axis=1)
    share = np.bincount(nearest, weights=hist, minlength=len(anchors))
    names = list(_HUE_ANCHORS)
    return [(names[i], float(share[i])) for i in np.argsort(share)[::-1][:top]]


def _fmt_families(fams):
    return ", ".join(f"{name} {share:.0%}" for name, share in fams)


def _fmt_score(x):
    return "  -" if x is None else f"{x:3.0f}"


def _ratio(va, vb, a, b):
    """(film with the larger value, the other film, ratio), or None if within 15%."""
    ratio = max(va, vb) / max(min(va, vb), 1e-9)
    if ratio < 1.15:
        return None
    return (a, b, ratio) if va >= vb else (b, a, ratio)


# ------------------------------------------------------------------ the metrics
@metric("hue", "Hue", "Colour")
def hue(a, b):
    mono = [p.name for p in (a, b) if p.colourfulness < MONO_CHROMA]
    if mono:
        verb = "are" if len(mono) > 1 else "is"
        return Measure(np.nan, "deg", f"{' and '.join(mono)} {verb} essentially black-and-white, "
                                      "so hue isn't meaningful; see Saturation.")
    d = circular_emd(a.hue_hist, b.hue_hist, 360 / N_HUE_BINS)
    fa, fb = _families(a.hue_hist), _families(b.hue_hist)
    casts = []
    for delta, pos, neg in ((b.mean_b - a.mean_b, "warmer (more amber)", "cooler (bluer)"),
                            (b.mean_a - a.mean_a, "more magenta", "greener")):
        amount = _amount(delta, 0.006, 0.015, 0.035)
        if amount:
            casts.append(f"{amount} {pos if delta > 0 else neg}")
    cast = (f"{b.name}'s overall cast is {' and '.join(casts)} than {a.name}'s." if casts
            else "Their overall colour casts match.")
    return Measure(d, "deg", f"Main hues: {_fmt_families(fa)} ({a.name}) vs "
                             f"{_fmt_families(fb)} ({b.name}). "
                             f"Hues would need to rotate ~{d:.0f}° on average to match. {cast}",
                   {"families_a": fa, "families_b": fb,
                    "temperature_shift": b.mean_b - a.mean_b, "tint_shift": b.mean_a - a.mean_a})


@metric("saturation", "Saturation", "Colour")
def saturation(a, b):
    ma, mb = at(a.chroma_q, 0.5), at(b.chroma_q, 0.5)
    text = f"Similarly saturated (median chroma {ma:.3f} vs {mb:.3f})."
    if r := _ratio(ma, mb, a, b):
        more, less, x = r
        text = (f"{more.name} is ~{x:.1f}× as colourful as {less.name} "
                f"(median chroma {max(ma, mb):.3f} vs {min(ma, mb):.3f}).")
        if min(ma, mb) < MONO_CHROMA:
            text = (f"{less.name} is essentially colourless; {more.name} is not "
                    f"(median chroma {max(ma, mb):.3f}).")
    return Measure(w1(a.chroma_q, b.chroma_q), "chroma", text,
                   {"median_chroma_a": ma, "median_chroma_b": mb})


@metric("lightness", "Lightness", "Lightness")
def lightness(a, b):
    ma, mb = at(a.light_q, 0.5), at(b.light_q, 0.5)
    amount = _amount(mb - ma, 0.02, 0.05, 0.10)
    darker = a if ma < mb else b
    text = (f"{darker.name} is {amount} darker overall (median lightness {min(ma, mb):.2f} vs "
            f"{max(ma, mb):.2f}, where 0 = black and 1 = white)." if amount else
            f"Similar overall brightness (median lightness {ma:.2f} vs {mb:.2f}).")
    ra = at(a.light_q, 0.9) - at(a.light_q, 0.1)
    rb = at(b.light_q, 0.9) - at(b.light_q, 0.1)
    if abs(ra - rb) >= 0.04:
        text += (f" {(a if ra > rb else b).name} swings more between dark and bright scenes "
                 f"(tonal range {max(ra, rb):.2f} vs {min(ra, rb):.2f}).")
    text += f" Dark scenes: {a.dark_share:.0%} of {a.name} vs {b.dark_share:.0%} of {b.name}."
    return Measure(w1(a.light_q, b.light_q), "L", text,
                   {"median_a": ma, "median_b": mb, "tonal_range_a": ra, "tonal_range_b": rb,
                    "dark_share_a": a.dark_share, "dark_share_b": b.dark_share})


@metric("pacing", "Pacing", "Editing")
def pacing(a, b):
    few = [p.name for p in (a, b) if p.n_cuts < 3]
    if few:
        return Measure(np.nan, "doublings", f"Almost no cuts detected in {' and '.join(few)} "
                       "(long takes, dissolves, or cuts too subtle for one colour per frame).")
    ma, mb = 2 ** at(a.shot_q, 0.5), 2 ** at(b.shot_q, 0.5)
    text = (f"{a.name} cuts every {ma:.1f}s (median shot; average {a.asl_s:.1f}s), "
            f"{b.name} every {mb:.1f}s (average {b.asl_s:.1f}s).")
    if r := _ratio(ma, mb, a, b):
        more, less, x = r
        text += f" {more.name}'s shots run ~{x:.1f}× longer."
    return Measure(w1(a.shot_q, b.shot_q), "doublings", text,
                   {"median_shot_s_a": ma, "median_shot_s_b": mb,
                    "asl_s_a": a.asl_s, "asl_s_b": b.asl_s,
                    "cuts_per_min_a": 60 * a.n_cuts / a.duration_s,
                    "cuts_per_min_b": 60 * b.n_cuts / b.duration_s})


@metric("turbulence", "Turbulence", "Editing")
def turbulence(a, b):
    ma, mb = 2 ** at(a.motion_q, 0.5), 2 ** at(b.motion_q, 0.5)
    text = "Within shots, colour is about equally steady in both."
    if r := _ratio(ma, mb, a, b):
        more, less, x = r
        text = (f"Within shots, {more.name}'s colour moves ~{x:.1f}× as much as {less.name}'s "
                "(camera or subject motion, lighting changes, flicker).")
    return Measure(w1(a.motion_q, b.motion_q), "doublings", text,
                   {"median_motion_jnd_per_s_a": ma, "median_motion_jnd_per_s_b": mb})


@metric("cut_contrast", "Cut contrast", "Editing")
def cut_contrast(a, b):
    if min(a.n_cuts, b.n_cuts) < 3:
        return Measure(np.nan, "doublings", "Not enough cuts detected to compare.")
    ma, mb = 2 ** at(a.cut_jump_q, 0.5), 2 ** at(b.cut_jump_q, 0.5)
    text = f"Cuts jump about equally far in colour ({ma:.0f} vs {mb:.0f} just-noticeable steps)."
    if r := _ratio(ma, mb, a, b):
        more, less, x = r
        text = (f"{more.name}'s cuts jump ~{x:.1f}× further in colour (a typical cut is "
                f"{max(ma, mb):.0f} vs {min(ma, mb):.0f} just-noticeable steps); "
                f"{less.name} cuts between more similar-looking shots.")
    return Measure(w1(a.cut_jump_q, b.cut_jump_q), "doublings", text,
                   {"median_cut_jump_jnd_a": ma, "median_cut_jump_jnd_b": mb})


def _arc_metric(attr, what, extreme, use_max):
    def compare_arcs(a, b):
        xa, xb = getattr(a, attr), getattr(b, attr)
        r = _pearson(xa, xb)
        if not np.isfinite(r):
            return Measure(np.nan, "1 - r", f"{what} is flat in one film; no arc to compare.")
        trend = ("rises and falls at the same points in both" if r >= 0.6 else
                 "follows a loosely similar course" if r >= 0.3 else
                 "evolves independently" if r > -0.3 else "moves in opposite directions")
        pick = np.argmax if use_max else np.argmin
        pa, pb = [(pick(x) + 0.5) * 100 / N_ARC for x in (xa, xb)]
        return Measure(1 - r, "1 - r", f"{what} {trend} (r = {r:.2f}). {extreme}: {pa:.0f}% of the "
                                       f"way through {a.name}, {pb:.0f}% through {b.name}.",
                       {"r": r, "extreme_pct_a": pa, "extreme_pct_b": pb}, score=100 * max(r, 0.0))
    return compare_arcs


for _key, _label, _attr, _what, _extreme, _max in (
        ("lightness_arc", "Lightness arc", "arc_lightness",
         "Brightness", "Darkest stretch", False),
        ("warmth_arc", "Warmth arc", "arc_warmth",
         "Colour temperature", "Warmest stretch", True),
        ("pacing_arc", "Pacing arc", "arc_cut_rate", "Cutting rate", "Fastest cutting", True)):
    metric(_key, _label, "Shape over time")(
        _arc_metric(_attr, _what, _extreme, _max))


# ------------------------------------------------------------------ comparing and reporting
SECTION_ORDER = ["Colour", "Lightness", "Editing", "Shape over time"]
# what "overall" averages
HEADLINE_SECTIONS = ("Colour", "Lightness", "Editing")


@dataclass
class Report:
    name_a: str
    name_b: str
    results: list

    def sections(self):
        found = list(dict.fromkeys(r.section for r in self.results))
        extra = [s for s in found if s not in SECTION_ORDER]
        return [s for s in SECTION_ORDER if s in found] + extra

    def section_score(self, section):
        scores = [r.score for r in self.results if r.section ==
                  section and r.score is not None]
        return float(np.mean(scores)) if scores else None

    @property
    def overall(self):
        scores = [s for s in map(
            self.section_score, HEADLINE_SECTIONS) if s is not None]
        return float(np.mean(scores)) if scores else None

    def to_dict(self):
        return _clean({"a": self.name_a, "b": self.name_b, "overall": self.overall,
                       "sections": {s: self.section_score(s) for s in self.sections()},
                       "metrics": [asdict(r) for r in self.results]})

    def to_text(self, width=100):
        num = _fmt_score
        lines = [f"{self.name_a} vs {self.name_b}".ljust(
            width - 7) + f"{num(self.overall)}/100"]
        for section in self.sections():
            lines += ["", section.upper().ljust(width - 7) +
                      num(self.section_score(section))]
            for r in (r for r in self.results if r.section == section):
                head = f"  {r.label:<14}{num(r.score)}  "
                text = r.summary
                if r.percentile is not None:
                    text += f" (Closer than {r.percentile:.0f}% of library pairs.)"
                lines.append(textwrap.fill(text, width, initial_indent=head, break_on_hyphens=False,
                                           subsequent_indent=" " * len(head)))
        return "\n".join(lines)


def compare(a, b, calibrator=None, keys=None):
    results = [run_metric(k, a, b) for k in (keys or METRICS)]
    if calibrator is not None:
        for r in results:
            r.percentile = calibrator.percentile(r.key, r.distance)
    return Report(a.name, b.name, results)


class Calibrator:
    """Scores a pair relative to every pair in your own library ("closer than 87% of pairs").
    This scale needs no hand-tuned constants and is anchored in films people know."""

    def __init__(self):
        self.reference = {}

    def fit(self, profiles):
        dists = {k: [] for k in METRICS}
        for a, b in itertools.combinations(profiles, 2):
            for k in METRICS:
                d = run_metric(k, a, b).distance
                if np.isfinite(d):
                    dists[k].append(d)
        self.reference = {k: np.sort(v) for k, v in dists.items() if v}
        return self

    def percentile(self, key, distance):
        ref = self.reference.get(key)
        if ref is None or not np.isfinite(distance):
            return None
        return 100.0 * (ref.size - np.searchsorted(ref, distance, side="right")) / ref.size

    def suggested_half_lives(self):
        """Median library distance per metric; HALF_LIFE.update(this) makes 50 = a typical pair."""
        return {k: float(np.median(v)) for k, v in self.reference.items() if k in HALF_LIFE}


def _clean(x):
    """JSON-safe copy: numpy -> Python types, NaN -> None, floats rounded."""
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_clean(v) for v in x]
    if isinstance(x, (float, np.floating)):
        return round(float(x), 4) if np.isfinite(x) else None
    if isinstance(x, np.integer):
        return int(x)
    return x


# ------------------------------------------------------------------ plugging in existing metrics
# Alignment metrics answer a different question ("is this the same footage, in the same
# order?"), so give them their own section and express them in runtime, not raw scores.
# Keep whatever sequence your aligner needs on the profile (e.g. an extra `symbols` field).
#
# @metric("shared_footage", "Shared footage", "Alignment")
# def shared_footage(a, b):
#     seg = your_smith_waterman(a.symbols, b.symbols)        # best local alignment, in frames
#     coverage = seg.length / min(len(a.symbols), len(b.symbols))
#     return Measure(1 - coverage, "1 - coverage",
#                    f"Longest shared sequence: {seg.length / a.fps / 60:.1f} min, starting at "
#                    f"{timecode(seg.start_a / a.fps)} in {a.name} and "
#                    f"{timecode(seg.start_b / b.fps)} in {b.name}.",
#                    score=100 * coverage)


# ------------------------------------------------------------------ demo with synthetic films
def synthetic_film(seed, minutes=30, fps=24.0, median_shot_s=4.0, hue_deg=60.0, hue_spread=35.0,
                   chroma=0.05, lightness=0.5, motion=0.0015):
    """Fake per-frame colours (0-255): lognormal shot lengths; each shot gets a base colour
    that drifts a little from frame to frame."""
    rng = np.random.default_rng(seed)
    frames_left, shots = int(minutes * 60 * fps), []
    while frames_left > 0:
        n = max(8, int(rng.lognormal(np.log(median_shot_s * fps), 0.7)))
        h = np.radians(rng.normal(hue_deg, hue_spread))
        c = abs(rng.normal(chroma, chroma / 3))
        base = np.array([np.clip(rng.normal(lightness, 0.12), 0.08, 0.95),
                         c * np.cos(h), c * np.sin(h)])
        shots.append(base + np.cumsum(rng.normal(0, motion, (n, 3)), axis=0))
        frames_left -= n
    return oklab_to_srgb(np.concatenate(shots)[:int(minutes * 60 * fps)]) * 255


if __name__ == "__main__":
    fps = 24.0
    a = FilmProfile.from_frames(synthetic_film(1, median_shot_s=2.5, hue_deg=55, lightness=0.42,
                                               motion=0.003), fps, name="Film A")
    b = FilmProfile.from_frames(synthetic_film(2, median_shot_s=6.0, hue_deg=210, chroma=0.035,
                                               lightness=0.55), fps, name="Film B")
    rng = np.random.default_rng(0)
    library = [FilmProfile.from_frames(synthetic_film(
        seed, minutes=15, median_shot_s=rng.uniform(2, 8), hue_deg=rng.uniform(0, 360),
        chroma=rng.uniform(0.02, 0.07), lightness=rng.uniform(0.35, 0.6),
        motion=rng.uniform(0.001, 0.004)), fps, name=f"lib{seed}") for seed in range(10, 40)]
    print(compare(a, b, Calibrator().fit(library)).to_text())
