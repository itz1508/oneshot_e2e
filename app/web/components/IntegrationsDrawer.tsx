import { Layers, X } from "lucide-react";
import {
  CATEGORY_LABELS,
  INTEGRATIONS_SEED,
  SUPPORT_LABELS,
  type IntegrationCategory,
  type IntegrationEntry,
  type SupportState,
} from "../lib/data/integrations";

const CATEGORY_ORDER: IntegrationCategory[] = [
  "model_provider",
  "tool",
  "session_manager",
  "memory_store",
  "storage",
  "integration",
  "plugin",
  "agent_extension",
  "intervention",
];

function supportTone(support: SupportState): string {
  if (support === "available") return "border-success/40 bg-success/10 text-success";
  if (support === "supported") return "border-accent/40 bg-accent-soft/40 text-accent";
  if (support === "unsupported") return "border-warning/40 bg-warning/10 text-warning";
  return "border-border bg-muted/50 text-subtle";
}

/** Integrations directory — a neutral catalog of what exists vs. what this browser-only build can run. */
export function IntegrationsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Integrations directory">
      <button className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Close integrations" tabIndex={-1} />
      <div className="relative flex h-full w-full max-w-lg flex-col border-l border-border bg-surface shadow-2xl">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Layers size={16} className="text-accent" />
          <h2 className="font-heading text-sm font-bold">Integrations</h2>
          <span className="ml-auto hidden font-mono text-[0.65rem] text-subtle sm:inline">
            neutral catalog · capability-labeled
          </span>
          <button type="button" className="btn btn-ghost px-2 py-1" onClick={onClose} aria-label="Close integrations">
            <X size={15} />
          </button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto scrollbar-thin px-4 py-4">
          {CATEGORY_ORDER.map((cat) => {
            const entries = INTEGRATIONS_SEED.filter((e: IntegrationEntry) => e.category === cat);
            if (entries.length === 0) return null;
            return (
              <section key={cat}>
                <h3 className="mb-1.5 font-heading text-[0.72rem] font-semibold uppercase tracking-widest text-subtle">
                  {CATEGORY_LABELS[cat]}
                </h3>
                <div className="space-y-1.5">
                  {entries.map((e: IntegrationEntry) => (
                    <div key={e.id} className="card px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[0.8rem] font-semibold">{e.name}</span>
                        <span
                          className={`ml-auto shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[0.6rem] ${supportTone(e.support)}`}
                          title={SUPPORT_LABELS[e.support]}
                        >
                          {SUPPORT_LABELS[e.support]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[0.76rem] leading-relaxed text-subtle">{e.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
