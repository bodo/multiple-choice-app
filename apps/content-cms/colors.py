"""Exercise colors and box labels (same scheme as the former Streamlit app)."""

from __future__ import annotations

import colorsys

PALETTE = [
    "#e74c3c", "#3498db", "#2ecc71", "#f39c12",
    "#9b59b6", "#1abc9c", "#e67e22", "#2c3e50",
]


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def ex_color(ex: str) -> str:
    return PALETTE[(int(ex) - 1) % len(PALETTE)]


def sub_idx(subs: list[str], sub: str) -> int:
    return subs.index(sub) if sub in subs else 0


# No sub-index in canvas labels; custom subs use 1-based numbering among non-reserved only.
RESERVED_SUBS = frozenset({"Main", "Answer Key", "Answer Options", "Answer"})


def custom_sub_index_1based(subs: list[str], sub: str) -> int | None:
    """1-based index among subs that are not Main/Answer Key/Answer Options."""
    if sub not in subs or sub in RESERVED_SUBS:
        return None
    customs = [s for s in subs if s not in RESERVED_SUBS]
    try:
        return customs.index(sub) + 1
    except ValueError:
        return None


def box_label(ann: dict, ex: str, sub: str) -> str:
    """Compact id for buttons (no numeric sub-index for reserved categories)."""
    subs = ann["exercises"].get(ex, {}).get("subs", ["Main"])
    if sub in RESERVED_SUBS:
        return f"{ex} · {sub}"
    n = custom_sub_index_1based(subs, sub)
    if n is None:
        return f"{ex} · {sub}"
    return f"{ex}.{n}"


def box_caption(ann: dict, ex: str, sub: str) -> str:
    """Canvas label: always includes exercise number. Reserved subs have no extra sub-index; custom use ex.N."""
    subs = ann["exercises"].get(ex, {}).get("subs", ["Main"])
    if sub in RESERVED_SUBS:
        return f"{ex} · {sub}"
    n = custom_sub_index_1based(subs, sub)
    if n is None:
        return f"{ex} · {sub}"
    return f"{ex}.{n} · {sub}"


def ex_sub_rgb(ann: dict, ex: str, sub: str) -> tuple[int, int, int]:
    """Same hue as exercise color; saturation scaled slightly by sub index."""
    subs = ann["exercises"].get(ex, {}).get("subs", ["Main"])
    r, g, b = hex_rgb(ex_color(ex))
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    h, s, v = colorsys.rgb_to_hsv(rf, gf, bf)
    si = sub_idx(subs, sub)
    n = len(subs)
    denom = max(1, n - 1)
    t = si / denom
    # Earlier subs slightly desaturated, later subs closer to base (subtle spread).
    sat_scale = 0.78 + 0.22 * t
    s = max(0.0, min(1.0, s * sat_scale))
    rf2, gf2, bf2 = colorsys.hsv_to_rgb(h, s, v)
    return (
        int(round(rf2 * 255)),
        int(round(gf2 * 255)),
        int(round(bf2 * 255)),
    )
