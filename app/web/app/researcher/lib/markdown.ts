const PRETTY_NAMES: Record<string, string> = {
  tavily_search: "Web search",
  tavily_hybrid_research: "Hybrid research",
  read_page: "Read page",
  default: "Tool",
};

export function toolNamePretty(name: string): string {
  return PRETTY_NAMES[name] ?? name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
