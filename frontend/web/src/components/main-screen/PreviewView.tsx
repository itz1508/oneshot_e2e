/**
 * PreviewView.tsx — Main Screen Preview View
 *
 * Implements:
 * - Invariant 14: No Build Complete without Build Manifest.
 * - Consumes: BuildCompleted
 */

import React, { useState } from "react";
import { BuildCompletedEvent } from "../../types/invariants";

export interface PreviewViewProps {
  buildEvent?: BuildCompletedEvent | null;
  customPreviewUrl?: string;
  mockScreenHtml?: string;
}

export const PreviewView: React.FC<PreviewViewProps> = ({
  buildEvent,
  customPreviewUrl,
  mockScreenHtml,
}) => {
  const [deviceMode, setDeviceMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Invariant 14: No Build Complete without Build Manifest
  const hasValidBuildManifest = Boolean(
    buildEvent && buildEvent.buildManifest && buildEvent.buildManifest.isValid
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <div
      className="flex flex-col h-full bg-[#111113] border-l border-[#27272a] text-zinc-300"
      role="region"
      aria-label="Preview View"
    >
      {/* Preview Header & Controls */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#27272a] bg-[#18181b]/80">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-semibold text-zinc-100">Live Preview</span>
          {hasValidBuildManifest && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800/40">
              BUILD: {buildEvent?.buildManifest.commitHash.slice(0, 7)}
            </span>
          )}
        </div>

        {/* Viewport switcher & refresh */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center rounded-lg bg-zinc-900 border border-zinc-800 p-0.5 text-xs">
            <button
              onClick={() => setDeviceMode("desktop")}
              className={`px-2 py-1 rounded ${
                deviceMode === "desktop" ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Desktop View"
            >
              🖥️
            </button>
            <button
              onClick={() => setDeviceMode("tablet")}
              className={`px-2 py-1 rounded ${
                deviceMode === "tablet" ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Tablet View"
            >
              📱
            </button>
            <button
              onClick={() => setDeviceMode("mobile")}
              className={`px-2 py-1 rounded ${
                deviceMode === "mobile" ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="Mobile View"
            >
              📲
            </button>
          </div>

          <button
            onClick={handleRefresh}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
            title="Reload Preview"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[#0d0d0e]">
        {!hasValidBuildManifest ? (
          <div className="max-w-md p-6 rounded-xl border border-zinc-800 bg-[#141416] text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-amber-950/60 border border-amber-800/40 flex items-center justify-center text-amber-400 text-xl">
              ⚙️
            </div>
            {/* Invariant 14: No Build Complete without Build Manifest */}
            <h4 className="text-sm font-semibold text-zinc-200">
              Build Manifest Required for Live Preview
            </h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              In accordance with <span className="font-mono text-amber-300">Invariant 14 (No Build Complete without Build Manifest)</span>,
              a verified and structurally valid build manifest must be registered before live preview can be projected.
            </p>
            <div className="text-[11px] font-mono p-2 rounded bg-zinc-900 border border-zinc-800 text-zinc-500">
              Waiting for BuildCompleted event with valid manifest...
            </div>
          </div>
        ) : (
          <div
            className={`transition-all duration-300 h-full w-full rounded-lg border border-zinc-800 bg-[#121214] shadow-2xl overflow-hidden flex flex-col ${
              deviceMode === "desktop"
                ? "max-w-full"
                : deviceMode === "tablet"
                ? "max-w-[768px]"
                : "max-w-[375px]"
            }`}
          >
            {/* Mock browser address bar */}
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-[#18181b] border-b border-zinc-800 text-xs text-zinc-400">
              <span className="flex space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
              </span>
              <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 font-mono text-[11px] flex-1 truncate">
                {customPreviewUrl || "oneshot://build-preview/dist/index.html"}
              </span>
            </div>

            {/* Preview Frame */}
            <div className="flex-1 w-full h-full relative">
              {mockScreenHtml ? (
                <iframe
                  title="OneShot Build Preview"
                  srcDoc={mockScreenHtml}
                  className="w-full h-full border-none"
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : (
                <iframe
                  title="OneShot Build Preview"
                  src={customPreviewUrl || "/mock-screen.html"}
                  className="w-full h-full border-none"
                  sandbox="allow-scripts allow-same-origin"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
