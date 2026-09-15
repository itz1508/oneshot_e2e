import { useEffect, useId, useRef, type ReactNode } from "react";

export function Modal({
    title,
    children,
    close,
}: {
    title: string;
    children: ReactNode;
    close: () => void;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    useEffect(() => {
        const dialog = ref.current;
        const opener = document.activeElement;
        dialog?.showModal();
        return () => {
            dialog?.close();
            if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
        };
    }, []);
    return (
        <dialog ref={ref} onCancel={close} className="modal-dialog" aria-labelledby={titleId}>
            <div className="modal-card">
                <header className="modal-header">
                    <div className="modal-title-wrap">
                        <h3 id={titleId}>{title}</h3>
                    </div>
                    <div className="modal-actions">
                        <button
                            className="icon-close-btn"
                            onClick={close}
                            aria-label="Close dialog"
                        >
                            ×
                        </button>
                    </div>
                </header>
                <div className="modal-body">{children}</div>
            </div>
        </dialog>
    );
}
