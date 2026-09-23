/**
 * ValidationPanel.tsx — Deterministic Validation Ledger & Promotion Gate
 *
 * Implements:
 * - Invariant 10: Validation blocks promotion.
 * - Invariant 12: Expected must equal Observed.
 * - Invariant 13: No PASS without proof.
 * - Invariant 20: Every Validation requires: Expected, Observed, Assertion, Failure.
 * - Consumes: ValidationConfirmed
 */

import React from "react";
import { ValidationRecord, ValidationConfirmedEvent } from "../../types/invariants";

export interface ValidationPanelProps {
  validationEvent?: ValidationConfirmedEvent | null;
  validations?: ValidationRecord[];
  onConfirmPromotion?: () => void;
  isConfirming?: boolean;
}

export const ValidationPanel: React.FC<ValidationPanelProps> = ({
  validationEvent,
  validations = [],
  onConfirmPromotion,
  isConfirming = false,
}) => {
  // Merge items from props and event
  const records = validationEvent?.validations || validations;

  // Invariant 10: Validation blocks promotion
  // Invariant 13: No PASS without proof
  const hasFailedChecks = records.some((v) => !v.passed || !v.hasProof || v.failure !== null);
  const allChecksPassedWithProof = records.length > 0 && records.every((v) => v.passed && v.hasProof && v.failure === null);
  const canPromote = allChecksPassedWithProof && !hasFailedChecks;

  return (
    <div
      className="p-4 rounded-xl bg-[#18181b] border border-[#27272a] shadow-sm space-y-4"
      role="region"
      aria-label="Validation Panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-zinc-100">Validation Ledger</span>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-400">
            {records.length} Checks
          </span>
        </div>

        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
            canPromote
              ? "bg-emerald-950 text-emerald-300 border border-emerald-800/40"
              : "bg-amber-950 text-amber-300 border border-amber-800/40"
          }`}
        >
          {canPromote ? "READY FOR PROMOTION" : "PROMOTION BLOCKED"}
        </span>
      </div>

      {/* Notice on Invariants */}
      <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 leading-relaxed">
        <strong className="text-zinc-200">Enforcing Invariants:</strong> Expected must equal Observed (Inv 12).
        No PASS without proof (Inv 13). Validation blocks promotion (Inv 10).
      </div>

      {/* Validation Checklist enforcing Invariant 20: Expected, Observed, Assertion, Failure */}
      <div className="space-y-2.5 max-h-64 overflow-y-auto">
        {records.length === 0 ? (
          <div className="text-xs text-zinc-500 italic p-4 text-center bg-zinc-900/40 rounded border border-zinc-800">
            No validation records registered yet.
          </div>
        ) : (
          records.map((rec) => {
            const isMatch = JSON.stringify(rec.expected) === JSON.stringify(rec.observed);
            const isValidPass = rec.passed && rec.hasProof && !rec.failure && isMatch;

            return (
              <div
                key={rec.id}
                className={`p-3 rounded-lg border text-xs space-y-2 transition-all ${
                  isValidPass
                    ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-200"
                    : "bg-red-950/20 border-red-800/40 text-red-200"
                }`}
              >
                {/* 1. Assertion */}
                <div className="flex items-center justify-between font-medium">
                  <span className="text-zinc-200 font-semibold">{rec.assertion}</span>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase font-bold ${
                      isValidPass
                        ? "bg-emerald-900/60 text-emerald-300"
                        : "bg-red-900/60 text-red-300"
                    }`}
                  >
                    {isValidPass ? "PASS [PROOF]" : "FAIL"}
                  </span>
                </div>

                {/* 2. Expected vs 3. Observed (Invariant 12) */}
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-1 border-t border-zinc-800/60">
                  <div className="p-1.5 rounded bg-zinc-900/80 border border-zinc-800">
                    <span className="text-zinc-500 block text-[9px] uppercase font-sans font-semibold">
                      Expected:
                    </span>
                    <span className="text-zinc-300 break-all">
                      {typeof rec.expected === "object" ? JSON.stringify(rec.expected) : String(rec.expected)}
                    </span>
                  </div>

                  <div className="p-1.5 rounded bg-zinc-900/80 border border-zinc-800">
                    <span className="text-zinc-500 block text-[9px] uppercase font-sans font-semibold">
                      Observed:
                    </span>
                    <span className="text-zinc-300 break-all">
                      {typeof rec.observed === "object" ? JSON.stringify(rec.observed) : String(rec.observed)}
                    </span>
                  </div>
                </div>

                {/* 4. Failure Message (Invariant 20) */}
                {rec.failure && (
                  <div className="p-1.5 rounded bg-red-950/60 border border-red-900/60 text-red-300 text-[11px]">
                    <strong className="text-red-200">Failure:</strong> {rec.failure}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Promotion Action Button */}
      <div className="pt-2 border-t border-zinc-800">
        <button
          onClick={onConfirmPromotion}
          disabled={!canPromote || isConfirming}
          className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition-colors ${
            canPromote
              ? "bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-md shadow-emerald-950"
              : "bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-60"
          }`}
        >
          {isConfirming ? (
            <span>Authorizing Promotion Gate...</span>
          ) : canPromote ? (
            <span>Confirm Validation & Authorize Promotion Gate →</span>
          ) : (
            <span>Promotion Blocked by Validation Invariant</span>
          )}
        </button>
      </div>
    </div>
  );
};
