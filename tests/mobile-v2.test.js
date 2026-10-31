import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createAppServer } from '../scripts/serve.mjs';
import { createMarketDataAdapter } from '../scripts/market-data.mjs';
import { loadPicks } from '../src/repository.js';

const demo = JSON.parse(await readFile(new URL('../data/picks.json', import.meta.url), 'utf8'));
const startAt = Date.parse('2026-10-05T12:00:00Z');

test('Money Buckets 2 assets render from an isolated route without exposing secrets', async t => {
  const server = await createAppServer({ fetchImpl: () => assert.fail('Must not use provider in demo mode') });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const [path, type] of [
    ['/mobile-v2/', 'text/html'], ['/mobile-v2', 'text/html'],
    ['/mobile-v2/index.html', 'text/html'],
    ['/mobile-v2/app.js', 'text/javascript'],
    ['/mobile-v2/styles.css', 'text/css'],
    ['/mobile-v2/manifest.webmanifest', 'application/manifest+json'],
    ['/mobile-v2/icon.svg', 'image/svg+xml']
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.ok(response.headers.get('content-type')?.startsWith(type), path);
  }
  for (const path of ['/mobile-v2/.env', '/mobile-v2/../scripts/serve.mjs', '/.env', '/scripts/market-data.mjs']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  const page = await (await fetch(base + '/mobile-v2/')).text();
  assert.match(page, /viewport-fit=cover/);
  assert.match(page, /aria-label="Refresh all stock data"/);
  assert.match(page, /role="group" aria-label="Filter by stock bucket"/);
  assert.match(page, /SPXL \/ SPXS \/ Cash/);
  const stylesheet = await (await fetch(base + '/mobile-v2/styles.css')).text();
  assert.match(stylesheet, /@media\(max-width:680px\)/);
  assert.match(stylesheet, /:focus-visible/);
  assert.equal((await (await fetch(base + '/api/picks?refresh=1')).json()).isDemo, true);
});

test('force option tags refresh requests and preserves demo fallback', async () => {
  let apiURL;
  const result = await loadPicks(async url => {
    if (url.pathname.endsWith('/api/picks')) {
      apiURL = url;
      return { status: 404 };
    }
    return { ok: true, json: async () => demo };
  }, { force: true });
  assert.equal(result.isDemo, true);
  assert.equal(apiURL.searchParams.get('refresh'), '1');
});

test('manual refresh skips regular TTL only after conservative 60-second throttle', async () => {
  let time = startAt;
  let requests = 0;
  const provider = async input => {
    requests += 1;
    const endpoint = new URL(input).pathname;
    return {
      ok: true,
      json: async () => endpoint.endsWith('/quote') ? { c: 100, t: time / 1000 }
        : endpoint.endsWith('/price-target') ? {} : []
    };
  };
  const load = createMarketDataAdapter({
    picks: demo, apiKey: 'not-a-real-key', fetchImpl: provider,
    now: () => time
  });
  await load();
  assert.equal(requests, 15);
  time += 59_999;
  await load({ force: true });
  assert.equal(requests, 15);
  time += 1;
  await load({ force: true });
  assert.equal(requests, 30);
  time += 30_000;
  await load();
  assert.equal(requests, 30);
  await load({ force: true });
  assert.equal(requests, 30);
  time += 30_000;
  await load({ force: true });
  assert.equal(requests, 45);
});

test('mobile app script has valid JavaScript syntax for its module entry', () => {
  const path = fileURLToPath(new URL('../mobile-v2/app.js', import.meta.url));
  assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', path]));
});

test('separate beta startup serves mobile v2 at root while sharing secured API', async t => {
  const server = await createAppServer({ appVariant: 'mobile-v2' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const home = await (await fetch(base + '/')).text();
  assert.match(home, /Money Buckets 2/);
  assert.match(home, /mobile-first stock research/i);
  const legacy = await (await fetch(base + '/index.html')).text();
  assert.match(legacy, /Money Buckets 2/);
  for (const path of ['/app.js', '/styles.css', '/icon.svg', '/manifest.webmanifest']) {
    assert.equal((await fetch(base + path)).status, 200, path);
  }
  const prices = await (await fetch(base + '/api/picks')).json();
  assert.equal(prices.isDemo, true);
  await assert.rejects(createAppServer({ appVariant: 'untrusted' }), /Invalid app variant/);
});
