import colorsys
import io
import json
import zipfile
from pathlib import Path

from PIL import Image

RESULTS = Path("/home/kalmus/kalmus/results")

LIGHTNESS_MIN = 0.25
LIGHTNESS_MAX = 0.75

# same as CZ
HUE_BIN = 2.5
LIGHTNESS_BIN = 0.1

def load_job(job_id: str):
    """
    read result's barcode.json and thumbnails.json
    """
    job_path = RESULTS / job_id
    barcode = json.loads((job_path / "barcode.json").read_text())
    thumb =json.loads((job_path / "thumbnails.json").read_text())

    colors = [tuple(c) for c in barcode["colors"]]

    thumbnails = thumb["thumbnails"]

    return colors, thumbnails, barcode

def color_sort(frame_data):
    """
    frame # walthrough bottom, left to right, up.
    """
    hue = frame_data["hue"]
    value = frame_data["value"]

    light_bin = int(value / LIGHTNESS_BIN)
    hue_bin = int(hue / HUE_BIN)

    return(light_bin, hue_bin, hue, value)


def select_frames(job_id: str):
    """
    proper frame selection based on hue and lightness
    """
    colors, thumbnails, barcode = load_job(job_id)
    skip_over = int(barcode.get("skip_over", 0))
    step = int(barcode.get("sampled_frame_rate", 1))

    frames_kept = []

    for thumb in thumbnails:
        frame = thumb["frame_index"]
        i = round((frame - skip_over) / step)

        if i < 0 or i >= len(colors):
            continue

        r, g, b = colors[i]
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if LIGHTNESS_MIN < v < LIGHTNESS_MAX:
            frames_kept.append({"thumbnail": thumb, "hue": h * 360, "value": v})

    return sorted(frames_kept, key = color_sort)

def frame_sheet_path(job_id: str, sheet_index: int) -> Path:
    return RESULTS / job_id / f"thumbnails_{sheet_index:03d}.webp"

def extract_to_zip(job_id: str, out_zip: Path):
    """
    crop frames from sheet and add to zip
    """
    frame_kept = select_frames(job_id)
    print(f"{len(frame_kept)} frames kept")
    print(f"writing {out_zip}")

    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_STORED) as zip:
        zip.writestr(
            "README.md",
            f"Job ID: {job_id}\n"
            f"Number of frames kept: {len(frame_kept)}\n"
            f"Order of frames: canvas walkthrough. (bottom to top, left to right)\n",
        )

        sheets: dict[int, Image.Image] = {}
        try:
            for seq, fd in enumerate(frame_kept, start = 1):
                th = fd["thumbnail"]
                sheet = sheets.setdefault(
                    th["sheet_index"],
                    Image.open(frame_sheet_path(job_id, th["sheet_index"])).convert("RGB"),
                )
                crop = sheet.crop((th["x"], th["y"], th["x"] + th["width"], th["y"] + th["height"]))
                name = (
                    f"frame_{seq:04d}"
                    f"_h{int(fd['hue']):03d}"
                    f"_v{int(fd['value'] * 100):02d}.png"
                )
                buf = io.BytesIO()
                crop.save(buf, format="PNG", quality=90)
                zip.writestr(name, buf.getvalue())
        finally:
            for sheet in sheets.values():
                sheet.close()

        print({f"{out_zip} done."})


def main():
    job_id = "b8e9391e-e299-4a43-9f9f-3ce2b7b328e7" # change
    extract_to_zip(job_id, Path(f"/home/kalmus/{job_id}_frames.zip"))

if __name__ == "__main__":
    main()
