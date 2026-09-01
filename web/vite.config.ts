import {defineConfig} from 'vitest/config'
import {loadEnv} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({mode}) => {
    const env = loadEnv(mode, __dirname, '')
    const oneShotBackendTarget =
        process.env.ONESHOT_BACKEND_PROXY_TARGET ??
        process.env.ONESHOT_ASSISTANT_PROXY_TARGET ??
        env.ONESHOT_BACKEND_PROXY_TARGET ??
        env.ONESHOT_ASSISTANT_PROXY_TARGET ??
        'http://127.0.0.1:8787'
    const visualBackendTarget =
        process.env.ONESHOT_VISUAL_PROXY_TARGET ??
        env.ONESHOT_VISUAL_PROXY_TARGET ??
        'http://127.0.0.1:8000'

    return {
        plugins: [react(), tailwindcss()],
        resolve: {
            alias: {'@': path.resolve(__dirname, './src')},
        },
        server: {
            headers: {
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'require-corp',
            },
            proxy: {
                '/api': oneShotBackendTarget,
                '/v1/assistant': oneShotBackendTarget,
                '/v1/chat': oneShotBackendTarget,
                '/v1/operations': oneShotBackendTarget,
                '/v1/usage': oneShotBackendTarget,
                '/v1/aflow': oneShotBackendTarget,
                '/v1/workspace': oneShotBackendTarget,
                '/v1/issues': oneShotBackendTarget,
                '/v1/status': oneShotBackendTarget,
                '/v1/visual': visualBackendTarget,
            },
        },
        preview: {
            headers: {
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'require-corp',
            },
        },
        test: {
            environment: 'jsdom',
            globals: true,
            setupFiles: ['./src/test-setup.ts'],
            css: {modules: {classNameStrategy: 'non-scoped'}},
            fileParallelism: false,
        },
    }
})
