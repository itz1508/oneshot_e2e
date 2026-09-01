/**
 * json-render catalog — read-only component vocabulary for the
 * Plan → Queue → Build → Evidence workflow renderer.
 *
 * No actions are exposed. This catalog is strictly for displaying
 * workflow state: stage notices, plan summaries, revision summaries,
 * queue status, build status, and task evidence.
 */

import { defineCatalog } from '@json-render/core'
import { schema } from '@json-render/react/schema'
import { shadcnComponentDefinitions } from '@json-render/shadcn/catalog'

export const catalog = defineCatalog(schema, {
    components: {
        // Layout
        Card: shadcnComponentDefinitions.Card,
        Stack: shadcnComponentDefinitions.Stack,
        Grid: shadcnComponentDefinitions.Grid,
        Separator: shadcnComponentDefinitions.Separator,

        // Navigation (read-only sections)
        Tabs: shadcnComponentDefinitions.Tabs,
        Accordion: shadcnComponentDefinitions.Accordion,

        // Data display
        Heading: shadcnComponentDefinitions.Heading,
        Text: shadcnComponentDefinitions.Text,
        Badge: shadcnComponentDefinitions.Badge,
        Alert: shadcnComponentDefinitions.Alert,
        Progress: shadcnComponentDefinitions.Progress,
        Table: shadcnComponentDefinitions.Table,
        Spinner: shadcnComponentDefinitions.Spinner,
        Skeleton: shadcnComponentDefinitions.Skeleton,
    },
    actions: {},
})
