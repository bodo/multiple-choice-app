import streamlit as st
import fitz  # pymupdf
from pathlib import Path

FLAT_PDFS = Path(__file__).parent / "processed_data" / "flat_pdfs"

st.set_page_config(layout="wide", page_title="Exam Viewer")


# ---------------------------------------------------------------------------
# Cached rendering
# ---------------------------------------------------------------------------

@st.cache_data
def render_page(pdf_path: str, page_num: int) -> bytes:
    doc = fitz.open(pdf_path)
    pix = doc[page_num].get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
    return pix.tobytes("png")


@st.cache_data
def page_list(folder_path: str) -> list[tuple[str, str, int]]:
    """Return [(pdf_path, pdf_name, page_num), ...] for all PDFs in folder."""
    pages = []
    for pdf in sorted(Path(folder_path).glob("*.pdf")):
        doc = fitz.open(str(pdf))
        for i in range(len(doc)):
            pages.append((str(pdf), pdf.name, i))
    return pages


# ---------------------------------------------------------------------------
# List view
# ---------------------------------------------------------------------------

def list_view() -> None:
    st.title("Exams")
    folders = sorted(d for d in FLAT_PDFS.iterdir() if d.is_dir())
    if not folders:
        st.warning(f"No exam folders found in {FLAT_PDFS}")
        return
    for folder in folders:
        n_pdfs = len(list(folder.glob("*.pdf")))
        if st.button(f"{folder.name}  —  {n_pdfs} PDF{'s' if n_pdfs != 1 else ''}", key=folder.name):
            st.session_state.exam = folder.name
            st.rerun()


# ---------------------------------------------------------------------------
# Detail view
# ---------------------------------------------------------------------------

def detail_view(exam: str) -> None:
    if st.button("← Back"):
        st.session_state.exam = None
        st.rerun()

    st.title(exam)

    pages = page_list(str(FLAT_PDFS / exam))
    if not pages:
        st.info("No pages found.")
        return

    cols = st.columns(3)
    for i, (path, name, page_num) in enumerate(pages):
        with cols[i % 3]:
            st.image(
                render_page(path, page_num),
                caption=f"{name}  p.{page_num + 1}",
                use_container_width=True,
            )


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

if "exam" not in st.session_state:
    st.session_state.exam = None

if st.session_state.exam:
    detail_view(st.session_state.exam)
else:
    list_view()
