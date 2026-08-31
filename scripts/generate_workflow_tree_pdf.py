#!/usr/bin/env python3
"""
Generate WORKFLOW_TREE.pdf from docs/WORKFLOW_TREE.
Generates clean ASCII tree without font glyph replacement issues.
"""

from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable, Preformatted, PageBreak
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(40, 755, "OneShot Workflow_Tree — Source of Truth Execution Model")
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(40, 747, 572, 747)

        # Footer
        footer_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(572, 30, footer_text)
        self.drawString(40, 30, "OneShot Production E2E • Apache License 2.0 • Source of Truth")
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(40, 42, 572, 42)

        self.restoreState()


def normalize_tree_glyphs(text: str) -> str:
    replacements = {
        "│": "|",
        "▼": "v",
        "├──": "|--",
        "└──": "`--",
        "├": "|",
        "└": "`",
        "─": "-",
        "►": ">",
        "✓": "[OK]",
        "↓": "v",
        "→": "->",
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    return text


def build_workflow_tree_pdf():
    project_root = Path(__file__).resolve().parent.parent
    tree_file = project_root / "docs" / "WORKFLOW_TREE"
    output_pdf = project_root / "docs" / "WORKFLOW_TREE.pdf"

    tree_content = tree_file.read_text(encoding="utf-8")

    doc = SimpleDocTemplate(
        str(output_pdf),
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=46,
        bottomMargin=46
    )

    styles = getSampleStyleSheet()
    primary_color = colors.HexColor("#0969da")

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=4
    )

    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor("#475569"),
        spaceAfter=8
    )

    tree_code_style = ParagraphStyle(
        'TreeCode',
        parent=styles['Code'],
        fontName='Courier',
        fontSize=7.6,
        leading=9.8,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=0,
        spaceAfter=0
    )

    story = []

    # Header Title
    story.append(Paragraph("OneShot Workflow_Tree — Source of Truth", title_style))
    story.append(Paragraph("Hierarchical Core Execution Model • Canonical DAG & Role Responsibilities", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=primary_color, spaceAfter=8))

    # Strip markdown backticks if any
    clean_lines = []
    in_block = False
    for line in tree_content.splitlines():
        if line.startswith("#"):
            continue
        if line.strip().startswith("```"):
            in_block = not in_block
            continue
        clean_lines.append(line)

    clean_tree = normalize_tree_glyphs("\n".join(clean_lines).strip())

    # Preformatted Text Block
    pre = Preformatted(clean_tree, tree_code_style)
    story.append(pre)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"WORKFLOW_TREE_PDF_GENERATED path={output_pdf}")

    # Copy to D:/oneshot/docs/ if present
    alt_dir = Path("D:/oneshot/docs")
    if alt_dir.exists():
        alt_pdf = alt_dir / "WORKFLOW_TREE.pdf"
        import shutil
        shutil.copy(output_pdf, alt_pdf)
        print(f"ALT_PATH_COPIED path={alt_pdf}")

if __name__ == "__main__":
    build_workflow_tree_pdf()
