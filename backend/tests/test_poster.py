from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image

from poster import POSTER_SIZE, resize_poster


def test_resize_poster_stretches_jpg_to_80x120(tmp_path):
    path = tmp_path / "poster.jpg"
    Image.new("RGB", (300, 400), "red").save(path)
    assert resize_poster(str(path)) is True
    with Image.open(path) as img:
        assert img.size == POSTER_SIZE
        assert img.format == "JPEG"


def test_resize_poster_keeps_png_and_skips_correct_size(tmp_path):
    path = tmp_path / "poster.png"
    Image.new("P", (500, 750)).save(path)
    assert resize_poster(str(path)) is True
    with Image.open(path) as img:
        assert img.size == POSTER_SIZE
        assert img.format == "PNG"
    assert resize_poster(str(path)) is False
