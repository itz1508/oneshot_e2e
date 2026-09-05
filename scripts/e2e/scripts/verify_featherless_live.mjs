import { resolveResearchProvider } from "../../../dist/backend/role/researcher/provider-resolver.js";

if (!process.env.FEATHERLESS_API_KEY?.trim()) {
  console.error(
    JSON.stringify(
      {
        result: "ROOT CAUSE",
        issue: "FEATHERLESS_API_KEY is not configured",
        correction:
          "Set FEATHERLESS_API_KEY in the backend process environment and rerun npm run verify:featherless-live",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} else {
  process.env.ONESHOT_MODE = "production";
  process.env.ONESHOT_RESEARCH_PROVIDER = "featherless";
  delete process.env.ONESHOT_FEATHERLESS_TEST_DRAFT_FILE;

  const runId = `featherless-live-${Date.now()}`;
  const prompt = {
    prompt_id: `prompt:${runId}`,
    intent: "Bind a real model to the existing ResearchProvider boundary",
    requested_outcome:
      "Produce valid Researcher content without changing the downstream workflow",
    context: [
      {
        context_id: `context:${runId}:1`,
        statement:
          "The model output must contain requirements, plan steps, and measurable success criteria.",
      },
    ],
    research_direction: [
      "Preserve Prompt and Researcher identity",
      "Return a strictly validated structured research draft",
    ],
  };

  const provider = await resolveResearchProvider(process.cwd());
  try {
    const bundle = await provider.research(prompt, runId);
    if (bundle.prompt.prompt_id !== prompt.prompt_id) {
      throw new Error("Prompt identity changed across ResearchProvider");
    }
    if (bundle.researcher.researcher_id !== `researcher:${runId}`) {
      throw new Error("Researcher identity is invalid");
    }
    if (
      !bundle.researcher.requirement_ids.length ||
      !bundle.plan.steps.length ||
      !bundle.goal.success_criteria.length
    ) {
      throw new Error("Researcher content is incomplete");
    }
    console.log(
      JSON.stringify(
        {
          result: "PASSED",
          provider: bundle.researcher.evidence[0]?.source,
          prompt_id: bundle.prompt.prompt_id,
          researcher_id: bundle.researcher.researcher_id,
          requirements: bundle.researcher.requirement_ids.length,
          plan_steps: bundle.plan.steps.length,
          success_criteria: bundle.goal.success_criteria.length,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          result: "ROOT CAUSE",
          issue: error instanceof Error ? error.message : String(error),
          provider: process.env.FEATHERLESS_MODEL || "google/gemma-4-31B-it",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } finally {
    provider.close?.();
  }
}
