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

    const FORBIDDEN_EXTERNAL_HOSTS = [
        /generativelanguage\.googleapis\.com/i,
        /openai\.com/i,
        /anthropic\.com/i,
        /tavily\.com/i,
        /nebius\.ai/i,
    ];

    const routeHandler = async (route: Route, request: Request) => {
        const url = request.url();

        try {
            const parsed = new URL(url);
            const isLocal =
                parsed.origin === new URL(allowedOrigin).origin ||
                parsed.origin === "http://localhost:4173" ||
                parsed.origin === "http://127.0.0.1:4173";

            const isFontOrStaticAsset =
                parsed.hostname === "fonts.googleapis.com" ||
                parsed.hostname === "fonts.gstatic.com";

            const matchesExternalForbidden = FORBIDDEN_EXTERNAL_HOSTS.some((pat) => pat.test(parsed.hostname));

            if (matchesExternalForbidden || (!isLocal && !isFontOrStaticAsset)) {
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
