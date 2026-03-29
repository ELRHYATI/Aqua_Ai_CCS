"""
Convert markdown report to PDF with Azura Aqua branding.
Uses reportlab. # TODO: replace with Azure OpenAI when ready
"""

import re
from datetime import datetime
from pathlib import Path
from typing import List

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.enums import TA_LEFT, TA_CENTER

REPORTS_DIR = Path(__file__).resolve().parent.parent.parent / "reports"


def _markdown_to_flowables(md: str) -> list:
    """Convert simple markdown (##, **, -, numbered) to ReportLab flowables."""
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        name="ReportTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=16,
        spaceAfter=12,
    )
    h2_style = ParagraphStyle(
        name="ReportH2",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        spaceAfter=8,
        spaceBefore=14,
    )
    body_style = ParagraphStyle(
        name="ReportBody",
        parent=styles["Normal"],
        fontSize=10,
        spaceAfter=6,
    )
    flowables = []
    for line in md.splitlines():
        line = line.strip()
        if not line:
            flowables.append(Spacer(1, 6))
            continue
        if line.startswith("## "):
            flowables.append(Paragraph(line[3:].strip(), h2_style))
        elif line.startswith("### "):
            flowables.append(Paragraph(f"<b>{line[4:].strip()}</b>", body_style))
        elif line.startswith("- ") or line.startswith("* "):
            flowables.append(Paragraph("• " + line[2:].strip(), body_style))
        elif re.match(r"^\d+\.\s", line):
            flowables.append(Paragraph(line, body_style))
        else:
            line = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", line)
            flowables.append(Paragraph(line, body_style))
    return flowables


def markdown_to_pdf(
    markdown_content: str,
    title: str,
    data_sources: List[str],
    output_path: Path,
) -> None:
    """Generate PDF from markdown with Azura Aqua header, footer, data sources."""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2.5 * cm,
        bottomMargin=2 * cm,
    )
    styles = getSampleStyleSheet()

    story = []
    story.append(Paragraph("AZURA AQUA", ParagraphStyle(name="Header", fontSize=18, fontName="Helvetica-Bold", alignment=TA_CENTER)))
    story.append(Paragraph(title, ParagraphStyle(name="Title", fontSize=14, fontName="Helvetica", alignment=TA_CENTER)))
    story.append(Paragraph(f"Date : {datetime.now().strftime('%d/%m/%Y')}", ParagraphStyle(name="Date", fontSize=9, alignment=TA_CENTER)))
    story.append(Spacer(1, 20))

    flowables = _markdown_to_flowables(markdown_content)
    story.extend(flowables)

    story.append(Spacer(1, 24))
    story.append(Paragraph("<b>Sources de données :</b>", ParagraphStyle(name="SourcesTitle", fontSize=10, fontName="Helvetica-Bold")))
    for src in data_sources:
        story.append(Paragraph(f"• {src}", ParagraphStyle(name="Source", fontSize=9)))
    story.append(Spacer(1, 12))

    def add_page_number(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 9)
        page_num = canvas.getPageNumber()
        canvas.drawRightString(doc.pagesize[0] - 2 * cm, 1 * cm, f"Page {page_num}")
        canvas.restoreState()

    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
