#!/usr/bin/env python3
"""
Generate OneShot Workflow Processing Specification PDF.
Generates docs/Workflow_Processing.pdf

MANUAL_DOC_TOOLING: run manually to regenerate the tracked
docs/Workflow_Processing.pdf; not part of automated verification.
"""

import os
import sys
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, PageBreak, HRFlowable
)
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
        self.setFillColor(colors.HexColor("#6e7681"))
        
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(54, 750, "OneShot Production E2E — Workflow Processing Specification (v1.3.0)")
            self.setStrokeColor(colors.HexColor("#2d333b"))
            self.setLineWidth(0.5)
            self.line(54, 742, 558, 742)

        # Footer
        footer_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 36, footer_text)
        self.drawString(54, 36, "CONFIDENTIAL & PROPRIETARY • APACHE LICENSE 2.0 • SHA-256 VERIFIED")
        self.setStrokeColor(colors.HexColor("#2d333b"))
        self.setLineWidth(0.5)
        self.line(54, 48, 558, 48)

        self.restoreState()


def build_pdf():
    project_root = Path(__file__).resolve().parent.parent
    docs_dir = project_root / "docs"
    output_pdf = docs_dir / "Workflow_Processing.pdf"
    hero_image = project_root / "docs" / "assets" / "oneshot_workflow_hero.jpg"

    doc = SimpleDocTemplate(
        str(output_pdf),
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()
    
    # Custom Styles
    primary_color = colors.HexColor("#0969da")
    dark_bg = colors.HexColor("#0d1117")
    accent_cyan = colors.HexColor("#00848c")
    text_dark = colors.HexColor("#1f2328")
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=6
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#475569"),
        spaceAfter=14
    )
    
    h1_style = ParagraphStyle(
        'SectionH1',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True
    )
    
    h2_style = ParagraphStyle(
        'SectionH2',
        parent=styles['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=text_dark,
        spaceAfter=6
    )
    
    code_style = ParagraphStyle(
        'DocCode',
        parent=styles['Code'],
        fontName='Courier',
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#0f172a"),
        backColor=colors.HexColor("#f6f8fa"),
        borderPadding=6,
        spaceAfter=8
    )

    story = []

    # Title & Header
    story.append(Paragraph("OneShot Production E2E — Workflow Processing Specification", title_style))
    story.append(Paragraph("Comprehensive Technical Reference & Master Execution Model (v1.3.0)", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=primary_color, spaceAfter=12))

    # Hero Image
    if hero_image.exists():
        story.append(Image(str(hero_image), width=504, height=283))
        story.append(Spacer(1, 10))

    # Section 1: Executive Overview
    story.append(Paragraph("1. Executive Summary & Core Architectural Invariants", h1_style))
    story.append(Paragraph(
        "OneShot is an enterprise-grade deterministic AI execution platform combining strict JSON Schema Draft 2020-12 validation, multi-turn conversational intent collection, verifiable AI research providers (Google ADK & Featherless), multi-stage planning, refactoring, triple validation (Schema, Fixture, Goal), RFC 8785 canonicalization, SHA-256 cryptographic hashing, isolated process/container sandbox execution, and a FastAPI Workspace API control plane.",
        body_style
    ))
    story.append(Paragraph(
        "<b>Fundamental Invariant:</b> Authority Separation is strictly enforced: <code>ROLE ≠ SKILL ≠ TOOL ≠ WORKFLOW</code>. "
        "Every phase produces schema-validated artifacts with monotonic sequence ordering and W3C trace context.",
        body_style
    ))

    # Section 2: Canonical 27-Phase Execution Matrix
    story.append(Spacer(1, 10))
    story.append(Paragraph("2. Canonical 27-Phase Execution Trace", h1_style))
    story.append(Paragraph(
        "The end-to-end execution path progresses through 27 deterministic phases from user chat to isolated sandbox execution:",
        body_style
    ))

    table_data = [
        [Paragraph("<b>Phase</b>", body_style), Paragraph("<b>Phase Name</b>", body_style), Paragraph("<b>Handler / Component</b>", body_style), Paragraph("<b>Output Artifact / Invariant</b>", body_style)],
        ["1-3", "Intent & Prompt Gate", "backend/intent/intent-collection.ts", "Intent(id) revision → Prompt(id) work order."],
        ["4-7", "Researcher & Draft Validation", "backend/role/researcher/workflow.ts", "Structured Research Draft → 6 canonical bundle artifacts."],
        ["8-9", "Planner Audit", "backend/role/planner/workflow.ts", "7-area inspection → Audit(audit_id) findings."],
        ["10-12", "Refactor Engine", "backend/role/refactor/workflow.ts", "Preserves identical plan_id → Revision increment."],
        ["13-14", "Gap Analysis & Recheck", "backend/role/gap-analysis/workflow.ts", "Branch verification → proves gap_0: true (PASSED)."],
        ["15-16", "Evaluation Matrix", "backend/role/evaluation/workflow.ts", "9-point criteria check → Evaluation artifact."],
        ["17-20", "Triple Validation Engine", "backend/workflow/triple-validation.ts", "Schema + Fixture + Goal validators → all_valid: true."],
        ["21-22", "Confirmed Packaging", "backend/workflow/confirmation.ts", "ConfirmedCore (10 artifacts) → ConfirmedPackage."],
        ["23-25", "RFC 8785 & SHA-256 Hash", "backend/workflow/hash.ts", "Python JCS canonicalization → SHA-256 Hash equality."],
        ["26", "Canonical State DONE", "backend/runtime/workflow-runtime.ts", "HashProof snapshot → DONE terminal state."],
        ["27", "Sandbox Execution Boundary", "backend/sandbox/sandbox-service.ts", "Cryptographic admission → hash_sandbox == HASH."]
    ]

    t = Table(table_data, colWidths=[40, 120, 160, 184])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
    ]))
    story.append(t)

    story.append(PageBreak())

    # Section 3: Source of Truth Workflow Tree
    story.append(Paragraph("3. Source-of-Truth Workflow Tree Specification", h1_style))
    story.append(Paragraph(
        "Below is the hierarchical workflow execution tree specified in <code>docs/WORKFLOW_TREE</code>:",
        body_style
    ))

    workflow_tree_text = """START → USER → CHAT (Intent, Outcome, Requirements, Constraints)
  ↓
INTENT READY → GENERATOR → Prompt_id [Record: JOB_ID ✓]
  ↓
RESEARCHER (agent/researcher/workflow.ts)
  ├── LOAD SKILL: agent/researcher/skill/SKILL.md
  ├── Multi-Provider AI (Google ADK Gemma 2 / Featherless Gemma 4)
  └── OUTPUT: Researcher(id) [plan_id, schema_id, fixture_id, goal_id, validation_id]
  ↓
PLANNER (agent/planner/workflow.ts)
  ├── 7-Area Audit: sufficiency, file coverage, structure, design, goals, fixtures, conflicts
  └── OUTPUT: Audit(audit_id)
  ↓
REFACTOR / REFINEMENT (agent/refactor/workflow.ts)
  ├── Refine SAME plan_id (preserves identity & provenance)
  └── OUTPUT: Updated plan_id (Revision 2)
  ↓
GAP ANALYSIS (agent/gap-analysis/workflow.ts)
  ├── Branch verification & gap correction
  └── OUTPUT: FINAL plan_id with gap_0: true (PASSED)
  ↓
EVALUATION (agent/evaluation/workflow.ts)
  └── 9-Point evaluation matrix verification
  ↓
TRIPLE VALIDATION (validation/triple_validation.py)
  ├── Schema Validation (Draft 2020-12)
  ├── Fixture Validation (Assertion operators)
  └── Goal Validation (Success criteria alignment)
  └── OUTPUT: Final_Confirmed_Validation(hash) → all_valid: true
  ↓
CONFIRMATION & CANONICAL HASH (RFC 8785 JCS + SHA-256)
  └── ConfirmedPackage → created_hash == recomputed_hash → HASH ✓
  ↓
BUILDER / SANDBOX EXECUTION (backend/sandbox/sandbox-service.ts)
  └── Verified Admission → Isolated Execution → hash_sandbox == HASH → DONE ✓"""

    story.append(Paragraph(workflow_tree_text.replace("\n", "<br/>").replace(" ", "&nbsp;"), code_style))

    # Section 4: Triple Validation & Cryptographic Hash Proofs
    story.append(Spacer(1, 10))
    story.append(Paragraph("4. Triple Validation & Cryptographic Proof Verification", h1_style))
    story.append(Paragraph(
        "To guarantee total determinism and execution safety, OneShot implements three decoupled validation engines in Python:",
        body_style
    ))

    validation_items = [
        "<b>1. Schema Validation:</b> Proves that the plan, researcher output, fixtures, and contracts strictly conform to Draft 2020-12 JSON Schemas without extraneous or missing fields.",
        "<b>2. Fixture Validation:</b> Evaluates all assertion operators (<code>exists</code>, <code>equals</code>, <code>matchesSchema</code>, <code>contains</code>, <code>greaterThan</code>) against deterministic test inputs.",
        "<b>3. Goal Validation:</b> Traces all plan steps against declared success criteria and requirements to prove complete goal achievement.",
        "<b>4. RFC 8785 Canonicalization & SHA-256:</b> JCS serializes the exact core bytes in deterministic UTF-8 order, generating an immutable 64-character SHA-256 cryptographic hash."
    ]
    for item in validation_items:
        story.append(Paragraph(f"• {item}", body_style))

    # Section 5: Sandbox Execution Boundary
    story.append(Spacer(1, 10))
    story.append(Paragraph("5. Hardened Sandbox Isolation & Admission Gate", h1_style))
    story.append(Paragraph(
        "The external sandbox runtime provides a zero-trust execution boundary with three strict guarantees:",
        body_style
    ))
    sandbox_items = [
        "<b>Cryptographic Admission:</b> Rejects any tampered, modified, or malformed plan package before execution starts.",
        "<b>Isolated Execution:</b> Runs code under non-root users with strict CPU limits, memory quotas, total byte-write limits, and isolated <code>DENY_ALL</code> network policies.",
        "<b>Post-Execution Hash Parity:</b> Asserts that the executed sandbox package matches the immutable pre-execution hash: <code>hash_sandbox == HASH</code>."
    ]
    for item in sandbox_items:
        story.append(Paragraph(f"• {item}", body_style))

    # Section 6: Licensing & Attribution
    story.append(Spacer(1, 10))
    story.append(Paragraph("6. Software License & Governance", h1_style))
    story.append(Paragraph(
        "The OneShot Production E2E platform and all associated workflow processing engines, contracts, skills, and tools are licensed under the <b>Apache License, Version 2.0</b>. See LICENSE and NOTICE for full terms.",
        body_style
    ))

    # Build Document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"WORKFLOW_PROCESSING_PDF_GENERATED path={output_pdf}")

if __name__ == "__main__":
    build_pdf()
