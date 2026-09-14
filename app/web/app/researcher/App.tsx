"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, BookOpenText, CheckCircle2, Search, Sparkles, X } from "lucide-react";
import { ChatInput } from "./components/ChatInput";
import { HeaderBar } from "./components/HeaderBar";
import { MessageBubble } from "./components/MessageBubble";
import { SettingsPanel } from "./components/SettingsPanel";
import { Welcome } from "./components/Welcome";
import { IntegrationsDrawer } from "../../../components/IntegrationsDrawer";
import { toolNamePretty } from "./lib/markdown";
import { hasProviderSettings, hasTavilyKey, loadSettings, saveSettings } from "./lib/settings";
import { providerGateReason, researchStyleLabel } from "./lib/providers";
import { classifyError } from "./lib/errors";
import { startRun } from "./lib/runtime/adapter";
import type { RunEvent } from "./lib/runtime/events";
import { createChatStorage, deriveTitle, newSessionMeta, type ChatStorage } from "./lib/storage/chatStorage";
import { normalizeBaseUrl, uid } from "./lib/utils";
import type { ChatMessage, ProviderSettings, ResearchStyle, RunPhase, RuntimeError, SessionMeta, SourceDoc, ToolCallRecord } from "./types";

function mergeSources(current: SourceDoc[], next: SourceDoc[]): SourceDoc[] {
  const seen = new Set(current.map((s) => s.url));
  const fresh = next.filter((s) => !seen.has(s.url));
  if (fresh.length === 0) return current;
  const all = [...current, ...fresh];
  return all.map((s, i) => ({ ...s, index: i + 1 }));
}