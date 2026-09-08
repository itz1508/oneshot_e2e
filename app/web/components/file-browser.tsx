import { useState } from "react";
import { request } from "../lib/api";
import type { TreeNode, Mutation } from "../lib/contracts";
import { Modal } from "./modal";

function getFileIcon(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (["ts", "tsx", "js", "jsx"].includes(ext)) return "📄";
    if (["json", "yaml", "yml", "toml"].includes(ext)) return "📦";
    if (["py"].includes(ext)) return "🐍";
    if (["css", "scss", "less"].includes(ext)) return "🎨";
    if (["md", "txt", "rst"].includes(ext)) return "📝";
    if (["sh", "bash", "ps1", "bat"].includes(ext)) return "⚡";
    return "📄";
}

export function CodeViewerModal({
    file,
    close,
}: {
    file: { path: string; content: string };
    close: () => void;
}) {
    const [copied, setCopied] = useState(false);
    const lines = file.content.split("\n");
    const copy = () => {
        navigator.clipboard.writeText(file.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <Modal title={file.path} close={close}>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "8px",
                    alignItems: "center",
                }}
            >
                <span
                    className="mono"
                    style={{ fontSize: "11px", color: "var(--text-muted)" }}
                >
                    {lines.length} lines · {file.content.length} bytes
                </span>
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={copy}
                    style={{ height: "24px", fontSize: "10.5px" }}
                >
                    {copied ? "✓ Copied" : "Copy Content"}
                </button>
            </div>
            <div className="code-viewer-wrap">
                <div className="code-viewer-gutter">
                    {lines.map((_, i) => (
                        <div key={i}>{i + 1}</div>
                    ))}
                </div>
                <pre className="code-viewer-content file-view">
                    {file.content}
                </pre>
            </div>
        </Modal>
    );
}

export function FileNode({
    node,
    openFile,
    mutationsMap,
}: {
    node: TreeNode;
    openFile: (path: string) => void;
    mutationsMap: Map<string, Mutation>;
}) {
    const [children, setChildren] = useState<TreeNode[] | undefined>(undefined);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    const mutation = mutationsMap.get(node.path);
    let mutationBadge = null;
    if (mutation) {
        const act = (mutation.action || "").toLowerCase();
        if (act.includes("create")) {
            mutationBadge = (
                <span
                    className="node-mutation created"
                    title="Created by build"
                >
                    +
                </span>
            );
        } else if (act.includes("mod")) {
            mutationBadge = (
                <span
                    className="node-mutation modified"
                    title="Modified by build"
                >
                    ~
                </span>
            );
        } else if (act.includes("del")) {
            mutationBadge = (
                <span
                    className="node-mutation deleted"
                    title="Deleted by build"
                >
                    -
                </span>
            );
        }
    }

    if (node.type === "file") {
        return (
            <li className="tree-leaf-item">
                <button
                    className="file-row tree-row"
                    onClick={() => openFile(node.path)}
                >
                    <span className="file-icon">{getFileIcon(node.name)}</span>
                    <span className="file-name">{node.name}</span>
                    {node.size !== undefined && node.size > 0 && (
                        <span className="file-size">
                            {Math.round(node.size / 1024)}k
                        </span>
                    )}
                    {mutationBadge}
                </button>
            </li>
        );
    }

    const toggle = async () => {
        if (open) {
            setOpen(false);
            return;
        }
        setOpen(true);
        if (children !== undefined) return;
        setLoading(true);
        setError("");
        try {
            const data = await request<{ nodes: TreeNode[] }>(
                `/v1/workspace/tree?path=${encodeURIComponent(node.path)}&depth=1`,
            );
            setChildren(data.nodes || []);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    };

    return (
        <li className="tree-branch-item">
            <button
                className="folder-row"
                onClick={toggle}
                aria-expanded={open}
            >
                <span className="folder-arrow">{open ? "▼" : "▶"}</span>
                <span className="file-icon">📁</span>
                <span className="folder-name">{node.name}</span>
                {mutationBadge}
            </button>
            {open && (
                <ul className="tree-nested-list" role="group">
                    {loading && (
                        <li
                            className="tree-leaf-item text-dim"
                            style={{ padding: "2px 8px", fontSize: "10px" }}
                        >
                            Loading…
                        </li>
                    )}
                    {error && (
                        <li
                            className="tree-leaf-item text-rose"
                            style={{ padding: "2px 8px", fontSize: "10px" }}
                        >
                            {error}
                        </li>
                    )}
                    {children && children.length === 0 && !loading && (
                        <li
                            className="tree-leaf-item text-dim"
                            style={{ padding: "2px 8px", fontSize: "10px" }}
                        >
                            empty
                        </li>
                    )}
                    {children?.map((c) => (
                        <FileNode
                            key={c.path}
                            node={c}
                            openFile={openFile}
                            mutationsMap={mutationsMap}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
}
