/**
 * AppShell — Full-Viewport Application Shell with Dual Rails.
 *
 * Database storage browser with searchable widget view.
 * Left icon rail + center widget grid + right detail panel.
 */

import {useState, useMemo} from 'react'
import {
    FolderOpen, Bell, Search,
    ChevronRight, Activity, Database, Shield,
    Users, Layers, HardDrive,
    Grid3X3, List, X
} from 'lucide-react'
import styles from './AppShell.module.css'

// ── Left rail items ──
const railItems = [
    {id: 'all', icon: Grid3X3, label: 'All'},
    {id: 'projects', icon: FolderOpen, label: 'Projects'},
    {id: 'records', icon: Database, label: 'Records'},
    {id: 'activity', icon: Activity, label: 'Activity'},
    {id: 'security', icon: Shield, label: 'Security'},
    {id: 'users', icon: Users, label: 'Users'},
]

// ── Storage records (database) ──
interface StorageRecord {
    id: string
    title: string
    type: 'project' | 'record' | 'task' | 'log' | 'config' | 'user'
    status: 'active' | 'archived' | 'pending' | 'error'
    size: string
    updated: string
    tags: string[]
    description: string
}

const storageRecords: StorageRecord[] = [
    {id: 'rec-001', title: 'OneShot Core', type: 'project', status: 'active', size: '2.4 GB', updated: '2m ago', tags: ['backend', 'python'], description: 'Core platform service with MCP integration and A-Flow lifecycle.'},
    {id: 'rec-002', title: 'Web Frontend', type: 'project', status: 'active', size: '180 MB', updated: '14m ago', tags: ['react', 'typescript'], description: 'React + TypeScript operator interface with dual-rail shell.'},
    {id: 'rec-003', title: 'Build #89', type: 'log', status: 'active', size: '12 KB', updated: '1h ago', tags: ['ci', 'deploy'], description: 'Release build passed all gates. Deployed to staging.'},
    {id: 'rec-004', title: 'Issue #203', type: 'task', status: 'pending', size: '4 KB', updated: '2h ago', tags: ['bug', 'ui'], description: 'Filter toolbar not updating on date range change.'},
    {id: 'rec-005', title: 'Auth Config', type: 'config', status: 'active', size: '2 KB', updated: '3h ago', tags: ['security', 'auth'], description: 'OAuth2 provider settings and token rotation policy.'},
    {id: 'rec-006', title: 'User: operator-1', type: 'user', status: 'active', size: '1 KB', updated: '5h ago', tags: ['admin', 'active'], description: 'Primary operator account with full workspace access.'},
    {id: 'rec-007', title: 'Data Pipeline', type: 'project', status: 'active', size: '890 MB', updated: '6h ago', tags: ['etl', 'streaming'], description: 'Real-time data ingestion and transformation pipeline.'},
    {id: 'rec-008', title: 'Deploy #42', type: 'log', status: 'active', size: '8 KB', updated: '8h ago', tags: ['deploy', 'prod'], description: 'Production deployment completed. Zero downtime.'},
    {id: 'rec-009', title: 'PR #187', type: 'task', status: 'active', size: '24 KB', updated: '12h ago', tags: ['merged', 'feature'], description: 'Dual-rail application shell with widget view.'},
    {id: 'rec-010', title: 'Legacy API', type: 'project', status: 'archived', size: '1.2 GB', updated: '2d ago', tags: ['deprecated', 'v1'], description: 'Deprecated REST API. Migrated to MCP transport.'},
    {id: 'rec-011', title: 'Security Audit', type: 'record', status: 'pending', size: '56 KB', updated: '3d ago', tags: ['audit', 'compliance'], description: 'Quarterly security audit report pending review.'},
    {id: 'rec-012', title: 'Rate Limiter', type: 'config', status: 'active', size: '1 KB', updated: '4d ago', tags: ['throttle', 'api'], description: 'API rate limiting: 1000 req/min per operator.'},
    {id: 'rec-013', title: 'Error Handler', type: 'record', status: 'error', size: '3 KB', updated: '5d ago', tags: ['error', 'critical'], description: 'Unhandled exception in batch processor. Needs fix.'},
    {id: 'rec-014', title: 'User: viewer-2', type: 'user', status: 'archived', size: '1 KB', updated: '1w ago', tags: ['readonly', 'archived'], description: 'Read-only viewer account. Archived last week.'},
    {id: 'rec-015', title: 'Cache Layer', type: 'config', status: 'active', size: '4 KB', updated: '1w ago', tags: ['redis', 'cache'], description: 'Redis-backed cache with 5min TTL default.'},
    {id: 'rec-016', title: 'Migration v2.4', type: 'task', status: 'pending', size: '18 KB', updated: '2w ago', tags: ['migration', 'schema'], description: 'Database schema migration for v2.4 release.'},
]

const typeColors: Record<string, string> = {
    project: '#3b82f6',
    record: '#8b5cf6',
    task: '#f59e0b',
    log: '#22c55e',
    config: '#06b6d4',
    user: '#ec4899',
}

const statusDot: Record<string, string> = {
    active: 'dot_success',
    archived: 'dot_archived',
    pending: 'dot_warn',
    error: 'dot_error',
}

export function AppShell() {
    const [activeRail, setActiveRail] = useState('all')
    const [search, setSearch] = useState('')
    const [selectedRecord, setSelectedRecord] = useState<StorageRecord | null>(storageRecords[0])
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [records, setRecords] = useState(storageRecords)
    const [dragId, setDragId] = useState<string | null>(null)
    const [dragOverId, setDragOverId] = useState<string | null>(null)

    // Filter records by search + rail
    const filtered = useMemo(() => {
        let recs = records

        // Filter by rail category
        if (activeRail !== 'all') {
            const typeMap: Record<string, StorageRecord['type'][]> = {
                projects: ['project'],
                records: ['record', 'config'],
                activity: ['log', 'task'],
                security: ['config'],
                users: ['user'],
            }
            const types = typeMap[activeRail] ?? []
            recs = recs.filter(r => types.includes(r.type))
        }

        // Filter by search
        if (search.trim()) {
            const q = search.toLowerCase()
            recs = recs.filter(r =>
                r.title.toLowerCase().includes(q) ||
                r.description.toLowerCase().includes(q) ||
                r.tags.some(t => t.toLowerCase().includes(q)) ||
                r.type.toLowerCase().includes(q) ||
                r.status.toLowerCase().includes(q)
            )
        }

        return recs
    }, [activeRail, search, records])

    // Drag handlers
    const handleDragStart = (id: string) => {
        setDragId(id)
    }

    const handleDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault()
        if (id !== dragId) setDragOverId(id)
    }

    const handleDragLeave = () => {
        setDragOverId(null)
    }

    const handleDrop = (targetId: string) => {
        if (!dragId || dragId === targetId) {
            setDragId(null)
            setDragOverId(null)
            return
        }
        setRecords(prev => {
            const arr = [...prev]
            const dragIdx = arr.findIndex(r => r.id === dragId)
            const targetIdx = arr.findIndex(r => r.id === targetId)
            if (dragIdx < 0 || targetIdx < 0) return prev
            const [moved] = arr.splice(dragIdx, 1)
            arr.splice(targetIdx, 0, moved)
            return arr
        })
        setDragId(null)
        setDragOverId(null)
    }

    // Storage stats
    const totalSize = '5.8 GB'
    const activeCount = storageRecords.filter(r => r.status === 'active').length
    const pendingCount = storageRecords.filter(r => r.status === 'pending').length
    const errorCount = storageRecords.filter(r => r.status === 'error').length

    return (
        <div className={styles.shell}>
            {/* ── Top navbar ── */}
            <header className={styles.topbar}>
                <div className={styles.topbarLeft}>
                    <Layers size={18} className={styles.logoIcon}/>
                    <span className={styles.logoText}>OneShot</span>
                    <span className={styles.topbarDivider}/>
                    <span className={styles.topbarSection}>
                        <HardDrive size={13}/> Storage
                    </span>
                    <span className={styles.breadcrumb}>
                        <ChevronRight size={12}/> {railItems.find(r => r.id === activeRail)?.label ?? 'All'}
                    </span>
                </div>
                <div className={styles.topbarRight}>
                    <div className={styles.searchBox}>
                        <Search size={13} className={styles.searchIcon}/>
                        <input
                            className={styles.searchInput}
                            placeholder="Search records, tags, types…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                            <button className={styles.searchClear} onClick={() => setSearch('')}>
                                <X size={12}/>
                            </button>
                        )}
                    </div>
                    <div className={styles.viewToggle}>
                        <button
                            className={`${styles.viewBtn}${viewMode === 'grid' ? ` ${styles.viewBtnActive}` : ''}`}
                            onClick={() => setViewMode('grid')}
                            title="Grid view"
                        >
                            <Grid3X3 size={13}/>
                        </button>
                        <button
                            className={`${styles.viewBtn}${viewMode === 'list' ? ` ${styles.viewBtnActive}` : ''}`}
                            onClick={() => setViewMode('list')}
                            title="List view"
                        >
                            <List size={13}/>
                        </button>
                    </div>
                    <button className={styles.iconBtn} title="Notifications">
                        <Bell size={15}/>
                    </button>
                    <div className={styles.avatar}>A</div>
                </div>
            </header>

            <div className={styles.body}>
                {/* ── Left icon rail ── */}
                <nav className={styles.leftRail}>
                    {railItems.map(item => {
                        const Icon = item.icon
                        const isActive = activeRail === item.id
                        return (
                            <button
                                key={item.id}
                                type="button"
                                className={`${styles.railItem}${isActive ? ` ${styles.railItemActive}` : ''}`}
                                onClick={() => setActiveRail(item.id)}
                                title={item.label}
                            >
                                <Icon size={18}/>
                                <span className={styles.railLabel}>{item.label}</span>
                                {isActive && <span className={styles.railIndicator}/>}
                            </button>
                        )
                    })}
                </nav>

                {/* ── Center: widget grid ── */}
                <main className={styles.center}>
                    {/* Storage stats bar */}
                    <div className={styles.statsBar}>
                        <div className={styles.statPill}>
                            <HardDrive size={12}/>
                            <span>{totalSize}</span>
                            <span className={styles.statPillLabel}>Storage</span>
                        </div>
                        <div className={styles.statPill}>
                            <span className={`${styles.dot} ${styles.dot_success}`}/>
                            <span>{activeCount}</span>
                            <span className={styles.statPillLabel}>Active</span>
                        </div>
                        <div className={styles.statPill}>
                            <span className={`${styles.dot} ${styles.dot_warn}`}/>
                            <span>{pendingCount}</span>
                            <span className={styles.statPillLabel}>Pending</span>
                        </div>
                        <div className={styles.statPill}>
                            <span className={`${styles.dot} ${styles.dot_error}`}/>
                            <span>{errorCount}</span>
                            <span className={styles.statPillLabel}>Error</span>
                        </div>
                        <span className={styles.resultCount}>{filtered.length} records</span>
                    </div>

                    {/* Widget grid / list */}
                    {filtered.length === 0 ? (
                        <div className={styles.emptyState}>
                            <Database size={28} className={styles.emptyIcon}/>
                            <span className={styles.emptyText}>No records match "{search}"</span>
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className={styles.widgetGrid}>
                            {filtered.map(record => (
                                <button
                                    key={record.id}
                                    type="button"
                                    draggable
                                    onDragStart={() => handleDragStart(record.id)}
                                    onDragOver={(e) => handleDragOver(e, record.id)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={() => handleDrop(record.id)}
                                    className={[
                                        styles.widget,
                                        selectedRecord?.id === record.id ? styles.widgetActive : '',
                                        dragId === record.id ? styles.widgetDragging : '',
                                        dragOverId === record.id ? styles.widgetDragOver : '',
                                    ].filter(Boolean).join(' ')}
                                    onClick={() => setSelectedRecord(record)}
                                >
                                    <div className={styles.widgetHeader}>
                                        <span
                                            className={styles.typeBadge}
                                            style={{background: `${typeColors[record.type]}20`, color: typeColors[record.type]}}
                                        >
                                            {record.type}
                                        </span>
                                        <span className={`${styles.dot} ${styles[statusDot[record.status]]}`}/>
                                    </div>
                                    <div className={styles.widgetTitle}>{record.title}</div>
                                    <div className={styles.widgetDesc}>{record.description}</div>
                                    <div className={styles.widgetFooter}>
                                        <div className={styles.tagRow}>
                                            {record.tags.map(tag => (
                                                <span key={tag} className={styles.tag}>{tag}</span>
                                            ))}
                                        </div>
                                        <div className={styles.widgetMeta}>
                                            <span>{record.size}</span>
                                            <span className={styles.metaSep}>·</span>
                                            <span>{record.updated}</span>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className={styles.listView}>
                            {filtered.map(record => (
                                <button
                                    key={record.id}
                                    type="button"
                                    draggable
                                    onDragStart={() => handleDragStart(record.id)}
                                    onDragOver={(e) => handleDragOver(e, record.id)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={() => handleDrop(record.id)}
                                    className={[
                                        styles.listRow,
                                        selectedRecord?.id === record.id ? styles.listRowActive : '',
                                        dragId === record.id ? styles.widgetDragging : '',
                                        dragOverId === record.id ? styles.widgetDragOver : '',
                                    ].filter(Boolean).join(' ')}
                                    onClick={() => setSelectedRecord(record)}
                                >
                                    <span className={`${styles.dot} ${styles[statusDot[record.status]]}`}/>
                                    <span
                                        className={styles.typeBadge}
                                        style={{background: `${typeColors[record.type]}20`, color: typeColors[record.type]}}
                                    >
                                        {record.type}
                                    </span>
                                    <span className={styles.listTitle}>{record.title}</span>
                                    <div className={styles.tagRow}>
                                        {record.tags.map(tag => (
                                            <span key={tag} className={styles.tag}>{tag}</span>
                                        ))}
                                    </div>
                                    <span className={styles.listSize}>{record.size}</span>
                                    <span className={styles.listTime}>{record.updated}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </main>

                {/* ── Right detail panel ── */}
                <aside className={styles.rightRail}>
                    <div className={styles.rightHeader}>
                        <span className={styles.rightTitle}>Details</span>
                    </div>
                    <div className={styles.rightContent}>
                        {selectedRecord ? (
                            <>
                                <div className={styles.detailSection}>
                                    <div className={styles.detailTitle}>{selectedRecord.title}</div>
                                    <span
                                        className={styles.typeBadge}
                                        style={{background: `${typeColors[selectedRecord.type]}20`, color: typeColors[selectedRecord.type]}}
                                    >
                                        {selectedRecord.type}
                                    </span>
                                </div>
                                <div className={styles.detailSection}>
                                    <span className={styles.detailLabel}>Description</span>
                                    <p className={styles.detailDesc}>{selectedRecord.description}</p>
                                </div>
                                <div className={styles.detailSection}>
                                    <span className={styles.detailLabel}>Properties</span>
                                    <div className={styles.metaList}>
                                        <div className={styles.metaRow}><span className={styles.metaKey}>ID</span><span className={styles.metaVal}>{selectedRecord.id}</span></div>
                                        <div className={styles.metaRow}><span className={styles.metaKey}>Status</span><span className={styles.metaVal}>{selectedRecord.status}</span></div>
                                        <div className={styles.metaRow}><span className={styles.metaKey}>Size</span><span className={styles.metaVal}>{selectedRecord.size}</span></div>
                                        <div className={styles.metaRow}><span className={styles.metaKey}>Updated</span><span className={styles.metaVal}>{selectedRecord.updated}</span></div>
                                    </div>
                                </div>
                                <div className={styles.detailSection}>
                                    <span className={styles.detailLabel}>Tags</span>
                                    <div className={styles.tagRow}>
                                        {selectedRecord.tags.map(tag => (
                                            <span key={tag} className={styles.tag}>{tag}</span>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className={styles.emptyState}>
                                <span className={styles.emptyText}>Select a record</span>
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    )
}
