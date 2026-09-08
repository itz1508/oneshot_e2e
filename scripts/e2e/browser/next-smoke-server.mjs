// Real HTTP/intent/review/validation/Sandbox integration with the repository's
// fixture research provider. This is a test harness, not live provider proof.
// Build first: npm run build:test && npm run build:ui
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { harness } from '../../../dist/backend/tests/ts/harness.js';
import { startHttpServer } from '../../../dist/backend/server/http-server.js';
import { ConversationStore } from '../../../dist/backend/intent/conversation-store.js';
import { IntentCollectionService } from '../../../dist/backend/intent/intent-collection.js';
import { HardenedProcessRunner } from '../../../dist/backend/sandbox/runner/process-runner.js';

const name = `next-browser-${Date.now()}`;
const target = resolve('.runtime', name, 'inventory');
await mkdir(resolve(target, 'notes'), { recursive: true });
await writeFile(resolve(target, 'README.md'), '# Inventory browser integration target\n\nA real temporary file for the Next.js browser walkthrough.\n');
await writeFile(resolve(target, 'notes/requirements.md'), 'Inventory list, stock filtering, and CSV export.\n');
process.env.ONESHOT_WORKSPACE_ROOT = target;
const h = await harness(name, undefined, new HardenedProcessRunner());
const intent = new IntentCollectionService(new ConversationStore(resolve('.runtime', name, 'conversations')));
const server = await startHttpServer(h.runtime, h.runs, h.events, resolve('app/web/dist'), 0, h.task, intent, h.sandbox, { mode: 'test', provider: 'fixture' }, { workspaceRoot: target });
const address = server.address();
const base = `http://127.0.0.1:${address.port}`;
await writeFile(resolve('.runtime/next-smoke-server.json'), JSON.stringify({ base, name, target }));
console.log(`NEXT_BROWSER_TEST_SERVER=${base}`);
process.on('SIGINT', () => { server.closeAllConnections(); server.close(); h.close(); process.exit(0); });
