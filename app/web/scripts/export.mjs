import { cp, mkdir, rename, access, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(root, 'out');
const target = path.resolve(root, 'dist');
const backup = path.resolve(root, '../../.runtime/frontend-builds', String(Date.now()));
if (path.dirname(target) !== path.resolve(root) || !backup.startsWith(path.resolve(root, '../../.runtime') + path.sep)) throw new Error('Unexpected build path');
await access(path.join(output, 'index.html'));
// Next's static Flight bootstrap contains inline JavaScript. Externalize only
// executable scripts from trusted build output so the existing script-src
// 'self' policy can remain unchanged. Preserve document order and attributes.
const bootstrap = path.join(output, '_next', 'static', 'bootstrap');
await mkdir(bootstrap, { recursive: true });
async function externalize(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { await externalize(file); continue; }
    if (!entry.name.endsWith('.html')) continue;
    const html = await readFile(file, 'utf8');
    const scripts = [];
    const rewritten = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (original, attrs, code) => {
      if (/\bsrc\s*=/i.test(attrs) || !code.trim() || /\btype\s*=\s*["'](?!module|text\/javascript|application\/javascript)/i.test(attrs)) return original;
      const name = createHash('sha256').update(code).digest('hex') + '.js';
      scripts.push(writeFile(path.join(bootstrap, name), code));
      return `<script${attrs} src="/_next/static/bootstrap/${name}"></script>`;
    });
    await Promise.all(scripts); await writeFile(file, rewritten);
  }
}
await externalize(output);
let existing = false;
try { await access(target); existing = true; } catch { /* first build */ }
if (existing) { await mkdir(path.dirname(backup), { recursive: true }); await rename(target, backup); }
await cp(output, target, { recursive: true });
console.log('Next.js static export published to app/web/dist; previous output retained under .runtime/frontend-builds.');
