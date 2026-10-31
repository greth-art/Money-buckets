import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMarketDataAdapter } from '../scripts/market-data.mjs';

// Minimal DOM contract for behavior tests; no layout or browser-engine claims.
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.events = {}; this.value = ''; this.open = false; }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return (this.text ?? '') + this.children.map(n => n.textContent).join(''); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.text = ''; this.children = nodes; }
  addEventListener(event, fn) { this.events[event] = fn; }
  querySelectorAll(tag) { return this.children.flatMap(n => [...(n.tag === tag ? [n] : []), ...n.querySelectorAll(tag)]); }
  querySelector(tag) { return this.querySelectorAll(tag)[0]; }
}

test('dashboard labels sample research, ages open-tab data, refreshes on visibility and retains stale data on failure', async t => {
  let clock = Date.parse('2026-10-05T12:00:00Z');
  t.mock.method(Date, 'now', () => clock);
  const timers = new Map();
  t.mock.method(globalThis, 'setInterval', (fn, ms) => { timers.set(ms, fn); return ms; });
  const nodes = Object.fromEntries(['mode', 'notice', 'picks', 'status', 'retry', 'search', 'bucket', 'sort'].map(id => [id, new Element('div')]));
  nodes.bucket.value = 'all'; nodes.sort.value = 'rank';
  const events = {};
  globalThis.document = { hidden: false, getElementById: id => nodes[id], createElement: tag => new Element(tag),
    createTextNode: text => { const node = new Element('#text'); node.textContent = text; return node; },
    addEventListener: (event, fn) => { events[event] = fn; } };
  t.after(() => { delete globalThis.document; });
  const demo = JSON.parse(await readFile(new URL('../data/picks.json', import.meta.url)));
  const load = createMarketDataAdapter({ picks: demo, apiKey: 'dummy', fetchImpl: async url => ({ ok: true, json: async () =>
    url.pathname.endsWith('/quote') ? { c: 100, t: clock / 1000 } : url.pathname.endsWith('/price-target') ? {} : [] }) });
  let data = await load(); let fails = false; let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; if (fails) throw new TypeError('offline'); return { ok: true, status: 200, json: async () => structuredClone(data) }; });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await import('../src/app.js'); await flush();
  assert.match(nodes.mode.textContent, /SAMPLE RESEARCH/);
  assert.match(nodes.notice.textContent, /entry zones.*illustrative/);
  assert.match(nodes.picks.textContent, /Entry zone · ILLUSTRATIVE/);
  assert.match(nodes.picks.textContent, /Quote · LIVE/);
  nodes.picks.querySelector('details').open = true;
  clock += 900_001; timers.get(30_000)();
  assert.match(nodes.picks.textContent, /Quote · DELAYED/);
  assert.equal(nodes.picks.querySelector('details').open, true);
  assert.equal(calls, 1);
  fails = true; timers.get(300_000)(); await flush();
  assert.match(nodes.picks.textContent, /Quote · STALE/);
  assert.equal(nodes.retry.hidden, false);
  timers.get(30_000)(); assert.match(nodes.picks.textContent, /Quote · STALE/);
  document.hidden = true; timers.get(300_000)(); assert.equal(calls, 2);
  fails = false; data = await load();
  document.hidden = false; events.visibilitychange(); await flush();
  assert.equal(calls, 3); assert.match(nodes.picks.textContent, /Quote · LIVE/);
  assert.equal(nodes.retry.hidden, true);
  nodes.search.value = 'MSFT'; nodes.search.events.input();
  assert.equal(nodes.picks.querySelectorAll('article').length, 1);
});
