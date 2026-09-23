/**
 * OneShot CLI Colors
 * 
 * Consistent terminal colors for CLI scripts.
 */

export const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
};

export const symbols = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  check: '✔',
  cross: '✘',
  bullet: '•',
  arrow: '→',
};

/**
 * Format message with color
 */
export function colorize(msg, color) {
  return `${colors[color]}${msg}${colors.reset}`;
}

/**
 * Print success message
 */
export function success(msg) {
  console.log(`${colors.green}${symbols.success}${colors.reset} ${msg}`);
}

/**
 * Print error message
 */
export function error(msg) {
  console.error(`${colors.red}${symbols.error}${colors.reset} ${msg}`);
}

/**
 * Print warning message
 */
export function warn(msg) {
  console.warn(`${colors.yellow}${symbols.warning}${colors.reset} ${msg}`);
}

/**
 * Print info message
 */
export function info(msg) {
  console.log(`${colors.blue}${symbols.info}${colors.reset} ${msg}`);
}

/**
 * Print success with checkmark
 */
export function done(msg) {
  console.log(`${colors.green}${symbols.check}${colors.reset} ${msg}`);
}

/**
 * Print failure with cross
 */
export function failed(msg) {
  console.error(`${colors.red}${symbols.cross}${colors.reset} ${msg}`);
}

/**
 * Print bullet point
 */
export function bullet(msg) {
  console.log(`${symbols.bullet} ${msg}`);
}

/**
 * Print section header
 */
export function section(title) {
  console.log();
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
}

/**
 * Print sub-header
 */
export function subSection(title) {
  console.log();
  console.log(`${colors.magenta}${title}${colors.reset}`);
  console.log(`${'─'.repeat(title.length)}`);
}

/**
 * Print progress indicator
 */
export function progress(current, total, label) {
  const percent = Math.round((current / total) * 100);
  const barLength = 30;
  const filled = Math.round((barLength * current) / total);
  const empty = barLength - filled;
  
  const bar = `${colors.green}${'█'.repeat(filled)}${colors.reset}${'░'.repeat(empty)}`;
  console.log(`  ${bar} ${percent}% ${label} (${current}/${total})`);
}
