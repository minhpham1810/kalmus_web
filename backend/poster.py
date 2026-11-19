"""Posters are stored at one size only: POSTER_SIZE (width, height), stretched to fit, never cropped."""

from PIL import Image

POSTER_SIZE = (80, 120)


def resize_poster(path: str) -> bool:
    """Resize the poster at path to POSTER_SIZE in place. Returns True if the file was changed."""
    with Image.open(path) as img:
        if img.size == POSTER_SIZE:
            return False
        fmt = img.format
        if img.mode == "P":
            img = img.convert("RGBA")
        resized = img.resize(POSTER_SIZE, Image.LANCZOS)
    if fmt == "JPEG" and resized.mode not in ("RGB", "L"):
        resized = resized.convert("RGB")
    resized.save(path, format=fmt)
    return True
