import type { Bundle, Edits, EventRecord, Run, BuildReview, Conversation } from "./contracts";

export function readiness(run: Run | null, conversation: Conversation | null, build: BuildReview | null, waiting: boolean, connection: string): { score: number; label: string } {
    if (run?.pipeline_status === "Done") return { score: verifiedResult(run) ? 3 : 0, label: verifiedResult(run) ? "Passed" : run.test_result === "Failed" ? "Failed" : "Verification incomplete" };
    if (waiting) return { score: 2, label: "Research Review" };
    if (build?.status === "pending") return { score: 2, label: "Build Ready" };
    if (run) return { score: 1, label: "Running" };
    if (conversation?.intent?.ready_for_prompt) return { score: 3, label: "Ready" };
    return { score: 0, label: connection === "Connected" ? "Awaiting request" : connection };
}

export function stageState(run: Run | null, stage: string): string | undefined {
    const aliases: Record<string, string[]> = {
        "Gap Analysis": ["GapAnalysis", "Gap Analysis"],
        "Triple Validation": ["TripleValidation", "Triple Validation"],
        "Hash Verification": ["Hash", "Hash Verification", "Finalize"],
    };
    return run?.events.filter(event => (aliases[stage] || [stage]).includes(event.processor)).at(-1)?.execution_status;
}

export function mergeEvents(
    previous: EventRecord[],
    incoming: EventRecord[],
): EventRecord[] {
    return [
        ...new Map(
            [...previous, ...incoming].map((e) => [e.event_id, e]),
        ).values(),
    ].sort((a, b) => a.sequence - b.sequence);
}
export function eventNeedsSnapshot(event: EventRecord): boolean {
    return (
        ["PlanReview", "BuildReady", "Done"].includes(event.processor) ||
        ([
            "Researcher",
            "Planner",
            "Refactor",
            "Gap Analysis",
            "Evaluation",
        ].includes(event.processor) &&
            event.execution_status === "Completed")
    );
}
export function currentPhase(run: Run): string {
    return phaseLabel(
        run.events.filter((e) => e.scope === "WORKFLOW").at(-1)?.processor ||
            run.current_processor,
    );
}

export function editsFromBundle(bundle: Bundle): Edits {
    return {
        objective:
            bundle.goal?.objective || bundle.prompt?.requested_outcome || "",
        requirements: (bundle.plan?.requirements || []).map((r) => ({
            id: r.requirement_id,
            statement: r.statement,
        })),
        steps: (bundle.plan?.steps || []).map((s) => ({
            id: s.step_id,
            description: s.description,
        })),
        notes: [],
    };
}
export function verifiedResult(run: Run): boolean {
    const proof = run.hash_proof;
    return (
        run.pipeline_status === "Done" &&
        run.test_result === "Passed" &&
        proof?.equal === true &&
        !!proof.created_hash &&
        proof.created_hash === proof.recomputed_hash
    );
}
export function builderStarted(run: Run): boolean {
    return (run.events || []).some(
        (e) =>
            e.processor === "Builder" &&
            ["Running", "Completed", "Failed"].includes(e.execution_status),
    );
}
export function researchWaiting(run: Run): boolean {
    const events = run.events || [];
    if (
        run.pipeline_status === "Done" ||
        events.some(
            (e) =>
                e.processor === "Planner" && e.execution_status !== "Pending",
        )
    )
        return false;
    const research = events.filter((e) => e.processor === "Researcher").at(-1);
    const again = events.filter((e) => e.processor === "ResearchAgain").at(-1);
    return (
        research?.execution_status === "Completed" &&
        (!again || research.sequence > again.sequence)
    );
}
export function phaseLabel(processor?: string): string {
    const labels: Record<string, string> = {
        Researcher: "Researching project",
        PlanReview: "Research Review",
        Planner: "Preparing work",
        Refactor: "Refining plan",
        "Gap Analysis": "Checking gaps",
        Evaluation: "Evaluating",
        "Triple Validation": "Validating",
        BuildReady: "Build Ready",
        Builder: "Building",
        "Hash Verification": "Verifying",
        Done: "Finished",
    };
    return processor ? labels[processor] || processor : "Waiting for work";
}
