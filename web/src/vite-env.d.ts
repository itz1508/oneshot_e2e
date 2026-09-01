/// <reference types="vite/client" />

interface ImportMetaEnv {
    /**
     * Optional absolute http(s) base URL for a separately hosted adapter.
     * The canonical OneShot UI uses same-origin /api and /v1 routes.
     */
    readonly VITE_ASSISTANT_API_URL?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
