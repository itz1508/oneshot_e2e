/**
 * WelcomeDocsIndex — Key Architecture, Installation UX & Workflow Index Hub.
 *
 * Requirements:
 * 1. Exactly three installation options:
 *    - Windows — Download ZIP (Recommended)
 *    - CLI
 *    - Developer / Source
 *    All instructions collapsed by default with "Review steps ▼" toggle.
 * 2. Review Workflow dropdown disclosure:
 *    Collapsed by default with "Review Workflow ▼" toggle showing compact REAL ADK graph topology.
 */

import {useState} from 'react'
import {
    FileText,
    GitBranch,
    Layers,
    ShieldCheck,
    Cpu,
    ExternalLink,
    Sparkles,
    BookOpen,
    Eye,
    Video,
    Play,
    ChevronDown,
    ChevronUp,
    Download,
    RotateCw,
} from 'lucide-react'
import styles from './WelcomeDocsIndex.module.css'

export interface KeyDocItem {
    id: string
    title: string
    format: string
    path: string
    description: string
    icon: typeof FileText
    category: 'architecture' | 'contract' | 'graph' | 'guide'
}

export const KEY_DOCUMENTS: KeyDocItem[] = [
    {
        id: 'demo-video',
        title: 'Product Walkthrough Video',
        format: 'MP4 Demo',
        path: 'docs/OneShot_Task_Drawer_Compatibility_Fixed.mp4',
        description: 'Live recorded demonstration showing task drawer compatibility, real-time activity tracing, and verification.',
        icon: Video,
        category: 'guide',
    },
    {
        id: 'workflow-tree',
        title: 'Workflow Tree (Source of Truth)',
        format: 'ASCII Tree',
        path: 'docs/WORKFLOW_TREE',
        description: 'Definitive hierarchy & step-by-step pipeline from Chat/Intent → Planner → Triple Validation → Hash → Sandbox.',
        icon: GitBranch,
        category: 'architecture',
    },
    {
        id: 'workflow-tree-pdf',
        title: 'Workflow Tree Diagram',
        format: 'PDF Diagram',
        path: 'docs/WORKFLOW_TREE.pdf',
        description: 'Visual architectural rendering of the canonical workflow tree and transition gates.',
        icon: FileText,
        category: 'architecture',
    },
    {
        id: 'canonical-contract',
        title: 'Canonical Contract & Verification',
        format: 'Draft 2020-12 Spec',
        path: 'docs/source/OneShot_Canonical_Contract_and_Verification.txt',
        description: 'Complete schema definitions, audit IDs, gap records, canonicalization bytes, and contract registry.',
        icon: ShieldCheck,
        category: 'contract',
    },
    {
        id: 'task-mgmt-graph',
        title: 'Task Management & ADK Graphs',
        format: 'Runtime Spec',
        path: 'docs/TASK_MANAGEMENT_AND_ADK_GRAPH.md',
        description: 'Monotonic append-only event tracing, Google ADK Gemma 2 LlmAgent graph, and Authority projections.',
        icon: Cpu,
        category: 'graph',
    },
    {
        id: 'adk-workflow-graph',
        title: 'Google ADK 2.0 Workflow Graph',
        format: 'Canonical Spec',
        path: 'workflow/WorkflowGraph_corrected_optimized.txt',
        description: 'Google ADK 2.0 graph topology, 24 nodes, Gap Analysis loop, Triple Validation fan-out, and JoinNode fan-in barrier.',
        icon: GitBranch,
        category: 'graph',
    },
    {
        id: 'workflow-processing-pdf',
        title: 'Workflow Processing Map',
        format: 'PDF Visual',
        path: 'docs/Workflow_Processing.pdf',
        description: 'Full visual map illustrating processors, validation checkpoints, and immutable artifact persistence.',
        icon: Layers,
        category: 'architecture',
    },
    {
        id: 'judge-guide',
        title: 'Judge Demonstration Guide',
        format: 'Quick-Start',
        path: 'JUDGE_README.md',
        description: 'Under 3-minute interactive evaluation walkthrough for hackathon judges with live proof inspections.',
        icon: BookOpen,
        category: 'guide',
    },
]

interface WelcomeDocsIndexProps {
    onOpenFile: (fileName: string, filePath: string) => void
    onStartPrompt?: (prompt: string) => void
    onOpenDocsModal?: () => void
    onOpenGraphModal?: () => void
}

export function WelcomeDocsIndex({
    onOpenFile,
    onStartPrompt,
    onOpenDocsModal,
    onOpenGraphModal,
}: WelcomeDocsIndexProps) {
    // Collapsed states for 3 installation options (all collapsed by default)
    const [installOpen, setInstallOpen] = useState<{win: boolean, cli: boolean, dev: boolean}>({
        win: false,
        cli: false,
        dev: false,
    })

    // Collapsed state for Review Workflow dropdown (collapsed by default)
    const [workflowOpen, setWorkflowOpen] = useState<boolean>(false)

    const toggleInstall = (key: 'win' | 'cli' | 'dev') => {
        setInstallOpen((prev) => ({...prev, [key]: !prev[key]}))
    }

    const handleExampleClick = () => {
        if (onStartPrompt) {
            onStartPrompt('Generate and verify canonical execution proof for task automation with triple validation')
        }
    }

    return (
        <div className={styles.container}>
            {/* Hero Header */}
            <div className={styles.hero}>
                <div className={styles.badge}>
                    <ShieldCheck size={12}/>
                    <span>Deterministic AI Execution · Verified 1.3.0</span>
                </div>
                <h1 className={styles.title}>OneShot Architecture & Proof Center</h1>
                <p className={styles.subtitle}>
                    Explore our core architectural blueprints, Draft 2020-12 canonical contracts, and live runtime graphs demonstrating provably correct AI execution.
                </p>
                <div className={styles.quickActions}>
                    <button
                        className={styles.examplePromptBtn}
                        onClick={handleExampleClick}
                        title="Start interactive demonstration with example intent"
                    >
                        <Sparkles size={14}/>
                        <span>💡 Try Example Demonstration Run</span>
                    </button>
                    {onOpenGraphModal && (
                        <button
                            className={styles.secondaryActionBtn}
                            onClick={onOpenGraphModal}
                        >
                            <GitBranch size={13}/>
                            <span>ADK Graph Visualizer</span>
                        </button>
                    )}
                    {onOpenDocsModal && (
                        <button
                            className={styles.secondaryActionBtn}
                            onClick={onOpenDocsModal}
                        >
                            <BookOpen size={13}/>
                            <span>All Documents (docs/INDEX.md)</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ── FINAL INSTALLATION UX (3 EXACT OPTIONS, COLLAPSED BY DEFAULT) ── */}
            <div className={styles.installSection}>
                <div className={styles.sectionTitle}>
                    <Download size={14}/>
                    <span>Installation Options</span>
                </div>
                <div className={styles.installGrid}>
                    {/* Option 1: Windows - Download ZIP (Recommended) */}
                    <div className={`${styles.installCard} ${styles.installCardRecommended}`}>
                        <div>
                            <div className={styles.installTop}>
                                <span className={styles.installTitle}>Windows — Download ZIP</span>
                                <span className={styles.installBadge}>Recommended</span>
                            </div>
                            <p className={styles.installDesc}>
                                Standalone self-contained package with pre-pinned Docker image and 1-click launcher scripts.
                            </p>
                        </div>
                        <div>
                            <button
                                className={styles.reviewStepsBtn}
                                onClick={() => toggleInstall('win')}
                                aria-expanded={installOpen.win}
                            >
                                <span>{installOpen.win ? 'Review steps ▲' : 'Review steps ▼'}</span>
                                {installOpen.win ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                            </button>
                            {installOpen.win && (
                                <div className={styles.stepsContent}>
                                    <div>1. <a href="/api/download/judge-zip" download="oneshot-judge-1.3.0.zip" style={{ color: '#60a5fa', textDecoration: 'underline', fontWeight: 600 }}>Download oneshot-judge-1.3.0.zip</a> and extract to your directory.</div>
                                    <div>2. Ensure Docker Desktop is running.</div>
                                    <div>3. Run launcher in PowerShell:</div>
                                    <code className={styles.stepCode}>.\start-oneshot.ps1</code>
                                    <div>4. Open <code>http://localhost:8787</code> in your browser.</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Option 2: CLI */}
                    <div className={styles.installCard}>
                        <div>
                            <div className={styles.installTop}>
                                <span className={styles.installTitle}>CLI</span>
                                <span className={styles.cardFormat}>Docker / CLI</span>
                            </div>
                            <p className={styles.installDesc}>
                                Direct single-command execution via standard Docker CLI and docker-compose.
                            </p>
                        </div>
                        <div>
                            <button
                                className={styles.reviewStepsBtn}
                                onClick={() => toggleInstall('cli')}
                                aria-expanded={installOpen.cli}
                            >
                                <span>{installOpen.cli ? 'Review steps ▲' : 'Review steps ▼'}</span>
                                {installOpen.cli ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                            </button>
                            {installOpen.cli && (
                                <div className={styles.stepsContent}>
                                    <div>1. Pull pre-built image:</div>
                                    <code className={styles.stepCode}>docker pull oneshot:1.3.0</code>
                                    <div>2. Run container:</div>
                                    <code className={styles.stepCode}>docker compose up -d</code>
                                    <div>3. Access UI at <code>http://localhost:8787</code>.</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Option 3: Developer / Source */}
                    <div className={styles.installCard}>
                        <div>
                            <div className={styles.installTop}>
                                <span className={styles.installTitle}>Developer / Source</span>
                                <span className={styles.cardFormat}>Node + Python</span>
                            </div>
                            <p className={styles.installDesc}>
                                Full development environment setup for modifying contracts, skills, and graph algorithms.
                            </p>
                        </div>
                        <div>
                            <button
                                className={styles.reviewStepsBtn}
                                onClick={() => toggleInstall('dev')}
                                aria-expanded={installOpen.dev}
                            >
                                <span>{installOpen.dev ? 'Review steps ▲' : 'Review steps ▼'}</span>
                                {installOpen.dev ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                            </button>
                            {installOpen.dev && (
                                <div className={styles.stepsContent}>
                                    <div>1. Install dependencies:</div>
                                    <code className={styles.stepCode}>npm run setup</code>
                                    <div>2. Build & launch with single command:</div>
                                    <code className={styles.stepCode}>npm run oneshot</code>
                                    <div>3. Run verification suite: <code>npm run verify</code></div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── REVIEW WORKFLOW DROPDOWN DISCLOSURE ── */}
            <div className={styles.workflowSection}>
                <button
                    className={styles.workflowHeaderBtn}
                    onClick={() => setWorkflowOpen((v) => !v)}
                    aria-expanded={workflowOpen}
                >
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <GitBranch size={15} style={{color: '#58a6ff'}}/>
                        <span>{workflowOpen ? 'Review Workflow ▲' : 'Review Workflow ▼'}</span>
                        <span className={styles.cardFormat}>Google ADK 2.0 Real Graph Topology</span>
                    </div>
                    {workflowOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                </button>

                {workflowOpen && (
                    <div className={styles.workflowExpandedBox}>
                        <div style={{fontSize: '12px', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '6px'}}>
                            <RotateCw size={13} style={{color: '#f0883e'}}/>
                            <span><strong>Compact ADK Graph Flow:</strong> Gap Analysis Loop ➔ Evaluation Router ➔ Triple Validation Fan-Out/Fan-In ➔ Validation Gate ➔ Builder Sandbox ➔ Hash Verification Router</span>
                        </div>
                        <pre className={styles.workflowDiagramBox}>
{`[START]
   │
   ▼
[user_intent] ➔ [generator_prompt] ➔ [researcher] ➔ [planner] ➔ [refactor]
   │
   ▼
[gap_check Router] ───(GAPS_FOUND)───► [gap_fix] ➔ [gap_recheck] ──┐
   │                                                               │ (EXPLICIT BACK-EDGE)
   │ (GAP_0: 0 unresolved gaps)                                    ▼
   │◄──────────────────────────────────────────────────────────────┘
   ▼
[evaluation Router]
   ├─► (ROOT_CAUSE) ──► [evaluation_root_cause] (Terminal Halt)
   │
   └─► (PASSED)
        │ (Parallel Fan-Out)
        ├──────────────────────┬──────────────────────┐
        ▼                      ▼                      ▼
   [schema_validator]    [fixture_validator]    [goal_validator]
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               ▼ (Fan-In Barrier)
                     [triple_join JoinNode]
                               │
                               ▼
                    [validation_gate Router]
                       ├─► (NOT_VALID) ──► [validation_root_cause]
                       │
                       └─► (ALL_VALID)
                            │
                            ▼
                        [confirmed] (confirmed_package.core)
                            │
                            ▼
                        [create_hash] (RFC 8785 JCS + SHA-256)
                            │
                            ▼
                        [promote] ➔ [builder Sandbox Execution] ➔ [recompute_hash]
                            │
                            ▼
                        [hash_verification Router]
                           ├─► (MISMATCH) ──► [hash_mismatch_root_cause]
                           │
                           └─► (MATCH: created_hash == recomputed_hash)
                                │
                                ▼
                             [DONE] (PASSED)`}
                        </pre>
                        {onOpenGraphModal && (
                            <button
                                className={styles.examplePromptBtn}
                                onClick={onOpenGraphModal}
                                style={{alignSelf: 'flex-start', marginTop: '6px'}}
                            >
                                <Eye size={13}/>
                                <span>Open Full Interactive ADK Flowchart Visualizer</span>
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Featured Demonstration Video */}
            <div className={styles.videoSection}>
                <div className={styles.videoHeader}>
                    <div className={styles.videoTitleWrap}>
                        <Play size={15} style={{color: '#f87171', fill: '#f87171'}}/>
                        <span className={styles.videoTitle}>Live Product Demonstration</span>
                        <span className={styles.videoBadge}>Interactive Walkthrough</span>
                    </div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '6px'}}>
                        <a
                            href="https://www.youtube.com/watch?v=RQTxYwcNx_0"
                            target="_blank"
                            rel="noreferrer"
                            className={styles.rawLink}
                            title="Watch demonstration on YouTube"
                        >
                            <ExternalLink size={12}/>
                            <span>YouTube Video</span>
                        </a>
                        <a
                            href="/OneShot_Task_Drawer_Compatibility_Fixed.mp4"
                            target="_blank"
                            rel="noreferrer"
                            className={styles.rawLink}
                            title="Open video in new tab"
                        >
                            <ExternalLink size={12}/>
                            <span>Local Video</span>
                        </a>
                    </div>
                </div>
                <div className={styles.videoPlayerWrap}>
                    <video
                        src="/OneShot_Task_Drawer_Compatibility_Fixed.mp4"
                        controls
                        autoPlay
                        muted
                        loop
                        preload="auto"
                        playsInline
                        className={styles.videoPlayer}
                    />
                </div>
                <div className={styles.videoFooter}>
                    <p className={styles.videoDesc}>
                        <strong>Task Drawer & Multi-Agent Compatibility:</strong> End-to-end execution flow demonstrating real-time activity tracing, participant telemetry, and deterministic result confirmation.
                    </p>
                </div>
            </div>

            {/* Key Documentation Grid */}
            <div className={styles.sectionTitle}>
                <BookOpen size={14}/>
                <span>Key Demonstration Documentation</span>
            </div>

            <div className={styles.grid}>
                {KEY_DOCUMENTS.map((doc) => {
                    const Icon = doc.icon
                    const isPdf = doc.path.toLowerCase().endsWith('.pdf')
                    const fileName = doc.path.split('/').pop() || doc.path
                    return (
                        <div key={doc.id} className={styles.card}>
                            <div className={styles.cardHeader}>
                                <div className={styles.cardIconWrap}>
                                    <Icon size={16}/>
                                </div>
                                <div className={styles.cardMeta}>
                                    <div className={styles.cardName}>
                                        <span>{doc.title}</span>
                                        <span className={styles.cardFormat}>{doc.format}</span>
                                    </div>
                                    <span className={styles.cardPath}>{doc.path}</span>
                                </div>
                            </div>
                            <p className={styles.cardDesc}>{doc.description}</p>
                            <div className={styles.cardActions}>
                                <button
                                    className={styles.openBtn}
                                    onClick={() => onOpenFile(fileName, doc.path)}
                                    title={`Open ${doc.title} in IDE viewer`}
                                >
                                    <Eye size={12}/>
                                    <span>Inspect in Viewer</span>
                                </button>
                                <a
                                    href={`/v1/workspace/raw?path=${encodeURIComponent(doc.path)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={styles.rawLink}
                                    title="Open raw document in new browser tab"
                                >
                                    <ExternalLink size={12}/>
                                    <span>{isPdf ? 'Open PDF' : 'Raw'}</span>
                                </a>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
