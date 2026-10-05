import { validateDataset } from '../src/model.js';

const quoteFreshness = (asOf, now) => {
  const age = now - Date.parse(asOf);
  return age <= 15 * 60_000 ? 'live' : age <= 24 * 60 * 60_000 ? 'delayed' : 'stale';
};

const targetFreshness = (asOf, now) =>
  now - Date.parse(asOf) <= 30 * 24 * 60 * 60_000 ? 'delayed' : 'stale';

function timestamp(value) {
  const result = typeof value === 'number'
    ? new Date(value * 1000).toISOString()
    : /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  if (typeof result !== 'string' || !Number.isFinite(Date.parse(result))) throw new Error('Malformed provider timestamp');
  return result;
}

function recommendationSummary(rows) {
  if (!Array.isArray(rows) || !rows.length) return { analystCount: null, rating: null };
  const latest = rows[0];
  const counts = ['strongBuy', 'buy', 'hold', 'sell', 'strongSell'].map(key => latest[key]);
  if (!counts.every(value => Number.isInteger(value) && value >= 0)) throw new Error('Malformed analyst recommendations');
  const analystCount = counts.reduce((sum, count) => sum + count, 0);
  if (!analystCount) return { analystCount: null, rating: null };
  const score = counts.reduce((sum, count, index) => sum + count * (5 - index), 0) / analystCount;
  const rating = ['strong-sell', 'sell', 'hold', 'buy', 'strong-buy']
    .reduce((best, candidate) => Math.abs(['strong-sell', 'sell', 'hold', 'buy', 'strong-buy'].indexOf(candidate) + 1 - score) <
      Math.abs(['strong-sell', 'sell', 'hold', 'buy', 'strong-buy'].indexOf(best) + 1 - score) ? candidate : best, 'strong-sell');
  return { analystCount, rating };
}

function normalizeTargets(target, recommendations) {
  const values = [target?.targetLow, target?.targetMean, target?.targetHigh];
  if (values.every(value => value === undefined || value === null)) return null;
  if (!values.every(value => Number.isFinite(value) && value > 0) || !target.lastUpdated) throw new Error('Malformed analyst targets');
  const { analystCount, rating } = recommendationSummary(recommendations);
  return {
    low: target.targetLow,
    average: target.targetMean,
    high: target.targetHigh,
    analystCount,
    rating,
    asOf: timestamp(target.lastUpdated),
    source: 'Finnhub analyst price target',
    horizonMonths: 12
  };
}

function withFreshness(dataset, now, forceStale = false) {
  const result = structuredClone(dataset);
  for (const pick of result.picks) {
    pick.quote.freshness = forceStale ? 'stale' : quoteFreshness(pick.quote.asOf, now);
    if (pick.analystTargets) {
      pick.analystTargets.freshness = forceStale ? 'stale' : targetFreshness(pick.analystTargets.asOf, now);
    }
  }
  return validateDataset(result);
}

export function createMarketDataAdapter({
  picks,
  apiKey,
  fetchImpl = fetch,
  now = Date.now,
  timeoutMs = 5000,
  cacheTtlMs = 5 * 60_000,
  retryDelayMs = 250
}) {
  let cached;
  let inFlight;

  async function request(path, symbol) {
    const url = new URL(`https://finnhub.io/api/v1/${path}`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('token', apiKey);
    for (let attempt = 0; ; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        if (attempt < 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          continue;
        }
        throw error;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 1) {
        const retryAfter = Number(response.headers?.get?.('retry-after'));
        await new Promise(resolve => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 1000) : retryDelayMs));
        continue;
      }
      if (!response.ok) throw new Error(`Finnhub request failed (${response.status})`);
      return response.json();
    }
  }

  async function fetchDataset() {
    const result = structuredClone(picks);
    await Promise.all(result.picks.map(async pick => {
      const [quote, target, recommendations] = await Promise.all([
        request('quote', pick.symbol),
        request('stock/price-target', pick.symbol),
        request('stock/recommendation', pick.symbol)
      ]);
      if (!Number.isFinite(quote?.c) || quote.c <= 0 || !Number.isFinite(quote?.t) || quote.t <= 0) {
        throw new Error('Malformed Finnhub quote');
      }
      pick.quote = {
        price: quote.c,
        asOf: timestamp(quote.t),
        source: 'Finnhub stock quote'
      };
      pick.analystTargets = normalizeTargets(target, recommendations);
    }));
    result.isDemo = false;
    return validateDataset(result);
  }

  return async function load() {
    if (!apiKey) return null;
    const currentTime = now();
    if (cached && currentTime - cached.fetchedAt < cacheTtlMs) {
      return withFreshness(cached.dataset, currentTime);
    }
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const dataset = await fetchDataset();
        cached = { dataset, fetchedAt: now() };
        return withFreshness(dataset, now());
      } catch (error) {
        if (cached) return withFreshness(cached.dataset, now(), true);
        throw error;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}
