/**
 * ArtifactView.tsx — Main Screen Artifact Duality View
 *
 * Implements:
 * - Invariant 8: Runtime operates on (...).
 * - Invariant 9: Persistence operates on _id.
 * - Invariant 18: Every Artifact requires a Consumer.
 * - Invariant 24: Only final persisted decisions become *_id artifacts.
 * - Consumes: BuildCompleted, ValidationConfirmed
 */

import React, { useState } from "react";
import {
  ArtifactEntity,
  BuildCompletedEvent,
  ValidationConfirmedEvent,
} from "../../types/invariants";

export interface ArtifactViewProps {
  artifacts: ArtifactEntity[];
  buildEvent?: BuildCompletedEvent | null;
  validationEvent?: ValidationConfirmedEvent | null;
  onSelectArtifact?: (artifact: ArtifactEntity) => void;
}

export const ArtifactView: React.FC<ArtifactViewProps> = ({
  artifacts,
  buildEvent,
  validationEvent,
  onSelectArtifact,
}) => {
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const activeArtifact = artifacts[selectedIdx] || artifacts[0];

  return (
    <div
      className="flex flex-col h-full bg-[#111113] border-l border-[#27272a] text-zinc-300"
      role="region"
      aria-label="Artifact View"
    >
      {/* Header & Status Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272a] bg-[#18181b]/80">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-semibold text-zinc-100">Artifact Ledger</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-400">
            {artifacts.length} Active
          </span>
        </div>

        {/* Consumes: BuildCompleted & ValidationConfirmed */}
        <div className="flex items-center space-x-2 text-xs">
          {validationEvent && (
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                validationEvent.allPassed
                  ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/40"
                  : "bg-red-950/60 text-red-400 border border-red-800/40"
              }`}
            >
              Validation: {validationEvent.allPassed ? "CONFIRMED" : "FAILED"}
            </span>
          )}
          {buildEvent && (
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-950/60 text-blue-400 border border-blue-800/40">
              Build: {buildEvent.buildManifest.isValid ? "VALID" : "PENDING"}
            </span>
          )}
        </div>
      </div>

      {artifacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 p-6 text-center text-zinc-500">
          <span className="text-3xl mb-2">📦</span>
          <p className="text-sm font-medium text-zinc-400">No Artifacts Generated Yet</p>
          <p className="text-xs text-zinc-600 mt-1 max-w-xs">
            As the agent synthesizes plans, schemas, builds, or test fixtures, runtime artifacts will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* Artifacts List */}
          <div className="w-1/3 border-r border-[#27272a] overflow-y-auto divide-y divide-[#27272a]/60">
            {artifacts.map((art, idx) => {
              const isSelected = idx === selectedIdx;
              const isPersisted = Boolean(art.artifact_id);

              return (
                <button
                  key={`${art.runtimeName}-${idx}`}
                  onClick={() => {
                    setSelectedIdx(idx);
                    onSelectArtifact?.(art);
                  }}
                  className={`w-full text-left p-3 transition-colors ${
                    isSelected
                      ? "bg-zinc-800/80 border-l-2 border-emerald-500"
                      : "hover:bg-zinc-800/30"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    {/* Invariant 8: Runtime operates on (...) */}
                    <span className="text-xs font-mono font-medium text-zinc-200 truncate">
                      {art.runtimeName}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold ${
                        isPersisted
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800/30"
                          : "bg-amber-950 text-amber-400 border border-amber-800/30"
                      }`}
                    >
                      {isPersisted ? "PERSISTED" : "IN PROGRESS"}
                    </span>
                  </div>

                  {/* Invariant 18: Every Artifact requires a Consumer */}
                  <div className="text-[11px] text-zinc-400 truncate">
                    <span className="text-zinc-500">Consumer:</span> {art.consumer}
                  </div>

                  {/* Invariant 9: Persistence operates on _id */}
                  {art.artifact_id && (
                    <div className="text-[10px] font-mono text-zinc-500 truncate mt-0.5">
                      id: {art.artifact_id}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Artifact Details Panel */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {activeArtifact && (
              <>
                <div className="p-3 rounded-lg bg-[#18181b] border border-[#27272a] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500 font-mono">
                      {activeArtifact.artifact_id ? "Persistence Artifact (_id)" : "Runtime Artifact (...)"}
                    </span>
                    <span className="text-xs font-mono text-emerald-400">
                      status: {activeArtifact.status}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-zinc-100 font-mono">
                    {activeArtifact.runtimeName}
                  </h3>

                  {/* Invariant 18 Enforced Visibility */}
                  <div className="flex items-center space-x-2 text-xs py-1 border-t border-zinc-800">
                    <span className="text-zinc-400 font-medium">Designated Consumer:</span>
                    <span className="px-2 py-0.5 rounded bg-zinc-800 font-mono text-emerald-300 text-[11px]">
                      {activeArtifact.consumer}
                    </span>
                  </div>

                  {/* Invariant 24: Only final persisted decisions become *_id artifacts */}
                  {activeArtifact.artifact_id ? (
                    <div className="text-xs bg-zinc-900/90 p-2 rounded border border-zinc-800 font-mono text-zinc-300">
                      <span className="text-zinc-500">Immutable persistence identifier:</span>{" "}
                      <span className="text-blue-400">{activeArtifact.artifact_id}</span>
                    </div>
                  ) : (
                    <div className="text-xs bg-amber-950/20 p-2 rounded border border-amber-900/30 text-amber-300">
                      ⚠️ Runtime artifact is currently evolving in progress. It will anchor to an immutable _id upon validation and persistence.
                    </div>
                  )}
                </div>

                {/* Content Payload */}
                <div className="space-y-1">
                  <span className="text-xs font-medium text-zinc-400">Artifact Payload:</span>
                  <pre className="p-3 rounded-lg bg-[#141416] border border-[#27272a] text-xs font-mono text-zinc-300 overflow-x-auto max-h-96">
                    {typeof activeArtifact.content === "object"
                      ? JSON.stringify(activeArtifact.content, null, 2)
                      : String(activeArtifact.content ?? "{}")}
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
