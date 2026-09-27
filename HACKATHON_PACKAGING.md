# OneShot: Hackathon & Competition Submission Packaging Guide

> **Official Competition Title:** `OneShot: Deterministic E2E Agent Runtime Demo`  
> **Tagline:** Verifiable Contracts Delivering End-to-End Software Engineering Integrity  
> **Live Video Walkthrough:** [https://www.youtube.com/watch?v=lE9vtKB-fSk](https://www.youtube.com/watch?v=lE9vtKB-fSk)  
> **Live Web Console:** [https://itz1508.github.io/oneshot_e2e/](https://itz1508.github.io/oneshot_e2e/)  
> **Repository:** [https://github.com/itz1508/oneshot_e2e](https://github.com/itz1508/oneshot_e2e)  
> **Test Status:** 419 Tests Passing (222 Backend + 99 Runtime + 77 Frontend + 21 Browser E2E)

---

## 1. Executive Summary & Elevator Pitch

### The Problem

Modern autonomous software engineering agents frequently fail in real-world deployment due to three critical flaws:

1. **Superficial "Pass" Illusions:** Agents declare success when tests exit 0, even when responses are empty, mocked, or drifted from contracts.
2. **Ungoverned Filesystem Destruction:** Agents make arbitrary modifications to host environments without strict sandboxing or rollback safety.
3. **Black-Box Execution:** Opaque progress bars and fake loading timers conceal errors and fail to provide genuine human-in-the-loop governance.

### The Solution: OneShot

**OneShot** is a deterministic, contract-driven autonomous software engineering console and multi-agent runtime. Built on the **Golden Rule** (*"PASS is meaningless on its own; a verified HTTP response payload with cryptographic byte equality is the only confirmation"*), OneShot streams real-time execution events over AG-UI Server-Sent Events (SSE), executes reasoning inside an isolated Python subprocess, confines all operations to a 4-partition virtual sandbox (`/workspace`, `/scratch`, `/memories`, `/artifacts`), and enforces explicit human-in-the-loop governance gates before applying changes.

### The Tech Stack

- **Backend Runtime:** Node.js 24.21.0+, TypeScript (Strict ESM), Node native HTTP & SSE stream pipeline.
- **Agent Subprocess Engine:** Python 3.12+ reasoning DAG, JSON streaming IPC, deterministic validator.
- **Frontend Console:** React 19, Next.js static export, Tailwind CSS + Vanilla CSS tokens, AG-UI Event Source subscriber.
- **E2E Test & Verification:** Playwright browser automation, native node:test runners, SHA-256 cryptographic fixture verification.

---

## 2. Recommended Titles by Competition Track

| Track / Setting | Title | Subtitle |
| :--- | :--- | :--- |
| **Agentic AI / Hackathon (Recommended)** | `OneShot: Deterministic E2E Agent Runtime Demo` | *Verifiable Contracts Delivering End-to-End Software Engineering Integrity* |
| **Enterprise / DevTools Track** | `How OneShot Guarantees Software Engineering Integrity` | *Deterministic Contracts, Sandboxed Execution, and Human Governance* |
| **Architecture & Systems Track** | `Building Verifiable End-to-End Software With OneShot` | *Multi-Agent Streaming Pipeline & Cryptographic Byte Verification* |
| **Rapid Technical Demo** | `OneShot E2E Architecture & Live Workflow Demo` | *Real-Time AG-UI Streaming with Zero Client-Side Mocking* |

---

## 3. Two-Minute Judge Evaluation Playbook

For hackathon judges and technical reviewers evaluating OneShot under time constraints:

```powershell
# 1. Launch the complete system with 1 command (Windows PowerShell):
irm https://raw.githubusercontent.com/itz1508/oneshot_e2e/main/scripts/install.ps1 | iex

# macOS / Linux alternative:
# curl -fsSL https://raw.githubusercontent.com/itz1508/oneshot_e2e/main/scripts/install.sh | bash
```

### 3-Step Verification Checklist

1. **Verify The Golden Rule (No Mocked Success):**
   - Click the **"Dry-Run Fixtures"** quick action in the console.
   - Inspect the **Backend Fixture Verification** card: observe the live `HTTP 200` response payload and SHA-256 cryptographic match (`9ee8ec...9dd`).
2. **Observe Real AG-UI Multi-Agent Streaming:**
   - Submit a prompt (or click **"Optimize Pipeline"**).
   - Watch the live SSE event log: `stream.messages` (tokens), `stream.subagents` (delegation), `stream.tool_calls` (execution), and real todos update dynamically.
3. **Test Human-in-the-Loop Governance:**
   - In the Context Drawer (**[GATES]** tab), inspect **Gate 1: Dry-Run Spec Confirmation**.
   - Click **"Confirm Gate 1"** to witness verified transition from `PENDING` to `APPROVED`.

---

## 4. YouTube Video Walkthrough Description (Copy-Paste Ready)

Use this complete metadata block when uploading or reviewing the submission video:

```text
OneShot: Deterministic E2E Agent Runtime Demo
Autonomous Agentic Software Engineering Console · Verifiable Contracts Delivering E2E Integrity

🔗 LINKS & RESOURCES:
• GitHub Repository: https://github.com/itz1508/oneshot_e2e
• Live Browser Console: https://itz1508.github.io/oneshot_e2e/
• Architecture Specification: https://github.com/itz1508/oneshot_e2e/blob/main/ARCHITECTURE.md
• Interactive 1-Click Installer: https://raw.githubusercontent.com/itz1508/oneshot_e2e/main/scripts/install.ps1

📌 ABOUT ONESHOT:
OneShot is an autonomous software engineering console designed to solve the critical flaws of modern coding agents: hallucinations, fake "pass" exit codes, and unconstrained filesystem mutation. 

Operating under the Golden Rule ("PASS is meaningless on its own; a verified HTTP response payload with cryptographic byte equality is the only confirmation"), OneShot pairs a Node.js AG-UI SSE streaming server with an isolated Python reasoning engine, a 4-partition sandbox, and dual human governance gates.

⏱️ VIDEO CHAPTERS:
00:00 - Introduction & Runtime Overview (Problem statement, architecture, 1-click startup)
00:30 - Test Scenario Setup & Security Invariants (Offline fixtures, 4-partition sandbox verification)
01:40 - Live Provider Configuration (Dynamic switching between Gemini, OpenAI, Mistral, Ollama)
02:20 - Multi-Agent Streaming & Reasoning Chain (Real-time AG-UI SSE tokens, subagents, and tool calls)
02:50 - Gate Approval & Artifact Verification (Human Gate 1/Gate 2 confirmation, SHA-256 byte equality)
03:07 - Summary & Repository Links (Verifiable contracts guarantee, 419 deterministic tests passing)

🧪 VERIFICATION & TEST STATUS:
• 419 Total Tests Passing across 4 automated suites
• 222 Backend API & SSE Tests
• 99 Agent Runtime & Sandbox Tests
• 77 Frontend & Console Invariant Tests
• 21 Browser E2E Tests (Playwright)
• 100% Deterministic — Zero Synthetics, Zero Client Mocks

#AI #Agents #SoftwareEngineering #MultiAgent #DevTools #TypeScript #Python #Automation #Hackathon
```

---

## 5. Technical Differentiation Matrix

| Architectural Dimension | Typical "Toy" Coding Agent | OneShot Deterministic Runtime |
| :--- | :--- | :--- |
| **Verification Standard** | Exit Code 0 = "Passed" (ignores empty bodies) | **The Golden Rule:** Cryptographic SHA-256 byte equality & real HTTP payload inspection |
| **Streaming Protocol** | Fake client timers & hardcoded progress bars | **Native AG-UI SSE Protocol:** Real server events (`stream.messages`, `stream.subagents`, `stream.tool_calls`) |
| **Filesystem Safety** | Unrestricted access to host filesystem | **4-Partition Sandbox:** Strict isolation across `/workspace`, `/scratch`, `/memories`, `/artifacts` with symlink guards |
| **Human Governance** | Runaway autonomy until process crashes | **Dual Human Gates:** Mandatory interactive approval gates (Gate 1 Dry-Run, Gate 2 Production Rollout) |
| **LLM Provider Agility** | Hardcoded to single cloud vendor | **Dynamic Hot-Swapping:** Live switching between Gemini, OpenAI, Mistral, and local Ollama without restarts |
| **Frontend Integrity** | Client-side mocks simulating backend | **Zero Frontend Invention:** Authoritative backend executes first; UI faithfully renders genuine state |
| **Automated Test Rig** | Minimal or brittle unit tests | **419 Deterministic Tests:** Full pipeline validation across backend, agent runtime, UI, and browser E2E |

---

## 6. Project Contacts & Repository Assets

- **Repository:** [https://github.com/itz1508/oneshot_e2e](https://github.com/itz1508/oneshot_e2e)
- **Production Console:** [https://itz1508.github.io/oneshot_e2e/](https://itz1508.github.io/oneshot_e2e/)
- **Documentation Catalog:**
  - `README.md` — Console Quickstart, installation commands, live UI preview.
  - `ARCHITECTURE.md` — Multi-agent system topology, sequence flows, and contracts.
  - `DIAGRAM.md` — Complete ASCII & Mermaid pipeline architecture diagrams.
  - `AGENTS.md` — Agent operating rules, Golden Rule specification, and verification standards.
  - `LICENSE` — Apache 2.0 Open Source License.
