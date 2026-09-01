/**
 * json-render registry — maps the read-only catalog component names
 * to their pre-built shadcn/ui React implementations.
 *
 * No action handlers. This registry is strictly for rendering
 * workflow state in the Plan → Queue → Build → Evidence pipeline.
 */

import { defineRegistry } from '@json-render/react'
import { shadcnComponents } from '@json-render/shadcn'
import { catalog } from './catalog'

export const { registry } = defineRegistry(catalog, {
    components: {
        Card: shadcnComponents.Card,
        Stack: shadcnComponents.Stack,
        Grid: shadcnComponents.Grid,
        Separator: shadcnComponents.Separator,
        Tabs: shadcnComponents.Tabs,
        Accordion: shadcnComponents.Accordion,
        Heading: shadcnComponents.Heading,
        Text: shadcnComponents.Text,
        Badge: shadcnComponents.Badge,
        Alert: shadcnComponents.Alert,
        Progress: shadcnComponents.Progress,
        Table: shadcnComponents.Table,
        Spinner: shadcnComponents.Spinner,
        Skeleton: shadcnComponents.Skeleton,
    },
})
