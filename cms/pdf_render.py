"""Render PDF pages with optional box overlays (PIL, same as legacy app)."""

from __future__ import annotations

import io
from collections import OrderedDict
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont
from PySide6.QtCore import Qt
from PySide6.QtGui import QImage

from colors import box_caption, ex_sub_rgb

RENDER_SCALE = 2.75
ANNOTATE_BG_SCALE = 4.0
PREVIEW_RENDER_SCALE = 1.6
MAX_RASTER_LONG_SIDE = 4096
MIN_RASTER_SCALE = 0.2

_PAGE_CACHE_MAX_ENTRIES = 48
_PAGE_CACHE_MAX_BYTES = 400 * 1024 * 1024


def _load_font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def fitz_pixmap_to_qimage(pix: fitz.Pixmap) -> QImage:
    """Copy MuPDF pixmap samples into a QImage (no PNG round-trip)."""
    pm = pix
    if pm.alpha:
        pm = fitz.Pixmap(pm, 0)
    if pm.n not in (1, 3, 4):
        pm = fitz.Pixmap(fitz.csRGB, pm)
    n = pm.n
    if n == 1:
        fmt = QImage.Format.Format_Grayscale8
    elif n == 3:
        fmt = QImage.Format.Format_RGB888
    elif n == 4:
        fmt = QImage.Format.Format_RGBA8888
    else:
        raise ValueError(f"unsupported pixmap components: {n}")
    w, h = pm.width, pm.height
    stride = pm.stride
    # PyMuPDF 1.24+: tobytes("raw") removed; .samples is the packed pixel buffer.
    buf = pm.samples
    img = QImage(buf, w, h, stride, fmt)
    return img.copy()


class PageRasterCache:
    def __init__(
        self,
        max_entries: int = _PAGE_CACHE_MAX_ENTRIES,
        max_bytes: int = _PAGE_CACHE_MAX_BYTES,
    ) -> None:
        self._max_entries = max_entries
        self._max_bytes = max_bytes
        self._order: OrderedDict[tuple[str, int, int], QImage] = OrderedDict()
        self._approx_bytes = 0

    def clear(self) -> None:
        self._order.clear()
        self._approx_bytes = 0

    def _img_bytes(self, im: QImage) -> int:
        return im.sizeInBytes()

    def get(self, key: tuple[str, int, int]) -> QImage | None:
        im = self._order.get(key)
        if im is None:
            return None
        self._order.move_to_end(key)
        return im

    def put(self, key: tuple[str, int, int], im: QImage) -> None:
        if key in self._order:
            old = self._order.pop(key)
            self._approx_bytes -= self._img_bytes(old)
        self._order[key] = im
        self._order.move_to_end(key)
        self._approx_bytes += self._img_bytes(im)
        while len(self._order) > self._max_entries or self._approx_bytes > self._max_bytes:
            if not self._order:
                break
            _, victim = self._order.popitem(last=False)
            self._approx_bytes -= self._img_bytes(victim)


_PAGE_RASTER_CACHE = PageRasterCache()


def page_raster_cache_clear() -> None:
    _PAGE_RASTER_CACHE.clear()


def _width_bucket(w: int) -> int:
    return (w + 31) // 32 * 32


def render_pdf_page_qimage(
    pdf_path: str,
    page_num: int,
    target_pixel_width: int,
    *,
    use_cache: bool = True,
) -> QImage:
    """Rasterize PDF page only (no box overlays). Width matches target_pixel_width."""
    bw = _width_bucket(target_pixel_width)
    key = (pdf_path, page_num, bw)
    if use_cache:
        hit = _PAGE_RASTER_CACHE.get(key)
        if hit is not None and not hit.isNull():
            if hit.width() == target_pixel_width:
                return hit
            th = int(round(hit.height() * target_pixel_width / max(1, hit.width())))
            return hit.scaled(
                target_pixel_width,
                th,
                Qt.AspectRatioMode.IgnoreAspectRatio,
                Qt.TransformationMode.SmoothTransformation,
            )
    with fitz.open(pdf_path) as doc:
        page = doc[page_num]
        pw_pt = page.rect.width
        ph_pt = page.rect.height
        if pw_pt <= 0:
            pw_pt = 1.0
        z = target_pixel_width / pw_pt
        max_pt = max(pw_pt, ph_pt)
        if max_pt * z > MAX_RASTER_LONG_SIDE:
            z = MAX_RASTER_LONG_SIDE / max_pt
        z = max(z, MIN_RASTER_SCALE)
        try:
            dl = page.get_displaylist()
            pix = dl.get_pixmap(matrix=fitz.Matrix(z, z), alpha=False)
        except Exception:
            pix = page.get_pixmap(matrix=fitz.Matrix(z, z), alpha=False)
        qim = fitz_pixmap_to_qimage(pix)
    if qim.width() != target_pixel_width:
        th = int(round(qim.height() * target_pixel_width / max(1, qim.width())))
        qim = qim.scaled(
            target_pixel_width,
            th,
            Qt.AspectRatioMode.IgnoreAspectRatio,
            Qt.TransformationMode.SmoothTransformation,
        )
    if use_cache:
        _PAGE_RASTER_CACHE.put(key, qim.copy())
    return qim


def pil_rgb_to_qimage(im: Image.Image) -> QImage:
    im = im.convert("RGB")
    data = im.tobytes("raw", "RGB")
    q = QImage(
        data,
        im.width,
        im.height,
        im.width * 3,
        QImage.Format.Format_RGB888,
    )
    return q.copy()


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
    label_px = max(20, int(round(11 * scale)))
    outline_w = max(2, min(10, int(round(1.4 * scale))))
    pad = max(4, int(round(2.5 * scale)))
    font = _load_font(label_px)

    for box in boxes:
        r = box["rect"]
        x0, y0 = r[0] * pw, r[1] * ph
        x1, y1 = r[2] * pw, r[3] * ph
        rgb = ex_sub_rgb(ann, box["exercise"], box["sub"])
        draw.rectangle(
            [x0, y0, x1, y1],
            fill=(*rgb, 50),
            outline=(*rgb, 220),
            width=outline_w,
        )
        lbl = box_caption(ann, box["exercise"], box["sub"])
        tx, ty = x0 + pad, y0 + max(2, pad // 2)
        bbox = draw.textbbox((tx, ty), lbl, font=font)
        pad_bg = max(2, int(round(1.5 * scale)))
        bg_box = [
            bbox[0] - pad_bg,
            bbox[1] - pad_bg,
            bbox[2] + pad_bg,
            bbox[3] + pad_bg,
        ]
        rad = max(3, pad_bg)
        if hasattr(draw, "rounded_rectangle"):
            draw.rounded_rectangle(bg_box, radius=rad, fill=(255, 255, 255, 128))
        else:
            draw.rectangle(bg_box, fill=(255, 255, 255, 128))
        draw.text((tx, ty), lbl, fill=(*rgb, 255), font=font)

    return Image.alpha_composite(img, overlay).convert("RGB")


def estimate_page_height_for_width(
    pdf_path: str, page_num: int, width_px: int
) -> int:
    """Cheap aspect-ratio placeholder height (no raster)."""
    with fitz.open(pdf_path) as doc:
        r = doc[page_num].rect
        w_pt = float(r.width)
        if w_pt <= 0:
            return width_px
        return max(1, int(width_px * r.height / w_pt))


def get_page_list(folder_path: str | Path) -> list[tuple[str, str, int]]:
    pages: list[tuple[str, str, int]] = []
    root = Path(folder_path)
    for pdf in sorted(root.glob("*.pdf")):
        with fitz.open(str(pdf)) as doc:
            for i in range(len(doc)):
                pages.append((str(pdf), pdf.name, i))
    return pages
