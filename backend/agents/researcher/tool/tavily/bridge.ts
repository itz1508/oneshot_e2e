export type TavilyRequest =
  | {
      op: "search";
      query: string;
      include_answer?: "basic" | "advanced" | false;
      search_depth?: "basic" | "advanced";
      max_results?: number;
    }
  | {
      op: "extract";
      urls: string[];
      query?: string;
      extract_depth?: "basic" | "advanced";
      format?: "markdown" | "text";
    }
  | {
      op: "research_stream";
      query: string;
      model?: "mini" | "pro" | "auto";
      citation_format?: "numbered" | "mla" | "apa" | "chicago";
    };

export interface TavilyRunner {
  run<T>(request: TavilyRequest): Promise<T>;
}
