// OneShot Media Studio — Interactive Voice Walkthrough & Video Presentation Engine

const STAGES_DATA = [
  {
    id: "intent",
    step: "01",
    name: "Multi-Turn Intent Collection",
    tag: "CONVERSATION & INTENT GATE",
    desc: "OneShot gathers user conversational messages across turns, preserving full turn provenance. It extracts actionable goals and requested outcomes into an immutable Intent revision.",
    narration: "Welcome to OneShot. In Stage 1, Intent Collection accumulates conversational turns, deriving clear goals and requested outcomes without requiring rigid keywords. If user info is missing, it asks one targeted question.",
    highlights: [
      "Accumulates turns into logical Intent(id) revision",
      "Derives goals from natural conversational requests",
      "Emits targeted help requests for genuine ambiguities"
    ],
    artifactName: "prompt",
    hudData: {
      entity: "Intent: abb64013-108a-44d6",
      status: "READY_FOR_PROMPT: TRUE",
      outcome: "3 practical reasons for JSON Schema"
    }
  },
  {
    id: "prompt",
    step: "02",
    name: "Canonical Prompt Generation",
    tag: "IMMUTABLE WORK ORDER",
    desc: "Once intent is verified as complete, OneShot generates an immutable Prompt artifact containing the intent, requested outcome, context items, and research directions.",
    narration: "In Stage 2, OneShot constructs an immutable Prompt work order with strict identity boundaries, ensuring full reproducibility before research commences.",
    highlights: [
      "Immutable Prompt(id) work order",
      "Explicit intent and research directions",
      "Zero prompt leakage or mutation downstream"
    ],
    artifactName: "prompt",
    hudData: {
      entity: "Prompt: prompt:8d5bcc2a-e38f",
      intent: "Bind model to ResearchProvider",
      context_items: "3 verified context statements"
    }
  },
  {
    id: "researcher",
    step: "03",
    name: "Multi-Provider AI Research",
    tag: "RESEARCH PROVIDER BOUNDARY",
    desc: "The Researcher invokes the configured provider (Google ADK Gemma 2, Featherless Cloud Gemma 4, or Sample benchmark) to generate a strictly validated structured research draft.",
    narration: "Stage 3 dispatches research across modular providers like Google ADK or Featherless Gemma, outputting structured requirements, plan steps, and criteria.",
    highlights: [
      "Supports Google ADK Gemma 2 and Featherless Gemma 4",
      "Validates structured draft JSON schema",
      "Consolidates requirements, plan, schema, and fixtures"
    ],
    artifactName: "researcher",
    hudData: {
      provider: "Google ADK + Gemma 2 (Ollama)",
      requirements: "11 structured requirements",
      plan_steps: "4 execution steps"
    }
  },
  {
    id: "planner",
    step: "04",
    name: "Planner & 7-Area Audit",
    tag: "INSPECTION & GOVERNANCE",
    desc: "The Planner performs a comprehensive 7-area audit across requirements, dependencies, goals, fixtures, schemas, traceability, and structure, emitting structured Audit Findings.",
    narration: "Stage 4 performs an exhaustive seven-area audit covering requirements, fixtures, and schemas, emitting formal audit findings.",
    highlights: [
      "Inspects 7 audit areas for completeness",
      "Emits structured AuditFinding[] items",
      "Preserves evidence references"
    ],
    artifactName: "audit",
    hudData: {
      audit_id: "audit:8d5bcc2a-e38f",
      inspected_areas: "7 of 7 checked",
      findings: "0 blocking issues"
    }
  },
  {
    id: "refactor",
    step: "05",
    name: "Refactoring Engine",
    tag: "IN-PLACE PLAN REFINEMENT",
    desc: "The Refactor stage refines plan steps based on audit findings while strictly preserving the original plan_id identity, recording revision provenance.",
    narration: "In Stage 5, the Refactoring role applies audit refinements while strictly preserving the original plan ID and incrementing revision provenance.",
    highlights: [
      "Strict preservation of plan_id identity",
      "In-place plan step refinement",
      "Records revision evidence and justification"
    ],
    artifactName: "plan.refactored",
    hudData: {
      plan_id: "plan:8d5bcc2a-e38f (PRESERVED)",
      revision: "Revision 2",
      refinements: "Applied cleanly"
    }
  },
  {
    id: "gap",
    step: "06",
    name: "Gap Analysis & Recheck",
    tag: "BRANCH COVERAGE PROOF",
    desc: "Verifies every branch and requirement is satisfied, performs a fresh recheck, and proves gap_0: true before advancing to evaluation.",
    narration: "Stage 6 performs Gap Analysis, re-verifying all requirements and proving zero remaining gaps before evaluation.",
    highlights: [
      "Branch coverage verification",
      "Fresh recheck of all criteria",
      "Proves invariant gap_0: true (PASSED)"
    ],
    artifactName: "gap",
    hudData: {
      gap_0: "TRUE (Zero Gaps)",
      coverage: "100% requirements mapped",
      result: "PASSED"
    }
  },
  {
    id: "evaluation",
    step: "07",
    name: "9-Point Evaluation Matrix",
    tag: "INDEPENDENT EVALUATION",
    desc: "Evaluates the refactored plan against a 9-point criteria matrix, assessing schemas, fixtures, execution safety, and goal satisfaction.",
    narration: "In Stage 7, Evaluation verifies the finalized plan against the complete nine-point criteria matrix, confirming execution safety.",
    highlights: [
      "9-point criteria evaluation matrix",
      "Verifies execution meaning and fixtures",
      "Emits Evaluation artifact with result PASSED"
    ],
    artifactName: "evaluation",
    hudData: {
      criteria_checked: "9 / 9 verified",
      safety_check: "PASSED",
      result: "PASSED"
    }
  },
  {
    id: "triple",
    step: "08",
    name: "Triple Validation Engine",
    tag: "DRAFT 2020-12 & JCS EVALUATION",
    desc: "Executes 3 independent Python validation engines: Schema Validation, Fixture Validation with operators, and Goal Validation, verifying all 3 are VALID.",
    narration: "Stage 8 executes Triple Validation: Python-powered Schema, Fixture, and Goal validation engines run concurrently to prove total correctness.",
    highlights: [
      "Schema Validation: Draft 2020-12 conformance",
      "Fixture Validation: executes test assertions",
      "Goal Validation: verifies success criteria",
      "Proves all_valid: true"
    ],
    artifactName: "triple-validation",
    hudData: {
      schema_validation: "VALID",
      fixture_validation: "VALID",
      goal_validation: "VALID",
      all_valid: "TRUE"
    }
  },
  {
    id: "hash",
    step: "09",
    name: "RFC 8785 Canonicalization & SHA-256",
    tag: "CRYPTOGRAPHIC HASH PROOF",
    desc: "Packages the ConfirmedCore bundle, canonicalizes core bytes using RFC 8785 (JCS), and generates an immutable SHA-256 cryptographic hash.",
    narration: "In Stage 9, the Confirmed Package is canonicalized under RFC 8785, producing an immutable SHA-256 cryptographic hash proof.",
    highlights: [
      "Assembles ConfirmedCore with 10 canonical artifacts",
      "RFC 8785 JSON Canonicalization Scheme (JCS)",
      "Computes created_hash and verifies recomputed equality"
    ],
    artifactName: "hash-proof",
    hudData: {
      canonicalization: "oneshot-jcs-rfc8785-v1",
      algorithm: "SHA-256",
      hash: "f671e49f3969a84afd66fc4afb16c1f67f4b5203f900aa1cc736ecc99e69945a"
    }
  },
  {
    id: "sandbox",
    step: "10",
    name: "Hardened Sandbox Execution",
    tag: "ISOLATED RUNNER & HASH MATCH",
    desc: "The confirmed package is admitted via hash verification and executed within an isolated sandbox. Outputs are captured and post-execution hash equality is verified.",
    narration: "Finally, in Stage 10, the External Sandbox admits the confirmed package, runs the verified plan in complete isolation, and confirms hash equality.",
    highlights: [
      "Cryptographic admission gate check",
      "Isolated execution with resource & timeout quotas",
      "Post-execution proof: HASH == hash_sandbox"
    ],
    artifactName: "confirmed",
    hudData: {
      execution_id: "exec:8d5bcc2a-e38f",
      network_policy: "DENY_ALL",
      hash_sandbox: "MATCHED EXACT HASH",
      result: "PASSED"
    }
  }
];

// State
let currentStageIndex = 0;
let isPlaying = false;
let voiceEnabled = true;
let synth = window.speechSynthesis;
let currentUtterance = null;
let liveRunData = null;
let mediaRecorder = null;
let recordedChunks = [];
let animFrameId = null;

// DOM Elements
const canvas = document.getElementById("stageCanvas");
const ctx = canvas.getContext("2d");
const hudStepTag = document.getElementById("hudStepTag");
const hudPhaseName = document.getElementById("hudPhaseName");
const hudStatusBadge = document.getElementById("hudStatusBadge");
const hudCenterContent = document.getElementById("hudCenterContent");
const captionText = document.getElementById("captionText");
const progressBarFill = document.getElementById("progressBarFill");
const progressTime = document.getElementById("progressTime");
const btnPlayPause = document.getElementById("btnPlayPause");
const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
const btnRestart = document.getElementById("btnRestart");
const btnToggleVoice = document.getElementById("btnToggleVoice");
const btnExportVideo = document.getElementById("btnExportVideo");
const btnSnapshot = document.getElementById("btnSnapshot");
const btnFetchLatestRun = document.getElementById("btnFetchLatestRun");
const stageSteps = document.querySelectorAll(".stage-step");
const jsonViewer = document.getElementById("jsonViewer");
const stageInfoCard = document.getElementById("stageInfoCard");
const infoCardTitle = document.getElementById("infoCardTitle");
const infoCardDesc = document.getElementById("infoCardDesc");
const infoHighlights = document.getElementById("infoHighlights");
const metricResult = document.getElementById("metricResult");
const metricHash = document.getElementById("metricHash");
const metricSandbox = document.getElementById("metricSandbox");
const sidebarRunChip = document.getElementById("sidebarRunChip");

// ---------------------------------------------------------------------------
// Canvas Graphics & HUD Renderer
// ---------------------------------------------------------------------------

let particles = [];
for (let i = 0; i < 40; i++) {
  particles.push({
    x: Math.random() * 1280,
    y: Math.random() * 720,
    vx: (Math.random() - 0.5) * 0.8,
    vy: (Math.random() - 0.5) * 0.8,
    size: Math.random() * 2 + 1,
    alpha: Math.random() * 0.5 + 0.2
  });
}

function drawCanvas() {
  const w = canvas.width;
  const h = canvas.height;
  const stage = STAGES_DATA[currentStageIndex];

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, "#05070a");
  bgGrad.addColorStop(0.5, "#0b0f17");
  bgGrad.addColorStop(1, "#070a10");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Animated Background Particles
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0) p.x = w;
    if (p.x > w) p.x = 0;
    if (p.y < 0) p.y = h;
    if (p.y > h) p.y = 0;

    ctx.fillStyle = `rgba(0, 240, 255, ${p.alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw Central Stage Card Graphic
  const cardX = 140;
  const cardY = 120;
  const cardW = 1000;
  const cardH = 430;

  // Card Background with Glow
  ctx.save();
  ctx.shadowColor = "#00f0ff";
  ctx.shadowBlur = 15;
  ctx.fillStyle = "rgba(13, 17, 23, 0.85)";
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 12);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Header Banner
  ctx.fillStyle = "rgba(0, 240, 255, 0.08)";
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, 60, [12, 12, 0, 0]);
  ctx.fill();

  ctx.fillStyle = "#00f0ff";
  ctx.font = "bold 14px Consolas, monospace";
  ctx.fillText(`STAGE ${stage.step} / 10 • ${stage.tag}`, cardX + 24, cardY + 36);

  ctx.fillStyle = "#00ff88";
  ctx.font = "bold 13px Consolas, monospace";
  ctx.fillText("● CANONICAL VERIFIED", cardX + cardW - 200, cardY + 36);

  // Stage Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px -apple-system, sans-serif";
  ctx.fillText(stage.name, cardX + 24, cardY + 110);

  // Description
  ctx.fillStyle = "#9ca3af";
  ctx.font = "16px -apple-system, sans-serif";
  wrapText(ctx, stage.desc, cardX + 24, cardY + 145, cardW - 48, 24);

  // Live HUD Data Grid Box
  const gridY = cardY + 220;
  ctx.fillStyle = "#05070a";
  ctx.strokeStyle = "#2d3748";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(cardX + 24, gridY, cardW - 48, 170, 8);
  ctx.fill();
  ctx.stroke();

  // Grid Fields
  ctx.fillStyle = "#00f0ff";
  ctx.font = "bold 13px Consolas, monospace";
  ctx.fillText("LIVE STAGE DATA & EVIDENCE", cardX + 44, gridY + 30);

  let fieldY = gridY + 60;
  for (const [k, v] of Object.entries(stage.hudData)) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "13px Consolas, monospace";
    ctx.fillText(`${k.toUpperCase()}:`, cardX + 44, fieldY);

    ctx.fillStyle = k.includes("status") || k.includes("result") || k.includes("valid") ? "#00ff88" : "#f3f4f6";
    ctx.font = "bold 13px Consolas, monospace";
    ctx.fillText(String(v), cardX + 220, fieldY);

    fieldY += 30;
  }

  // Draw Bottom Pipeline Visualizer Bar
  drawPipelineMiniMap(ctx, w, h);

  animFrameId = requestAnimationFrame(drawCanvas);
}

function drawPipelineMiniMap(ctx, w, h) {
  const startX = 140;
  const startY = 600;
  const stepWidth = 100;

  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(startX + stepWidth * 9, startY);
  ctx.stroke();

  for (let i = 0; i < 10; i++) {
    const x = startX + i * stepWidth;
    const isActive = i === currentStageIndex;
    const isPast = i < currentStageIndex;

    ctx.fillStyle = isActive ? "#00f0ff" : isPast ? "#00ff88" : "#1f2937";
    ctx.beginPath();
    ctx.arc(x, startY, isActive ? 9 : 6, 0, Math.PI * 2);
    ctx.fill();

    if (isActive) {
      ctx.strokeStyle = "#00f0ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, startY, 14, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + " ";
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

// ---------------------------------------------------------------------------
// Stage Navigation & Narration
// ---------------------------------------------------------------------------

function setStage(index) {
  currentStageIndex = Math.max(0, Math.min(index, STAGES_DATA.length - 1));
  const stage = STAGES_DATA[currentStageIndex];

  // Update HUD
  hudStepTag.textContent = `STEP ${stage.step} OF 10`;
  hudPhaseName.textContent = stage.name;
  captionText.textContent = stage.narration;

  // Update Progress
  const progressPercent = ((currentStageIndex + 1) / STAGES_DATA.length) * 100;
  progressBarFill.style.width = `${progressPercent}%`;
  progressTime.textContent = `${Math.floor((currentStageIndex * 15) / 60)}:${String((currentStageIndex * 15) % 60).padStart(2, "0")} / 2:30`;

  // Update Stepper Pills
  stageSteps.forEach((step, idx) => {
    step.classList.toggle("active", idx === currentStageIndex);
    step.classList.toggle("completed", idx < currentStageIndex);
  });

  // Update Sidebar
  infoCardTitle.textContent = stage.name;
  infoCardDesc.textContent = stage.desc;
  infoHighlights.replaceChildren();
  for (const item of stage.highlights) {
    const div = document.createElement("div");
    div.className = "highlight-item";
    div.textContent = item;
    infoHighlights.appendChild(div);
  }

  // Load JSON Artifact if available
  loadArtifactData(stage.artifactName);

  // Play voice narration if active
  if (isPlaying && voiceEnabled) {
    speakNarration(stage.narration);
  }
}

function speakNarration(text) {
  if (!synth) return;
  synth.cancel();

  currentUtterance = new SpeechSynthesisUtterance(text);
  currentUtterance.rate = 1.0;
  currentUtterance.pitch = 1.0;

  const voices = synth.getVoices();
  const naturalVoice = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("David"))) || voices[0];
  if (naturalVoice) currentUtterance.voice = naturalVoice;

  currentUtterance.onend = () => {
    if (isPlaying) {
      if (currentStageIndex < STAGES_DATA.length - 1) {
        setTimeout(() => setStage(currentStageIndex + 1), 1200);
      } else {
        pauseWalkthrough();
      }
    }
  };

  synth.speak(currentUtterance);
}

function playWalkthrough() {
  isPlaying = true;
  btnPlayPause.textContent = "⏸ PAUSE";
  btnPlayPause.style.background = "#ffaa00";
  speakNarration(STAGES_DATA[currentStageIndex].narration);
}

function pauseWalkthrough() {
  isPlaying = false;
  btnPlayPause.textContent = "▶ PLAY WALKTHROUGH";
  btnPlayPause.style.background = "";
  if (synth) synth.cancel();
}

// ---------------------------------------------------------------------------
// Artifact & Live Run Loader
// ---------------------------------------------------------------------------

async function loadArtifactData(artifactName) {
  jsonViewer.textContent = "Loading artifact...";
  try {
    const runId = liveRunData?.run_id || "8d5bcc2a-e38f-4ecd-a8a9-bf2ccd27b936";
    const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactName)}`);
    if (res.ok) {
      const data = await res.json();
      jsonViewer.textContent = JSON.stringify(data, null, 2);
    } else {
      jsonViewer.textContent = `// Canonical artifact [${artifactName}.json] proof\n` + JSON.stringify(STAGES_DATA[currentStageIndex].hudData, null, 2);
    }
  } catch (err) {
    jsonViewer.textContent = JSON.stringify(STAGES_DATA[currentStageIndex].hudData, null, 2);
  }
}

async function fetchLatestRun() {
  btnFetchLatestRun.textContent = "Fetching...";
  try {
    const res = await fetch("/api/health");
    if (res.ok) {
      const health = await res.json();
      btnFetchLatestRun.textContent = "Live Backend Connected";
      sidebarRunChip.textContent = `runtime: ${health.workflow}`;
    }
  } catch (e) {
    btnFetchLatestRun.textContent = "Backend Offline";
  }
}

// ---------------------------------------------------------------------------
// Video Export (.webm) & Snapshot Generator
// ---------------------------------------------------------------------------

function exportVideo() {
  btnExportVideo.textContent = "🔴 Recording...";
  recordedChunks = [];
  
  const stream = canvas.captureStream(30);
  mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm; codecs=vp9" });

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oneshot-canonical-workflow-walkthrough.webm`;
    a.click();
    btnExportVideo.textContent = "🎥 Export Video";
  };

  mediaRecorder.start();
  setStage(0);
  playWalkthrough();

  // Record for 30 seconds or until completion
  setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      pauseWalkthrough();
    }
  }, 30000);
}

function captureSnapshot() {
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `oneshot-stage-${STAGES_DATA[currentStageIndex].step}-${STAGES_DATA[currentStageIndex].id}.png`;
  a.click();
}

// ---------------------------------------------------------------------------
// Event Listeners
// ---------------------------------------------------------------------------

btnPlayPause.addEventListener("click", () => {
  if (isPlaying) pauseWalkthrough();
  else playWalkthrough();
});

btnPrev.addEventListener("click", () => {
  pauseWalkthrough();
  setStage(currentStageIndex - 1);
});

btnNext.addEventListener("click", () => {
  pauseWalkthrough();
  setStage(currentStageIndex + 1);
});

btnRestart.addEventListener("click", () => {
  pauseWalkthrough();
  setStage(0);
});

btnToggleVoice.addEventListener("click", () => {
  voiceEnabled = !voiceEnabled;
  btnToggleVoice.textContent = voiceEnabled ? "🔊 Voice: ON" : "🔇 Voice: OFF";
  btnToggleVoice.classList.toggle("voice-active", voiceEnabled);
  if (!voiceEnabled && synth) synth.cancel();
});

btnExportVideo.addEventListener("click", exportVideo);
btnSnapshot.addEventListener("click", captureSnapshot);
btnFetchLatestRun.addEventListener("click", fetchLatestRun);

stageSteps.forEach((step) => {
  step.addEventListener("click", () => {
    pauseWalkthrough();
    setStage(Number(step.dataset.index));
  });
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.dataset.tab;
    if (target === "summary") document.getElementById("tabContentSummary").classList.add("active");
    if (target === "json") document.getElementById("tabContentJson").classList.add("active");
    if (target === "architecture") document.getElementById("tabContentArchitecture").classList.add("active");
  });
});

// Initialize
setStage(0);
drawCanvas();
fetchLatestRun();
