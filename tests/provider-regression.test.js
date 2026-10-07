import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMarketDataAdapter } from '../scripts/market-data.mjs';
import { freshness, withFreshness } from '../src/freshness.js';
import { validateDataset } from '../src/model.js';

const fixture = JSON.parse(await readFile(new URL('../data/picks.json', import.meta.url)));
const T = Date.parse('2026-10-05T12:00:00Z');
const targets = { targetLow: 80, targetMean: 120, targetHigh: 140, lastUpdated: '2026-10-01' };
const recommendation = { period: '2026-10-01', strongBuy: 2, buy: 3, hold: 4, sell: 1, strongSell: 0 };
const reply = (body, status = 200, retryAfter) => ({ ok: status === 200, status, headers: { get: () => retryAfter ?? null }, json: async () => body });
const pathOf = url => new URL(url).pathname.split('/').at(-1);
function setup(overrides = {}) {
  let clock = T;
  const calls = [];
  let handler = async url => reply(pathOf(url) === 'quote' ? { c: 100, t: T / 1000 } : pathOf(url) === 'price-target' ? targets : [recommendation]);
  const load = createMarketDataAdapter({ picks: fixture, apiKey: 'test-secret', now: () => clock, retryDelayMs: 0,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return handler(url, options); }, ...overrides });
  return { load, calls, advance: ms => { clock += ms; }, set: fn => { handler = fn; } };
}

test('provider data preserves explicit sample-research provenance and separates recommendation provenance', async () => {
  const s = setup();
  const d = await s.load();
  assert.equal(d.editorialIsDemo, true);
  assert.deepEqual(d.picks[0].entryZone, fixture.picks[0].entryZone);
  assert.equal(d.picks[0].recommendation.source, 'Finnhub recommendation trends');
  assert.equal(d.picks[0].recommendation.asOf, '2026-10-01T00:00:00.000Z');
  assert.equal(fixture.isDemo, true);
  assert.equal(fixture.picks[0].recommendation, undefined);
  for (const { url, options } of s.calls) {
    assert.equal(url.searchParams.has('token'), false);
    assert.equal(options.headers['X-Finnhub-Token'], 'test-secret');
  }
  assert.ok(!JSON.stringify(d).includes('test-secret'));
  const invalid = structuredClone(d);
  invalid.picks[0].analystTargets.analystCount++;
  assert.throws(() => validateDataset(invalid), /Inconsistent/);
});

test('selects latest recommendation period regardless of order, including absent target coverage', async () => {
  const s = setup();
  s.set(async url => reply(pathOf(url) === 'quote' ? { c: 100, t: T / 1000 } : pathOf(url) === 'price-target' ? {} : [
    { ...recommendation, period: '2025-01-01', strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 10 },
    { ...recommendation, strongBuy: 10, buy: 0, hold: 0, sell: 0 }
  ]));
  const p = (await s.load()).picks[0];
  assert.equal(p.recommendation.rating, 'strong-buy');
  assert.equal(p.recommendation.analystCount, 10);
  assert.equal(p.analystTargets, null);
});

test('recommendation freshness uses its own period and exact ties round toward sell', async () => {
  const s = setup();
  s.set(async url => reply(pathOf(url) === 'quote' ? { c: 100, t: T / 1000 } : pathOf(url) === 'price-target' ? targets : [
    { period: '2025-01-01', strongBuy: 1, buy: 1, hold: 0, sell: 0, strongSell: 0 }
  ]));
  const p = (await s.load()).picks[0];
  assert.equal(p.recommendation.rating, 'buy');
  assert.equal(p.recommendation.freshness, 'stale');
  assert.equal(p.analystTargets.freshness, 'delayed');
});

test('rejects error envelopes, partial/malformed targets, invalid counts, symbols and periods', async () => {
  for (const [endpoint, body] of [
    ['price-target', { error: 'bad' }], ['price-target', []], ['price-target', null],
    ['price-target', { targetLow: 80 }], ['price-target', { ...targets, targetLow: 150 }],
    ['price-target', { ...targets, symbol: 'WRONG' }],
    ['recommendation', { error: 'bad' }], ['recommendation', {}], ['recommendation', [null]],
    ['recommendation', [{ ...recommendation, strongBuy: -1 }]],
    ['recommendation', [{ ...recommendation, period: undefined }]],
    ['recommendation', [{ ...recommendation, symbol: 'WRONG' }]]
  ]) {
    const s = setup();
    s.set(async url => reply(pathOf(url) === endpoint ? body : pathOf(url) === 'quote' ? { c: 100, t: T / 1000 } : pathOf(url) === 'price-target' ? targets : [recommendation]));
    await assert.rejects(s.load(), undefined, `${endpoint}: ${JSON.stringify(body)}`);
  }
});

test('normalizes timezone-bearing timestamps; rejects future, impossible and ambiguous timestamps', async () => {
  for (const value of ['2026-10-01T02:00:00+02:00', '2026-10-01', Date.parse('2026-10-01') / 1000]) {
    const s = setup();
    s.set(async url => reply(pathOf(url) === 'quote' ? { c: 100, t: T / 1000 } : pathOf(url) === 'price-target' ? { ...targets, lastUpdated: value } : []));
    assert.equal((await s.load()).picks[0].analystTargets.asOf, '2026-10-01T00:00:00.000Z');
  }
  for (const value of ['2026-02-30', '2026-10-01 00:00:00', '2027-01-01', 'not-a-date']) {
    const s = setup();
    s.set(async url => reply(pathOf(url) === 'quote' ? { c: 100, t: T / 1000 } : pathOf(url) === 'price-target' ? { ...targets, lastUpdated: value } : []));
    await assert.rejects(s.load(), /timestamp/);
  }
  const future = setup();
  future.set(async url => reply(pathOf(url) === 'quote' ? { c: 100, t: (T + 86400_000) / 1000 } : pathOf(url) === 'price-target' ? targets : []));
  await assert.rejects(future.load(), /timestamp/);
});

test('freshness boundaries and elapsed browser time do not revive stale snapshots', async () => {
  const stamp = age => new Date(T - age).toISOString();
  for (const [age, expected] of [[0,'live'],[900_000,'live'],[900_001,'delayed'],[86400_000,'delayed'],[86400_001,'stale']]) {
    assert.equal(freshness(stamp(age), T), expected);
  }
  assert.equal(freshness(stamp(30 * 86400_000), T, 'target'), 'delayed');
  assert.equal(freshness(stamp(30 * 86400_000 + 1), T, 'target'), 'stale');
  assert.equal(freshness(stamp(-86400_000), T), 'stale');
  const d = await setup().load();
  assert.equal(withFreshness(d, T + 900_001).picks[0].quote.freshness, 'delayed');
  assert.equal(withFreshness(d, T + 86400_001).picks[0].quote.freshness, 'stale');
  const failed = withFreshness(d, T, true);
  assert.equal(withFreshness(failed, T + 1).picks[0].quote.freshness, 'stale');
});

test('coalesces concurrent loads, expires cache, preserves stale data and recovers after cooldown', async () => {
  const s = setup();
  await Promise.all([s.load(), s.load(), s.load()]);
  assert.equal(s.calls.length, 15);
  s.advance(299_999); await s.load(); assert.equal(s.calls.length, 15);
  s.advance(1);
  s.set(async () => reply({}, 503));
  const stale = await s.load();
  assert.equal(s.calls.length, 45);
  assert.equal(stale.picks[0].quote.freshness, 'stale');
  assert.equal(stale.picks[0].recommendation.freshness, 'stale');
  await s.load(); await s.load(); assert.equal(s.calls.length, 45);
  s.advance(60_000);
  s.set(async url => reply(pathOf(url) === 'quote' ? { c: 110, t: (T + 360_000) / 1000 } : pathOf(url) === 'price-target' ? targets : []));
  assert.equal((await s.load()).picks[0].quote.price, 110);
  assert.equal(s.calls.length, 60);
});

test('honors delta-seconds and HTTP-date Retry-After across callers without waiting early', async () => {
  for (const header of ['120', new Date(T + 120_000).toUTCString(), undefined]) {
    const s = setup(); s.set(async () => reply({}, 429, header));
    await assert.rejects(s.load());
    assert.equal(s.calls.length, 15);
    s.advance(59_999); await assert.rejects(s.load()); assert.equal(s.calls.length, 15);
    if (header) { s.advance(60_000); await assert.rejects(s.load()); assert.equal(s.calls.length, 15); }
    s.advance(1); await assert.rejects(s.load()); assert.equal(s.calls.length, 30);
  }
});

test('failed batches retain the shared lock until pending siblings drain', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const s = setup();
  s.set(async url => pathOf(url) === 'quote' ? reply({}, 401) : (await pending, reply({})));
  const first = s.load();
  await new Promise(resolve => setImmediate(resolve));
  const second = s.load();
  assert.equal(s.calls.length, 15);
  release();
  const results = await Promise.allSettled([first, second]);
  assert.ok(results.every(r => r.status === 'rejected'));
  await assert.rejects(s.load());
  assert.equal(s.calls.length, 15);
});

test('retries transport and body failures once; never retries invalid JSON or authorization failures', async () => {
  for (const failure of ['network', 'body', 'timeout', 'json', '401', '503']) {
    const s = setup();
    s.set(async () => {
      if (failure === 'network') throw new TypeError('transport secret');
      if (failure === 'timeout') throw new DOMException('timeout', 'TimeoutError');
      if (failure === 'body') return { ...reply({}), json: async () => { throw new TypeError('body secret'); } };
      if (failure === 'json') return { ...reply({}), json: async () => { throw new SyntaxError('invalid'); } };
      return reply({}, Number(failure));
    });
    await assert.rejects(s.load(), /Market data provider request failed/);
    assert.equal(s.calls.length, ['json', '401'].includes(failure) ? 15 : 30);
    await assert.rejects(s.load());
    assert.equal(s.calls.length, ['json', '401'].includes(failure) ? 15 : 30);
  }
});

test('recovers on second attempt from interrupted body reads', async () => {
  const attempts = new Map();
  const s = setup();
  s.set(async url => {
    const key = url.href; attempts.set(key, (attempts.get(key) ?? 0) + 1);
    if (attempts.get(key) === 1) return { ...reply({}), json: async () => { throw new TypeError('body interrupted'); } };
    return reply(pathOf(url) === 'quote' ? { c: 100, t: T / 1000 } : pathOf(url) === 'price-target' ? targets : []);
  });
  assert.equal((await s.load()).isDemo, false);
  assert.equal(s.calls.length, 30);
});

test('AbortSignal bounds hanging body reads and uses a new signal for the retry', async () => {
  const s = setup({ timeoutMs: 10 });
  s.set(async (url, { signal }) => ({ ...reply({}), json: () => new Promise((resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }) }));
  // Native timeout signals are unref'ed; keep the event loop alive for the test.
  const keepAlive = setInterval(() => {}, 1000);
  try { await assert.rejects(s.load()); } finally { clearInterval(keepAlive); }
  assert.equal(s.calls.length, 30);
  assert.notEqual(s.calls[0].options.signal, s.calls[15].options.signal);
});
