import type { RouteHandler } from "./types.js";

export const handleHealthRoutes: RouteHandler = async (req, res, ctx) => {
  const { pathname } = ctx;

  // Health check endpoints
  if (
    (pathname === "/api/health" || pathname === "/health" || pathname === "/ping") &&
    (req.method === "GET" || req.method === "HEAD")
  ) {
    res.writeHead(200, { "Content-Type": "application/json" });
    if (req.method === "HEAD") {
      res.end();
      return true;
    }
    res.end(JSON.stringify({ status: "healthy", ok: true, version: "1.3.0" }));
    return true;
  }

  // Network connectivity test
  if (pathname === "/api/network/test" && req.method === "GET") {
    const results: Record<string, any> = {};
    const TIMEOUT = 5000;

    // Test Gemini API
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
      const geminiResponse = await fetch("https://generativelanguage.googleapis.com", {
        signal: controller.signal,
        method: "HEAD",
      });
      clearTimeout(timeoutId);
      results.gemini = {
        reachable: true,
        status: geminiResponse.status,
        url: "https://generativelanguage.googleapis.com",
      };
    } catch (error: any) {
      results.gemini = {
        reachable: false,
        error: error.name === "AbortError" ? "Timeout" : error.message,
        url: "https://generativelanguage.googleapis.com",
      };
    }

    // Test OpenAI API
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
      const openaiResponse = await fetch("https://api.openai.com", {
        signal: controller.signal,
        method: "HEAD",
      });
      clearTimeout(timeoutId);
      results.openai = {
        reachable: true,
        status: openaiResponse.status,
        url: "https://api.openai.com",
      };
    } catch (error: any) {
      results.openai = {
        reachable: false,
        error: error.name === "AbortError" ? "Timeout" : error.message,
        url: "https://api.openai.com",
      };
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ network: results, timestamp: new Date().toISOString() }));
    return true;
  }

  return false;
};
