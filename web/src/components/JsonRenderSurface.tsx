/**
 * JsonRenderSurface — controlled renderer for the Plan → Queue → Build →
 * Evidence workflow.
 *
 * Wraps the json-render Renderer with JSONUIProvider using the read-only
 * catalog (14 display components, no actions). Callers supply a Spec and
 * optional initial state; the surface renders it with shadcn/ui components.
 *
 * This component does NOT expose action handlers. JSON specs cannot invoke
 * submit, cancel, navigate, or any other side-effect.
 */

import { JSONUIProvider, Renderer } from '@json-render/react'
import type { Spec } from '@json-render/react'
import { registry } from '@/lib/json-render/registry'

interface JsonRenderSurfaceProps {
    /** The JSON spec to render. */
    spec: Spec
    /** Optional initial state for dynamic prop expressions. */
    initialState?: Record<string, unknown>
}

export function JsonRenderSurface({ spec, initialState }: JsonRenderSurfaceProps) {
    return (
        <JSONUIProvider
            registry={registry}
            initialState={initialState}
        >
            <Renderer spec={spec} registry={registry} />
        </JSONUIProvider>
    )
}
