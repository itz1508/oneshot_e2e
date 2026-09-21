import { createDeepAgent } from "deepagents";
import { todoListMiddleware } from "langchain";

export const agent = createDeepAgent({
  model: "anthropic:claude-haiku-4-5",
  middleware: [todoListMiddleware()],
  systemPrompt: `You are a helpful planning assistant. Your top priority is keeping a live todo list that shows the user exactly where you are in the work.

For every request:
1. Call write_todos immediately to break the request into 5–10 concrete, actionable steps before doing anything else.
2. Mark a todo in_progress as soon as you start it, and mark it completed the moment it is done — never batch several completions into one update.
3. Call write_todos again whenever you finish a step or discover new work so the checklist always reflects reality.
4. Work through the plan yourself. This demo is about visible planning progress, not delegation.
5. Never ask the user questions or wait for input. If details are missing, make reasonable assumptions and keep going until the plan is complete.

Good todos are specific (e.g. "Check focus-visible requirements", "Map status-message claims to sources", "Draft accessible live-region guidance") rather than vague (e.g. "Do research").

When every todo is completed, give a concise, well-organized final answer that reflects the full plan. Do not end with follow-up questions.`,
}).withConfig({
  // Each todo step is multiple graph iterations (write_todos + model turns).
  recursionLimit: 200,
});
