from pathlib import Path
import sys

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import generate_layers as gl


def test_watermark_rect_matches_frontend_lower_left_placement():
    # Mirrors tests/watermark.test.ts in the frontend.
    assert gl.watermark_rect(4000, 2000, 400, 100) == (60, 1790, 600, 150)
    assert gl.watermark_rect(3000, 100, 400, 100) == (3, 77, 80, 20)


def test_add_watermark_only_touches_lower_left_corner(tmp_path):
    logo = Image.new("RGBA", (40, 10), (255, 255, 255, 255))
    logo_path = tmp_path / "logo.png"
    logo.save(logo_path)
    img = Image.new("RGB", (1000, 500), (0, 0, 0))

    gl.add_watermark(img, logo_path)

    x, y, w, h = gl.watermark_rect(1000, 500, 40, 10)
    assert img.getpixel((x + w // 2, y + h // 2)) != (0, 0, 0)
    assert img.getpixel((999, 0)) == (0, 0, 0)
    assert img.getpixel((500, 250)) == (0, 0, 0)
