"""Exercise colors and box labels (same scheme as the former Streamlit app)."""

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


def box_label(ann: dict, ex: str, sub: str) -> str:
    subs = ann["exercises"].get(ex, {}).get("subs", ["Main"])
    return f"{ex}.{sub_idx(subs, sub)}"
