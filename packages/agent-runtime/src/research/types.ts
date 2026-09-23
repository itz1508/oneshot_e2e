/**
 * OneShot Research Engine Types
 */

export type ResearchDepth = "basic" | "advanced";

export interface ResearchQueryOptions {
  depth?: ResearchDepth;
  maxResults?: number;
  includeAnswer?: boolean;
  deterministicFixture?: boolean;
}

export interface ResearchResultItem {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface ResearchResponse {
  query: string;
  depth: ResearchDepth;
  results: ResearchResultItem[];
  answer?: string;
  executedBy: "agent" | "user_standalone";
  timestamp: string;
}
