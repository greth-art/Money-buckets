import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMarketDataAdapter } from '../scripts/market-data.mjs';

const demo = JSON.parse(await readFile(new URL('../data/picks.json', import.meta.url), 'utf8'));
const now = Date.parse('2026-10-05T12:00:00Z');
const response = (body, status = 200, headers) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: key => headers?.[key] ?? null },
  json: async () => body
});

function providerFetch({ quoteTime = now, targetTime = '2026-10-01', noTargets = false, recommendation = true } = {}) {
  return async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/quote')) return response({ c: 100, t: quoteTime / 1000 });
    if (url.pathname.endsWith('/price-target')) return response(noTargets ? {} : {
      targetLow: 80, targetMean: 120, targetHigh: 140, lastUpdated: targetTime
    });
    if (!recommendation) return response([]);
    return response([{ strongBuy: 2, buy: 3, hold: 4, sell: 1, strongSell: 0 }]);
  };
}

test('normalizes provider quotes and analyst snapshots with provenance and freshness', async () => {
  const load = createMarketDataAdapter({ picks: demo, apiKey: 'test', fetchImpl: providerFetch(), now: () => now });
  const result = await load();
  assert.equal(result.isDemo, false);
  assert.equal(result.picks[0].quote.source, 'Finnhub stock quote');
  assert.equal(result.picks[0].quote.freshness, 'live');
  assert.equal(result.picks[0].analystTargets.source, 'Finnhub analyst price target');
  assert.equal(result.picks[0].analystTargets.analystCount, 10);
  assert.equal(result.picks[0].analystTargets.rating, 'buy');
  assert.equal(result.picks[0].analystTargets.freshness, 'delayed');
});

test('preserves missing targets and unknown recommendation coverage as null', async () => {
  const missing = createMarketDataAdapter({
    picks: demo, apiKey: 'test', fetchImpl: providerFetch({ noTargets: true }), now: () => now
  });
  assert.equal((await missing()).picks[0].analystTargets, null);

  const unknown = createMarketDataAdapter({
    picks: demo, apiKey: 'test', fetchImpl: providerFetch({ recommendation: false }), now: () => now
  });
  const targets = (await unknown()).picks[0].analystTargets;
  assert.equal(targets.analystCount, null);
  assert.equal(targets.rating, null);
});

test('marks old quote and target snapshots stale', async () => {
  const load = createMarketDataAdapter({
    picks: demo,
    apiKey: 'test',
    fetchImpl: providerFetch({ quoteTime: now - 2 * 24 * 60 * 60_000, targetTime: '2026-08-01' }),
    now: () => now
  });
  const pick = (await load()).picks[0];
  assert.equal(pick.quote.freshness, 'stale');
  assert.equal(pick.analystTargets.freshness, 'stale');
});

test('rejects malformed provider quotes', async () => {
  const load = createMarketDataAdapter({
    picks: demo, apiKey: 'test', fetchImpl: async input =>
      new URL(input).pathname.endsWith('/quote') ? response({ c: 0, t: now / 1000 }) : response({})
  });
  await assert.rejects(load(), /Malformed Finnhub quote/);
});

test('retries a rate-limited request once, then fails cleanly if still limited', async () => {
  const attempts = new Map();
  const load = createMarketDataAdapter({
    picks: demo,
    apiKey: 'test',
    retryDelayMs: 0,
    fetchImpl: async input => {
      const url = new URL(input);
      const key = `${url.pathname}:${url.searchParams.get('symbol')}`;
      attempts.set(key, (attempts.get(key) || 0) + 1);
      return response({}, 429);
    }
  });
  await assert.rejects(load(), /Finnhub request failed \(429\)/);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(attempts.get('/api/v1/quote:MSFT'), 2);
  assert.ok([...attempts.values()].every(count => count <= 2));
});

test('does not contact the provider or require credentials in demo mode', async () => {
  const load = createMarketDataAdapter({
    picks: demo,
    fetchImpl: async () => assert.fail('Provider must not be called without an API key')
  });
  assert.equal(await load(), null);
});
