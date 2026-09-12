"use client";

import { useState } from "react";
import type {
  IntegrationItem,
  IntegrationFormValues,
  IntegrationTestResult,
} from "../../lib/contracts";
import styles from "./integration.module.css";

export interface IntegrationFormProps {
  item: IntegrationItem;
  onInstall: (id: string) => void;
  onConfigure: (id: string, values: IntegrationFormValues) => void;
  onTest: (
    id: string,
    values: IntegrationFormValues,
  ) => Promise<IntegrationTestResult>;
  onEnable: (id: string) => void;
  onDisable: (id: string) => void;
  busy?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  testing: "Testing…",
  reachable: "Connected",
  auth_failed: "Authentication failed",
  unreachable: "Provider unreachable",
  package_missing: "Package not installed",
  invalid_config: "Configuration incomplete",
};

export function IntegrationForm({
  item,
  onInstall,
  onConfigure,
  onTest,
  onEnable,
  onDisable,
  busy,
}: IntegrationFormProps) {
  const id = item.id;
  const [values, setValues] = useState<IntegrationFormValues>({
    apiKey: "",
    model: "",
    baseURL: "",
  });
  const [showKey, setShowKey] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const canTest = item.installed && item.configured;
  const canEnable =
    item.installed &&
    item.configured &&
    item.last_test_status === "reachable" &&
    !item.enabled;

  const statusClass =
    item.last_test_status === "reachable"
      ? styles.statusOk
      : item.last_test_status === "testing" || item.last_test_status === null
        ? styles.statusBox
        : styles.statusBad;

  const handleTest = async () => {
    setTestError(null);
    const result = await onTest(id, values);
    if (!result.ok) setTestError(result.error ?? null);
  };

  return (
    <div className={styles.formGrid}>
      {!item.installed && (
        <div className={styles.modalActions}>
          <button
            className={styles.btnPrimary}
            type="button"
            onClick={() => onInstall(id)}
            disabled={busy}
          >
            {busy ? "Installing…" : "Install"}
          </button>
        </div>
      )}

      {item.installed && (
        <>
      <div className={styles.field}>
        <label htmlFor={`${id}-key`}>API key</label>
        <div className={styles.secret}>
          <input
            id={`${id}-key`}
            type={showKey ? "text" : "password"}
            value={values.apiKey}
            onChange={(e) => setValues({ ...values, apiKey: e.target.value })}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? "Hide API key" : "Show API key"}
          >
            {showKey ? "🙈" : "👁"}
          </button>
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-model`}>Model</label>
        <input
          id={`${id}-model`}
          value={values.model}
          onChange={(e) => setValues({ ...values, model: e.target.value })}
        />
      </div>
      <details className={styles.advanced}>
        <summary>Advanced</summary>
        <div className={styles.field}>
          <label htmlFor={`${id}-base`}>Base URL</label>
          <input
            id={`${id}-base`}
            value={values.baseURL}
            onChange={(e) => setValues({ ...values, baseURL: e.target.value })}
          />
        </div>
      </details>

      <div className={statusClass}>
        <span>
          {item.last_test_status
            ? (STATUS_LABEL[item.last_test_status] ?? item.last_test_status)
            : "Not tested yet"}
        </span>
        {item.last_test_at && (
          <small>{new Date(item.last_test_at).toLocaleString()}</small>
        )}
        {testError && <small>{testError}</small>}
      </div>

      <div className={styles.modalActions}>
        <button
          className={styles.btn}
          type="button"
          onClick={() => onConfigure(id, values)}
          disabled={busy}
        >
          Save
        </button>
        {canTest && (
          <button
            className={styles.btn}
            type="button"
            onClick={handleTest}
            disabled={busy}
          >
            {busy ? "Testing…" : "Test Connection"}
          </button>
        )}
        <span className={styles.spacer}></span>
        {item.enabled ? (
          <button
            className={styles.btn}
            type="button"
            onClick={() => onDisable(id)}
            disabled={busy}
          >
            Disable
          </button>
        ) : (
          <button
            className={styles.btnPrimary}
            type="button"
            onClick={() => onEnable(id)}
            disabled={busy || !canEnable}
            title={
              canEnable
                ? undefined
                : "Requires install, configuration, and a successful test"
            }
          >
            Enable
          </button>
        )}
      </div>

      {item.enabled && item.capabilities.length > 0 && (
        <div className={styles.chips}>
          {item.capabilities.map((cap) => (
            <span className={styles.chip} key={cap}>
              {cap}
            </span>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}
