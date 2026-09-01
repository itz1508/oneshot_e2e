/**
 * Status color system — 8-color passive visual overlay.
 *
 * Colors:
 * - White:      Normal (no issues)
 * - Yellow:     Build succeeded, not tested yet
 * - Cyan/Blue:  Validated, tests passed
 * - Green:      Fixed/repaired
 * - Green/Silver: Was fixed, now stale (gradient)
 * - Red:        Error
 * - Orange:     Overlapping/Duplication
 * - Dark Red:   Dead code
 *
 * Each color has a trace — it maps back to what determined it.
 */

import type { StatusColor } from '../agent/statusApi'

// ---------------------------------------------------------------------------
// Color type
// ---------------------------------------------------------------------------

export type StatusColorName =
    | 'white'
    | 'yellow'
    | 'cyan'
    | 'green'
    | 'green_silver'
    | 'red'
    | 'orange'
    | 'darkred'

// ---------------------------------------------------------------------------
// CSS background colors (rgba for subtle overlay on code)
// ---------------------------------------------------------------------------

const COLOR_CSS: Record<StatusColorName, { alive: string; dead: string }> = {
    white:        { alive: 'transparent',                  dead: 'rgba(107, 114, 128, 0.06)' },
    yellow:       { alive: 'rgba(234, 179, 8, 0.15)',     dead: 'rgba(234, 179, 8, 0.06)' },
    cyan:         { alive: 'rgba(6, 182, 212, 0.15)',     dead: 'rgba(6, 182, 212, 0.06)' },
    green:        { alive: 'rgba(34, 197, 94, 0.15)',     dead: 'rgba(34, 197, 94, 0.06)' },
    green_silver: { alive: 'rgba(34, 197, 94, 0.15)',     dead: 'rgba(34, 197, 94, 0.06)' },
    red:          { alive: 'rgba(239, 68, 68, 0.15)',     dead: 'rgba(239, 68, 68, 0.06)' },
    orange:       { alive: 'rgba(249, 115, 22, 0.15)',    dead: 'rgba(249, 115, 22, 0.06)' },
    darkred:      { alive: 'rgba(127, 29, 29, 0.20)',     dead: 'rgba(127, 29, 29, 0.10)' },
}

// ---------------------------------------------------------------------------
// Color classification
// ---------------------------------------------------------------------------

/**
 * Classify a status into its color name.
 * Handles the green/silver combination.
 */
export function classifyStatusColor(status: StatusColor): StatusColorName {
    // Green/Silver = resolved but stale
    if (status.final_color === 'green' && status.color_detail === 'silver') {
        return 'green_silver'
    }

    // Map final_color to our type
    const valid: StatusColorName[] = ['white', 'yellow', 'cyan', 'green', 'red', 'orange', 'darkred']
    if (valid.includes(status.final_color as StatusColorName)) {
        return status.final_color as StatusColorName
    }

    return 'white'
}

/**
 * Get the CSS background color for a status.
 * Green/Silver uses a gradient (green → silver).
 */
export function getStatusBackgroundColor(status: StatusColor): string {
    const colorName = classifyStatusColor(status)

    // Green/Silver gradient
    if (colorName === 'green_silver') {
        return 'linear-gradient(to right, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.15) 70%, rgba(156, 163, 175, 0.20) 70%, rgba(156, 163, 175, 0.20) 100%)'
    }

    const c = COLOR_CSS[colorName] || COLOR_CSS.white
    return c.alive
}

/**
 * Get a human-readable label for a status color.
 */
export function getStatusColorLabel(colorName: StatusColorName): string {
    switch (colorName) {
        case 'white':        return 'Normal'
        case 'yellow':       return 'Build Succeeded'
        case 'cyan':         return 'Validated'
        case 'green':        return 'Fixed'
        case 'green_silver': return 'Fixed (Stale)'
        case 'red':          return 'Error'
        case 'orange':       return 'Overlapping'
        case 'darkred':      return 'Dead'
        default:             return 'Unknown'
    }
}

// ---------------------------------------------------------------------------
// File utilities
// ---------------------------------------------------------------------------

/**
 * Check if a file path represents frontend code.
 */
export function isFrontendFile(path: string): boolean {
    const lower = path.toLowerCase()
    return lower.endsWith('.html') || lower.endsWith('.tsx') ||
           lower.endsWith('.jsx') || lower.endsWith('.vue')
}

/**
 * Filter statuses relevant to a specific file.
 * Matches by exact path or suffix (for relative vs absolute paths).
 */
export function statusesForFile(statuses: StatusColor[], filePath: string): StatusColor[] {
    return statuses.filter(s =>
        s.file_path === filePath || filePath.endsWith(s.file_path)
    )
}
