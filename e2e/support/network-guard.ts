import type { Page, Request, Route } from "@playwright/test";

export interface NetworkGuard {
    unexpectedRequests: string[];
    dispose: () => Promise<void>;
}

export function attachNetworkGuard(
    page: Page,
    allowedOrigin: string = "http://127.0.0.1:4173"
): NetworkGuard {
    const unexpectedRequests: string[] = [];

    const FORBIDDEN_PATTERNS = [
        /\/api\/langgraph/i,
        /\/research(\/.*)?$/i,
        /openai/i,
        /anthropic/i,
        /gemini/i,
        /generativelanguage\.googleapis\.com/i,
        /tavily/i,
        /strands/i,
        /mcp/i,
    ];

    const routeHandler = async (route: Route, request: Request) => {
        const url = request.url();

        try {
            const parsed = new URL(url);
            const isLocal =
                parsed.origin === new URL(allowedOrigin).origin ||
                parsed.origin === "http://localhost:4173" ||
                parsed.origin === "http://127.0.0.1:4173";

            const matchesForbidden = FORBIDDEN_PATTERNS.some((pat) => pat.test(url));

            if (!isLocal || matchesForbidden) {
                unexpectedRequests.push(url);
                await route.abort("blockedbyclient");
                return;
            }

            await route.continue();
        } catch {
            unexpectedRequests.push(url);
            await route.abort("blockedbyclient");
        }
    };

    page.route("**/*", routeHandler);

    return {
        unexpectedRequests,
        dispose: async () => {
            await page.unroute("**/*", routeHandler).catch(() => {});
        },
    };
}
