"""Render the actual DXF paperspaces/viewports with ezdxf drawing (no redrawing).

Usage: python tests/preview_int8_dxf.py [file.dxf] [output.pdf]
Requires ezdxf and matplotlib; writes per-sheet PNGs next to the PDF for review.
"""
from pathlib import Path
import sys

import ezdxf
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from ezdxf.addons.drawing import Frontend, RenderContext, config
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend


def render(source: Path, output: Path):
    doc = ezdxf.readfile(source)
    audit = doc.audit()
    assert not audit.errors and not audit.fixes, (audit.errors, audit.fixes)
    output.parent.mkdir(parents=True, exist_ok=True)
    ctx = RenderContext(doc)
    # Drawing properties use mm; Matplotlib line widths use typographic points.
    settings = config.Configuration(color_policy=config.ColorPolicy.BLACK, lineweight_scaling=72/25.4,
                                    background_policy=config.BackgroundPolicy.WHITE)
    pages = [p for p in doc.layouts if p.name != "Model"]
    with PdfPages(output, metadata={"Title": "JPN — Pranchas preliminares para conferência"}) as pdf:
        for i, page in enumerate(pages, 1):
            width, height = page.dxf.paper_width, page.dxf.paper_height
            fig = plt.figure(figsize=(width / 25.4, height / 25.4), dpi=140)
            ax = fig.add_axes((0, 0, 1, 1))
            backend = MatplotlibBackend(ax, adjust_figure=False)
            Frontend(ctx, backend, config=settings).draw_layout(page, finalize=True)
            ax.set_xlim(0, width)
            ax.set_ylim(0, height)
            ax.set_aspect("equal")
            ax.set_axis_off()
            pdf.savefig(fig, facecolor="white")
            fig.savefig(output.with_name(f"{output.stem}-{i:02}.png"), facecolor="white")
            plt.close(fig)
    print(f"INT-8 preview: {output}, {len(pages)} sheets, actual DXF viewports")


if __name__ == "__main__":
    render(Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".tools/int8/galpao.dxf"),
           Path(sys.argv[2]) if len(sys.argv) > 2 else Path(".tools/int8/galpao-pranchas.pdf"))
