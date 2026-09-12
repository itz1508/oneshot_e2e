"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  IntegrationItem,
  IntegrationFormValues,
  IntegrationTestResult,
} from "../lib/contracts";
import { request } from "../lib/http-client";

export function useIntegrations() {
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const data = await request<{ integrations: IntegrationItem[] }>(
      "/api/integrations",
    );
    setIntegrations(data.integrations ?? []);
  }, []);

  const install = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await request(`/api/integrations/${id}/install`, { method: "POST" });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const configure = useCallback(
    async (id: string, values: IntegrationFormValues) => {
      setBusy(true);
      try {
        await request(`/api/integrations/${id}/configure`, {
          method: "POST",
          body: JSON.stringify(values),
        });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const test = useCallback(
    async (
      id: string,
      values: IntegrationFormValues,
    ): Promise<IntegrationTestResult> => {
      setBusy(true);
      try {
        const result = await request<IntegrationTestResult>(
          `/api/integrations/${id}/test`,
          { method: "POST", body: JSON.stringify(values) },
        );
        await refresh();
        return result;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const enable = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await request(`/api/integrations/${id}/enable`, { method: "POST" });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const disable = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await request(`/api/integrations/${id}/disable`, { method: "POST" });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const uninstall = useCallback(
    async (id: string, removeCredentials = false) => {
      setBusy(true);
      try {
        await request(`/api/integrations/${id}/uninstall`, {
          method: "POST",
          body: JSON.stringify({ removeCredentials }),
        });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    integrations,
    busy,
    refresh,
    install,
    configure,
    test,
    enable,
    disable,
    uninstall,
  };
}
