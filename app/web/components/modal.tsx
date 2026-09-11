import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./integration-modal.module.css";

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
    const isIntegrationDialog = title === "Model Integrations";
    const displayTitle = isIntegrationDialog ? "Integrations" : title;

    useEffect(() => {
        const dialog = ref.current;
        const opener = document.activeElement;
        dialog?.showModal();

        if (isIntegrationDialog) {
            const modelInput = dialog?.querySelector<HTMLInputElement>('input[name="model"]');
            if (modelInput?.value === "gemini-2.0-flash") {
                modelInput.value = "gemini-2.5-flash";
            }
        }

        return () => {
            dialog?.close();
            if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
        };
    }, [isIntegrationDialog]);

    return (
        <dialog
            ref={ref}
            onCancel={close}
            className={`modal-dialog ${isIntegrationDialog ? styles.integrationDialog : ""}`}
            aria-labelledby={titleId}
        >
            <div className="modal-card">
                <header className="modal-header">
                    <div className="modal-title-wrap">
                        <h3 id={titleId}>{displayTitle}</h3>
                        {isIntegrationDialog && (
                            <p className={styles.integrationSubtitle}>
                                Gemini is included. Add your key to configure it. Install other models only when you choose +.
                            </p>
                        )}
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
