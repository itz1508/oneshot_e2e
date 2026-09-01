/**
 * WelcomeDocsIndex — Key Architecture & Documentation Index Hub.
 * Displayed when the chat conversation is initially empty on launch.
 */

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
    CheckCircle2,
    Video,
    Play,
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

const PIPELINE_STAGES = [
    'Intent Understanding',
    'Repository Research',
    'Plan Synthesis',
    'Gap Analysis',
    'Triple Validation',
    'Confirmed Changes',
    'Cryptographic Verification',
    'Execution Handoff',
]

interface WelcomeDocsIndexProps {
    onOpenFile: (fileName: string, filePath: string) => void
    onStartPrompt?: (prompt: string) => void
    onOpenDocsModal?: () => void
}

export function WelcomeDocsIndex({
    onOpenFile,
    onStartPrompt,
    onOpenDocsModal,
}: WelcomeDocsIndexProps) {
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

            {/* Featured Demonstration Video */}
            <div className={styles.videoSection}>
                <div className={styles.videoHeader}>
                    <div className={styles.videoTitleWrap}>
                        <Play size={15} style={{color: '#f87171', fill: '#f87171'}}/>
                        <span className={styles.videoTitle}>Live Product Demonstration</span>
                        <span className={styles.videoBadge}>Interactive Walkthrough</span>
                    </div>
                    <a
                        href="/OneShot_Task_Drawer_Compatibility_Fixed.mp4"
                        target="_blank"
                        rel="noreferrer"
                        className={styles.rawLink}
                        title="Open video in new tab"
                    >
                        <ExternalLink size={12}/>
                        <span>Open Video</span>
                    </a>
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

            {/* Pipeline Strip */}
            <div className={styles.pipelineWrap}>
                <div className={styles.pipelineHeader}>
                    <span className={styles.pipelineTitle}>Canonical Execution Pipeline</span>
                    <span className={styles.pipelineBadge}>
                        <CheckCircle2 size={11} style={{marginRight: 4, display: 'inline'}}/>
                        13 Deterministic Stages
                    </span>
                </div>
                <div className={styles.pipelineStages}>
                    {PIPELINE_STAGES.map((stage, idx) => (
                        <span key={stage} style={{display: 'inline-flex', alignItems: 'center', gap: 6}}>
                            <span className={styles.stageChip}>{stage}</span>
                            {idx < PIPELINE_STAGES.length - 1 && <span className={styles.stageArrow}>→</span>}
                        </span>
                    ))}
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
