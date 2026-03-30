"""Render PDF pages with optional box overlays (PIL, same as legacy app)."""

from __future__ import annotations

import io
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

from colors import box_label, ex_color, hex_rgb

RENDER_SCALE = 2.75
ANNOTATE_BG_SCALE = 4.0
# Cheap static preview in grid cells that are not near the viewport (saves RAM).
PREVIEW_RENDER_SCALE = 1.6
# Hard cap on longest side (px) of intermediate MuPDF raster — avoids OOM on huge pages.
MAX_RASTER_LONG_SIDE = 4096
MIN_RASTER_SCALE = 0.2


def _load_font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def render_raw(pdf_path: str, page_num: int, scale: float) -> tuple[bytes, int, int]:
    with fitz.open(pdf_path) as doc:
        page = doc[page_num]
        pw_pt = page.rect.width
        ph_pt = page.rect.height
        max_pt = max(pw_pt, ph_pt)
        eff = float(scale)
        if max_pt * eff > MAX_RASTER_LONG_SIDE:
            eff = MAX_RASTER_LONG_SIDE / max_pt
        eff = max(eff, MIN_RASTER_SCALE)
        pix = page.get_pixmap(matrix=fitz.Matrix(eff, eff))
        return pix.tobytes("png"), pix.width, pix.height


def render_with_boxes(
    pdf_path: str,
    page_num: int,
    boxes: list[dict],
    ann: dict,
    scale: float = RENDER_SCALE,
) -> Image.Image:
    raw, pw, ph = render_raw(pdf_path, page_num, scale)
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    # Font and stroke scale with raster resolution; final downscale to UI width keeps labels readable.
    label_px = max(20, int(round(11 * scale)))
    outline_w = max(2, min(10, int(round(1.4 * scale))))
    pad = max(4, int(round(2.5 * scale)))
    font = _load_font(label_px)

    for box in boxes:
        r = box["rect"]
        x0, y0 = r[0] * pw, r[1] * ph
        x1, y1 = r[2] * pw, r[3] * ph
        rgb = hex_rgb(ex_color(box["exercise"]))
        draw.rectangle(
            [x0, y0, x1, y1],
            fill=(*rgb, 50),
            outline=(*rgb, 220),
            width=outline_w,
        )
        lbl = box_label(ann, box["exercise"], box["sub"])
        tx, ty = x0 + pad, y0 + max(2, pad // 2)
        # Light halo so labels stay legible on busy PDF backgrounds.
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            draw.text((tx + dx, ty + dy), lbl, fill=(255, 255, 255, 220), font=font)
        draw.text((tx, ty), lbl, fill=(*rgb, 255), font=font)

    return Image.alpha_composite(img, overlay).convert("RGB")


def get_page_list(folder_path: str | Path) -> list[tuple[str, str, int]]:
    pages: list[tuple[str, str, int]] = []
    root = Path(folder_path)
    for pdf in sorted(root.glob("*.pdf")):
        with fitz.open(str(pdf)) as doc:
            for i in range(len(doc)):
                pages.append((str(pdf), pdf.name, i))
    return pages
