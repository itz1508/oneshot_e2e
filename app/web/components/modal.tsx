import { useEffect, useRef, type ReactNode } from "react";

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
    useEffect(() => {
        ref.current?.showModal();
    }, []);
    return (
        <dialog ref={ref} onCancel={close} className="modal-dialog">
            <div className="modal-card">
                <header className="modal-header">
                    <div className="modal-title-wrap">
                        <h3>{title}</h3>
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
