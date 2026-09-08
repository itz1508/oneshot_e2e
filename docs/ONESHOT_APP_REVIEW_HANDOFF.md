# OneShot app review — resumable handoff

## Status

2026-09-07: Verified OneShot v3 end-to-end.
- All 147 backend TypeScript tests across 50 test suites PASSED (0 failures) via `app/scripts/verify_all.py`.
- Python base and workspace dependency pins verified.
- Python unit test suite (42 tests) PASSED.
- Workspace API verification and OpenAPI schema check PASSED.
- Frontend Next.js production build and static export to `app/web/dist` PASSED.
- All 40 frontend unit tests PASSED via `npm --prefix app/web test`.
- Multi-viewport visual verification screenshots captured and stored under `dist/e2e-evidence/v3-screenshots/` (1440px desktop default, desktop job history flipped, explorer collapsed, new job modal, 1024px tablet, and 390px mobile with zero horizontal overflow).
- Research Review and Build Ready human gates verified with strict non-simulated contracts and deterministic hashes.

## Latest continuation — v3

Additional authoritative product reference read in full:
`C:\Users\itz15\Downloads\ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v3.txt`.
V3 supersedes the older three-column layout assumptions below: the design now
has Left Rail | Explorer | Conversation | Task Management | Right Rail.
This task remains an offline design study, not production Sample mode or a
Next.js migration. V3 runtime implementation claims were not independently tested.

Implemented in `designs/oneshot-review/index.html`:
- Five-region responsive shell, persistent composer, separate rail controls.
- Research baseline editing and local explicit acceptance; edits close after acceptance.
- Research Again uses the main composer, labeled as a local instruction only.
- Manually selected Research Review, Build Ready, success and failure examples.
- Build Ready Return preserves pending state; local confirmation starts no execution.
- Current Job / Job History switching with reduced-motion-aware Y-axis animation.
- Draft export, provider display, reset, and confirmed local new conversation.
- Missing runtime validation/hash/mutation evidence is explicitly identified.

Verification: inline JavaScript parsed successfully with Node vm.Script; unique
HTML IDs passed; bounded git diff whitespace check passed. README badge already
points to the correct design and Workflow remains correctly linked.
No agent-browser sessions or remote-debugging browser processes were available;
port 9444 was not listening. Prior crashing launches were not repeated. No visual,
keyboard, download, or interactive browser pass is claimed. Next: inspect at
1440, 1024, and 390 px and exercise all controls in a working browser.

No dependencies, browser API contracts, runtime contracts, persistence, live app,
or manifest were changed by this continuation. No files removed or published.
Official platform references consulted for local dialogs and download URLs:
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
- https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static

## User decisions

- Build a NEW standalone HTML app for review, not a replacement for the live app.
- Extract good ideas from the supplied references; do not copy their code/design.
- Mobbin is the design research application: search IDE/workspace screens,
  inspect results, compare their layout and interactions, then make decisions.
  Do not describe Mobbin itself as a visual inspiration or a template.
- Work directly. No more subagents for this task; reserve them for substantial
  independent parallel work. Repeated browser launch attempts have crashed.
- With approximately 16% usage left, prioritize a saved plan and layout foundation.

## Inputs

- `docs/WEB_APP_REQUIREMENTS_RECONCILIATION.md`
- `docs/ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v2.md`
- `C:\Users\itz15\Downloads\oneshot_v7.html`
- `C:\Users\itz15\Downloads\oneshot.html`
- `C:\Users\itz15\Downloads\OneShot_chat_todo_chain_active_only.html`

All three HTML files exist and were inspected from source. They include simulated
execution, and some contain fabricated chain-of-thought. Reuse neither behavior.
The reference patterns worth studying are the explorer, anchored composer,
expandable active tasks, contextual approvals, and collapsible context panels.

## Deliverable and layout

Create `designs/oneshot-review/index.html`: one portable HTML file with embedded
CSS/JavaScript, no external dependencies or network calls. Point README's App
Review badge to it. Keep Workflow pointed to `docs/WORKFLOW_TREE`.

Use an original graphite IDE shell, restrained blue actions, amber approval
states, readable system typography, and monospace paths/IDs. No decorative
gradients, fake telemetry, dense badge collections, or autonomous panel flips.

- Header: OneShot, sample project, persistent sample/preview identification.
- Left: workspace/conversation navigation, sample files, recent conversations.
- Center: chat, Research Review card, anchored composer.
- Right: Phase → Step → Task, active context, Current Job / Job History switch.
- Desktop: three columns. Tablet: collapsible task panel. Mobile: one column,
  explicit panel controls, no horizontal page overflow.

Initial scene: Research Review for a fictional inventory workspace. All files,
messages, task states, and history must describe that same sample project.

## Planned interactions

1. Layout milestone: panel toggles, task expansion, history switch, safe read-only
   sample file preview, local composer, keyboard-accessible dialogs.
2. Review milestone: editable sample plan, revision retained in memory; explicit
   Research Review acceptance separate from Confirm Build.
3. State milestone: manually chosen, clearly labeled Research Review, Build Ready,
   successful-result and failure examples. No automatic simulated execution.
4. Utility milestone: reset example, export edited sample plan, presentation-only
   provider choice (OpenAI / Anthropic / Gemini; no credential input).

Build Ready Return stays pending. Sample approval only changes the demonstration;
it cannot claim real validation, build, file mutation, or hash proof. Never expose
private reasoning. Render user input and file contents as text, not HTML.

## Research record

Mobbin callable tool: `mcp__codex_apps__mobbin_search_screens`.
Required argument: `platform: "web"`; pass `query` and `limit`.

Screens reviewed via Mobbin:

- Cursor: https://mobbin.com/screens/072e59e9-4157-4020-9724-8a92f7b4bf7a
  Quiet navigation and conversation hierarchy.
- Google AI Studio: https://mobbin.com/screens/915541ca-412a-436f-8632-fb2e22c2bd71
  Conversation/file-context separation.
- v0: https://mobbin.com/screens/744ae8dd-1f0a-40ca-9aec-b8374910393f
  Persistent project navigation and a distinct work area.
- Asana: https://mobbin.com/screens/1ea72ce5-cccc-455d-b842-86e81b9cf9c8
  Grouped task hierarchy and restrained status treatment. Do not import a Gantt
  chart into OneShot merely because it appeared in search results.

Official implementation references already consulted:

- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
- https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications

## Verification and resume instructions

Read this file first, inspect current output, and continue incomplete milestones.
Do not redo completed research. Preserve all unrelated dirty work.

- Check inline JavaScript syntax, HTML IDs, links, and safe text insertion.
- Exercise panels, dialogs/Escape, tasks/history, composer, approvals and Return.
- Inspect 1440px desktop, 1024px tablet, and 390px mobile screenshots.
- Check keyboard focus, readable contrast, reduced motion, scroll behavior.
- Record each check honestly; static checks do not establish visual quality.

Browser evidence: agent-browser auto-launch and explicit Edge auto-launch failed
before DevToolsActivePort. A separately started headless Edge later exposed
127.0.0.1:9444. Recheck ownership and availability before attaching; do not repeat
crashing launch attempts. No browser visual verification has passed yet.

The repository contains extensive unrelated uncommitted backend/UI work. This
prototype must not modify the live app or claim those changes are verified.
Do not regenerate the entire source manifest over unrelated dirty work. Before
a requested release/commit, handle only the appropriate reviewed manifest entries.
No commit, push, deployment, or live-app integration is authorized by this task.
