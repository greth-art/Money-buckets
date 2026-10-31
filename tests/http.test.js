import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createAppServer } from '../scripts/serve.mjs';
import { loadPicks } from '../src/repository.js';
const demo = JSON.parse(await readFile(new URL('../data/picks.json', import.meta.url)));
async function start(t, options) {
  const server = await createAppServer(options);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('HTTP demo route, HEAD, public assets, method restrictions and secret exclusion', async t => {
  const base = await start(t, { fetchImpl: () => assert.fail('no provider in demo mode') });
  const api = await fetch(`${base}/api/picks`);
  assert.equal(api.status, 200);
  assert.equal(api.headers.get('cache-control'), 'no-store');
  assert.equal((await api.json()).isDemo, true);
  const head = await fetch(`${base}/api/picks`, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  for (const path of ['/.env', '/.env.example', '/scripts/market-data.mjs', '/.git/config', '/data/%2e%2e%2f.env']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  for (const path of ['/', '/src/app.js', '/src/freshness.js', '/data/picks.json']) {
    assert.equal((await fetch(base + path)).status, 200, path);
  }
  assert.equal((await fetch(`${base}/api/picks`, { method: 'POST' })).status, 405);
});

test('HTTP errors conceal API credentials and provider details; repeated callers honor cooldown', async t => {
  let calls = 0;
  const base = await start(t, { apiKey: 'server-only-secret', fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url.searchParams.has('token'), false);
    assert.equal(options.headers['X-Finnhub-Token'], 'server-only-secret');
    throw new Error('sensitive URL server-only-secret');
  } });
  for (let i = 0; i < 3; i++) {
    const response = await fetch(`${base}/api/picks`);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Market data provider unavailable' });
  }
  assert.equal(calls, 15);
});

test('repository falls back only for missing API, validates fallback, and surfaces provider failures', async () => {
  let paths = [];
  const result = await loadPicks(async url => {
    paths.push(url.pathname);
    return url.pathname.endsWith('/api/picks') ? { status: 404 } : { ok: true, json: async () => demo };
  });
  assert.equal(result.isDemo, true); assert.equal(paths.length, 2);
  paths = [];
  await assert.rejects(loadPicks(async url => { paths.push(url); return { ok: false, status: 502 }; }), /502/);
  assert.equal(paths.length, 1);
  await assert.rejects(loadPicks(async url => url.pathname.endsWith('/api/picks') ? { status: 404 } : { ok: true, json: async () => ({ ...demo, schemaVersion: 9 }) }), /Unsupported/);
  await assert.rejects(loadPicks(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('invalid JSON'); } })), /invalid JSON/);
});
