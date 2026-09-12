"use client";

import { useState } from "react";
import type {
  IntegrationItem,
  IntegrationFormValues,
  IntegrationTestResult,
} from "../../lib/contracts";
import { IntegrationList } from "./integration-list";
import { IntegrationForm } from "./integration-form";
import styles from "./integration.module.css";

export interface IntegrationDialogProps {
  integrations: IntegrationItem[];
  busy: boolean;
  onInstall: (id: string) => void;
  onConfigure: (id: string, values: IntegrationFormValues) => void;
  onTest: (
    id: string,
    values: IntegrationFormValues,
  ) => Promise<IntegrationTestResult>;
  onEnable: (id: string) => void;
  onDisable: (id: string) => void;
  onClose: () => void;
}

export function IntegrationDialog({
  integrations,
  busy,
  onInstall,
  onConfigure,
  onTest,
  onEnable,
  onDisable,
  onClose,
}: IntegrationDialogProps) {
  const [selected, setSelected] = useState<string | null>(
    integrations[0]?.id ?? null,
  );
  const selectedItem = integrations.find((i) => i.id === selected) ?? null;

  return (
    <div className={styles.veil} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="integrationDialogTitle"
      >
        <div className={styles.modalHead}>
          <div>
            <h2 id="integrationDialogTitle">Integration configuration</h2>
            <p>Choose a provider, model, and API key.</p>
          </div>
          <button
            className={`${styles.iconBtn} ${styles.modalClose}`}
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <IntegrationList
            integrations={integrations}
            selected={selected}
            onSelect={setSelected}
          />
          {selectedItem && (
            <IntegrationForm
              key={selectedItem.id}
              item={selectedItem}
              onInstall={onInstall}
              onConfigure={onConfigure}
              onTest={onTest}
              onEnable={onEnable}
              onDisable={onDisable}
              busy={busy}
            />
          )}
        </div>
      </div>
    </div>
  );
}
