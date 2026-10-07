import { validateDataset } from '../src/model.js';
import { FUTURE_TOLERANCE_MS, withFreshness } from '../src/freshness.js';

function timestamp(value, now) {
  let result;
  if (typeof value === 'number' && Number.isFinite(value)) {
    result = new Date(value * 1000).toISOString();
  } else if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) result = `${value}T00:00:00Z`;
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) result = value;
  }
  const ms = Date.parse(result);
  // Reject invalid calendar days (Date.parse otherwise rolls Feb 30 into March).
  const day = result?.slice(0, 10);
  if (!Number.isFinite(ms) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day || ms > now + FUTURE_TOLERANCE_MS) {
    throw new Error('Malformed provider timestamp');
  }
  return new Date(ms).toISOString();
}

function objectResponse(value, symbol) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || 'error' in value ||
      (value.symbol !== undefined && value.symbol !== symbol)) throw new Error('Malformed provider response');
  return value;
}

function normalizeRecommendation(rows, symbol, now) {
  if (!Array.isArray(rows)) throw new Error('Malformed analyst recommendations');
  const snapshots = rows.map(row => {
    objectResponse(row, symbol);
    const asOf = timestamp(row.period, now);
    const counts = ['strongBuy', 'buy', 'hold', 'sell', 'strongSell'].map(key => row[key]);
    if (!counts.every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Malformed analyst recommendations');
    const analystCount = counts.reduce((sum, count) => sum + count, 0);
    if (!Number.isSafeInteger(analystCount)) throw new Error('Malformed analyst recommendations');
    const score = analystCount ? counts.reduce((sum, count, index) => sum + count * (5 - index), 0) / analystCount : 0;
    const rating = analystCount ? ['strong-sell', 'sell', 'hold', 'buy', 'strong-buy'][Math.ceil(score - 0.5) - 1] : null;
    return { analystCount: analystCount || null, rating, asOf, source: 'Finnhub recommendation trends' };
  });
  return snapshots.sort((a, b) => Date.parse(b.asOf) - Date.parse(a.asOf))[0] ?? null;
}

function normalizeTargets(target, recommendation, symbol, now) {
  objectResponse(target, symbol);
  if (Object.keys(target).length === 0) return null;
  const values = [target.targetLow, target.targetMean, target.targetHigh];
  if (!values.every(value => Number.isFinite(value) && value > 0)) throw new Error('Malformed analyst targets');
  return {
    low: target.targetLow, average: target.targetMean, high: target.targetHigh,
    // Compatibility aliases; the recommendation snapshot owns their provenance.
    analystCount: recommendation?.analystCount ?? null,
    rating: recommendation?.rating ?? null,
    asOf: timestamp(target.lastUpdated, now),
    source: 'Finnhub analyst price target', horizonMonths: 12
  };
}

function retryAfterMs(value, now) {
  if (!value) return 0;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

// Wait for every sibling before releasing the shared batch lock, even on failure.
async function settleAll(promises) {
  const results = await Promise.allSettled(promises);
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  return results.map(result => result.value);
}

export function createMarketDataAdapter({
  picks, apiKey, fetchImpl = fetch, now = Date.now, timeoutMs = 5000,
  cacheTtlMs = 5 * 60_000, retryDelayMs = 250, failureCooldownMs = 60_000,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
}) {
  let cached;
  let inFlight;
  let cooldownUntil = 0;

  async function request(path, symbol) {
    const url = new URL(`https://finnhub.io/api/v1/${path}`);
    url.searchParams.set('symbol', symbol);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (now() < cooldownUntil) throw new Error('Market data provider cooling down');
      let retryable = false;
      try {
        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(timeoutMs), headers: { 'X-Finnhub-Token': apiKey }
        });
        if (!response.ok) {
          const delay = retryAfterMs(response.headers?.get?.('retry-after'), now());
          if (response.status === 429 || delay > 0) {
            cooldownUntil = Math.max(cooldownUntil, now() + Math.max(delay, failureCooldownMs));
          }
          retryable = response.status >= 500 && delay === 0;
          await response.body?.cancel();
          throw new Error(`Finnhub request failed (${response.status})`);
        }
        // Body reads can time out or lose the connection after headers arrive.
        return await response.json();
      } catch (error) {
        const transient = retryable || ['TypeError', 'AbortError', 'TimeoutError'].includes(error.name);
        if (attempt === 0 && transient && now() >= cooldownUntil) {
          await sleep(retryDelayMs);
          continue;
        }
        // Never propagate transport URLs, headers, or credentials into errors.
        throw new Error('Market data provider request failed');
      }
    }
  }

  async function fetchDataset() {
    const result = structuredClone(picks);
    await settleAll(result.picks.map(async pick => {
      const [quote, target, rows] = await settleAll([
        request('quote', pick.symbol), request('stock/price-target', pick.symbol), request('stock/recommendation', pick.symbol)
      ]);
      objectResponse(quote, pick.symbol);
      if (!Number.isFinite(quote.c) || quote.c <= 0 || !Number.isFinite(quote.t) || quote.t <= 0) throw new Error('Malformed Finnhub quote');
      pick.quote = { price: quote.c, asOf: timestamp(quote.t, now()), source: 'Finnhub stock quote' };
      pick.recommendation = normalizeRecommendation(rows, pick.symbol, now());
      pick.analystTargets = normalizeTargets(target, pick.recommendation, pick.symbol, now());
    }));
    result.isDemo = false;
    result.editorialIsDemo = true;
    return validateDataset(result);
  }

  return async function load() {
    if (!apiKey) return null;
    if (cached && now() - cached.fetchedAt < cacheTtlMs) return withFreshness(cached.dataset, now());
    if (inFlight) return inFlight;
    if (now() < cooldownUntil) {
      if (cached) return withFreshness(cached.dataset, now(), true);
      throw new Error('Market data provider cooling down');
    }
    inFlight = (async () => {
      try {
        const dataset = await fetchDataset();
        cached = { dataset, fetchedAt: now() };
        return withFreshness(dataset, now());
      } catch (error) {
        cooldownUntil = Math.max(cooldownUntil, now() + failureCooldownMs);
        if (cached) return withFreshness(cached.dataset, now(), true);
        throw error;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}
