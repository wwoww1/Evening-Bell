import assert from 'node:assert/strict';
import { initialState, exampleState } from '../lib/model.ts';
import { createAnnaStateStore } from '../lib/anna-storage.ts';

// Use ONLY with the disposable local harness started for this check.
const base = process.env.ANNA_SMOKE_URL || 'http://localhost:5180';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname))
  throw new Error('ANNA smoke tests must target a local development harness.');
async function post(path, body) {
  const response = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  return response.json();
}
const configResponse = await fetch(base + '/api/config');
assert.equal(configResponse.status, 200);
const config = await configResponse.json();
const entry = new URL(config.bundle_base, base);
const page = await fetch(entry);
assert.equal(page.status, 200);
const html = await page.text();
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  const asset = new URL(match[1], entry);
  assert.equal(
    (await fetch(asset)).status,
    200,
    'ANNA asset must load: ' + asset.pathname,
  );
}
const sdk = await fetch(base + '/static/anna-apps/_sdk/latest/index.js');
assert.equal(sdk.status, 200);
assert.match(await sdk.text(), /AnnaAppRuntime/);
const session = await post('/api/session/create', {});
assert.equal(typeof session.session_id, 'string');
async function rpc(ns, method, args = {}) {
  const reply = await post('/api/session/call', {
    session_id: session.session_id,
    ns,
    method,
    args,
  });
  if (reply.ok === false || reply.error)
    throw Object.assign(new Error(reply.error?.message || 'RPC failed'), {
      code: reply.error?.code,
    });
  return reply.result ?? reply;
}
const hello = await rpc('window', 'hello');
assert.ok(hello.capabilities.scopes.includes('llm.complete'));
assert.ok(hello.capabilities.scopes.includes('storage.get'));
assert.ok(hello.capabilities.scopes.includes('storage.set'));
assert.deepEqual(config.executas, []);
const store = createAnnaStateStore(
  {
    get: (args) => rpc('storage', 'get', args),
    set: (args) => rpc('storage', 'set', args),
  },
  () => {},
);
await store.refresh();
const sample = exampleState(initialState(), 'en');
await store.update(() => sample);
await store.refresh();
assert.deepEqual(store.read(), sample);
await rpc('storage', 'set', { key: 'evening-bell.language', value: 'zh-CN' });
assert.equal(
  (await rpc('storage', 'get', { key: 'evening-bell.language' })).value,
  'zh-CN',
);
await assert.rejects(
  rpc('storage', 'delete', { key: 'evening-bell.language' }),
);
console.log(
  'ANNA smoke passed: HTML/assets/SDK, window handshake, declared grants, record save/reload, language storage, denied undeclared permission. No model request made.',
);
