/**
 * DocsIndexModal — Interactive Architecture & Documentation Catalog Modal.
 */

import {useState, useMemo} from 'react'
import {
    X,
    BookOpen,
    ExternalLink,
    Eye,
} from 'lucide-react'
import styles from './DocsIndexModal.module.css'

export interface DocCatalogItem {
    id: string
    title: string
    format: string
    path: string
    description: string
    category: 'Core Architecture' | 'Canonical Contracts' | 'Graphs & Runtime' | 'Guides & Overview'
}

const ALL_DOCUMENTS: DocCatalogItem[] = [
    {
        id: 'docs-index',
        title: 'Master Architecture & Documentation Index',
        format: 'Index Hub',
        path: 'docs/INDEX.md',
        description: 'Complete centralized index of all specifications, contracts, and execution diagrams.',
        category: 'Guides & Overview',
    },
    {
        id: 'workflow-tree',
        title: 'Workflow Tree (Source of Truth)',
        format: 'ASCII Specification',
        path: 'docs/WORKFLOW_TREE',
        description: 'Definitive hierarchy & step-by-step pipeline from Intent to Proof to Sandbox.',
        category: 'Core Architecture',
    },
    {
        id: 'workflow-tree-pdf',
        title: 'Workflow Tree Diagram',
        format: 'PDF Visual',
        path: 'docs/WORKFLOW_TREE.pdf',
        description: 'Rendered tree diagram illustrating the canonical workflow transition model.',
        category: 'Core Architecture',
    },
    {
        id: 'canonical-contract',
        title: 'Canonical Contract & Verification Spec',
        format: 'Draft 2020-12 Schema',
        path: 'docs/source/OneShot_Canonical_Contract_and_Verification.txt',
        description: 'Machine-readable schema definitions, audit IDs, gap verification, evaluation evidence, and canonical hashing.',
        category: 'Canonical Contracts',
    },
    {
        id: 'task-mgmt-graph',
        title: 'Task Management & ADK Runtime Graphs',
        format: 'Runtime Spec',
        path: 'docs/TASK_MANAGEMENT_AND_ADK_GRAPH.md',
        description: 'Monotonic event persistence, Google ADK Gemma 2 LlmAgent graph, and Authority graph projections.',
        category: 'Graphs & Runtime',
    },
    {
        id: 'workflow-processing-pdf',
        title: 'Visual Workflow Processing Map',
        format: 'PDF Visual',
        path: 'docs/Workflow_Processing.pdf',
        description: 'High-resolution diagram of processor transitions, proof checkpoints, and validation gates.',
        category: 'Core Architecture',
    },
    {
        id: 'judge-readme',
        title: 'Judge Demonstration Guide',
        format: 'Evaluation Guide',
        path: 'JUDGE_README.md',
        description: 'Under 3-minute quick-start demonstration guide for hackathon judges with interactive proof steps.',
        category: 'Guides & Overview',
    },
    {
        id: 'readme',
        title: 'Complete Repository Overview',
        format: 'Documentation',
        path: 'README.md',
        description: 'Full repository architecture, 60-second start, deterministic proofs, and test commands.',
        category: 'Guides & Overview',
    },
    {
        id: 'canonical-workflow',
        title: 'Canonical Workflow Authority & Governance',
        format: 'Governance Spec',
        path: 'CANONICAL_WORKFLOW.md',
        description: 'Workflow order and responsibility rules (ROLE != SKILL != TOOL != WORKFLOW).',
        category: 'Core Architecture',
    },
    {
        id: 'adk-integration',
        title: 'Google ADK Gemma 2 Integration',
        format: 'Integration Record',
        path: 'docs/ADK_GEMMA2_INTEGRATION.md',
        description: 'Google ADK LlmAgent runner integration with local Ollama Gemma 2 9B model.',
        category: 'Graphs & Runtime',
    },
    {
        id: 'workspace-api-design',
        title: 'Workspace API & Path Security Design',
        format: 'Control Plane Spec',
        path: 'docs/WORKSPACE_API_DESIGN.md',
        description: 'FastAPI control plane architecture, workspace security boundaries, and token rotation.',
        category: 'Graphs & Runtime',
    },
    {
        id: 'intent-authority',
        title: 'Intent Authority & Help Loops',
        format: 'Design Spec',
        path: 'docs/INTENT_AUTHORITY_AND_HELP.md',
        description: 'Multi-turn conversational intent collection, revision loops, and targeted help request workflows.',
        category: 'Canonical Contracts',
    },
    {
        id: 'script-skills',
        title: 'Script Skills & Contract Creation Guide',
        format: 'Guide',
        path: 'docs/source/Create_Script_Skills_and_Contracts.txt',
        description: 'Guide on creating script skills, schema contracts, and validator bindings.',
        category: 'Canonical Contracts',
    },
]

interface DocsIndexModalProps {
    open: boolean
    onClose: () => void
    onOpenFile: (fileName: string, filePath: string) => void
}

export function DocsIndexModal({open, onClose, onOpenFile}: DocsIndexModalProps) {
    const [query, setQuery] = useState('')

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return ALL_DOCUMENTS
        return ALL_DOCUMENTS.filter(
            (d) =>
                d.title.toLowerCase().includes(q) ||
                d.path.toLowerCase().includes(q) ||
                d.description.toLowerCase().includes(q) ||
                d.category.toLowerCase().includes(q),
        )
    }, [query])

    if (!open) return null

    const handleInspect = (doc: DocCatalogItem) => {
        const fileName = doc.path.split('/').pop() || doc.path
        onOpenFile(fileName, doc.path)
        onClose()
    }

    return (
        <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <div className={styles.headerTitle}>
                        <BookOpen size={16} style={{color: '#60a5fa'}}/>
                        <span>OneShot Documentation & Architecture Catalog</span>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Close modal">
                        <X size={16}/>
                    </button>
                </div>

                <div className={styles.searchBar}>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Filter documentation by name, path, schema, or keyword..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                </div>

                <div className={styles.body}>
                    {filtered.length === 0 ? (
                        <div style={{textAlign: 'center', padding: '32px', color: '#94a3b8'}}>
                            No documents matched "{query}"
                        </div>
                    ) : (
                        filtered.map((doc) => {
                            const isPdf = doc.path.toLowerCase().endsWith('.pdf')
                            return (
                                <div key={doc.id} className={styles.docRow}>
                                    <div className={styles.docInfo}>
                                        <div className={styles.docTitleWrap}>
                                            <span className={styles.docTitle}>{doc.title}</span>
                                            <span className={styles.docBadge}>{doc.format}</span>
                                        </div>
                                        <div className={styles.docPath}>{doc.path}</div>
                                        <div className={styles.docDesc}>{doc.description}</div>
                                    </div>
                                    <div className={styles.docButtons}>
                                        <button
                                            className={styles.inspectBtn}
                                            onClick={() => handleInspect(doc)}
                                        >
                                            <Eye size={12}/>
                                            <span>Inspect</span>
                                        </button>
                                        <a
                                            href={`/v1/workspace/raw?path=${encodeURIComponent(doc.path)}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className={styles.newTabBtn}
                                        >
                                            <ExternalLink size={12}/>
                                            <span>{isPdf ? 'PDF' : 'Raw'}</span>
                                        </a>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>

                <div className={styles.footer}>
                    <span>{filtered.length} documents indexed</span>
                    <span>All specifications verified with SHA-256 cryptographic proofs</span>
                </div>
            </div>
        </div>
    )
}
