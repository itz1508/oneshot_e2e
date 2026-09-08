import type { Bundle, Edits, EventRecord, Run } from "./contracts";

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
