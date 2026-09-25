export * from "./App";
export * from "./Sidebar";
export * from "./HeaderBar";
export * from "./EarlierConversation";
export * from "./EphemeralActivity";
export * from "./MessageBubble";
export * from "./Composer";
export * from "./ContextReviewDrawer";
export * from "./ProviderConfigModal";
export * from "./ResearcherDrawer";
export * from "./ResearchBanner";
export * from "./ToolCallList";

// Reference-only surfaces are intentionally not exported from the canonical
// component barrel. See frontend/web/AGENTS.md for the migration boundary.
export * from "./task-rail/TaskRail";
export * from "./task-rail/ActiveTask";
export * from "./task-rail/ProgressTracker";
export * from "./task-rail/ValidationPanel";
