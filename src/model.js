/**
 * @typedef {'core'|'growth'|'speculative'} Bucket
 * @typedef {'strong-buy'|'buy'|'hold'|'sell'|'strong-sell'} Rating
 * @typedef {{price:number, asOf:string, source:string, freshness?:'live'|'delayed'|'stale'}} Quote
 * @typedef {{low:number, average:number, high:number, analystCount:number|null, rating:Rating|null, asOf:string, source:string, horizonMonths:number, freshness?:'live'|'delayed'|'stale'}} AnalystTargets
 * @typedef {{id:string, rank:number, symbol:string, companyName:string, currency:'USD', bucket:Bucket, entryZone:{low:number,high:number}, quote:Quote, analystTargets:AnalystTargets|null, thesis:string, risks:string[], updatedAt:string}} StockPick
 */
const positive = value => Number.isFinite(value) && value > 0;
const date = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const text = value => typeof value === 'string' && value.trim().length > 0;
export function validateDataset(data) {
  if (data?.schemaVersion !== 1 || typeof data.isDemo !== 'boolean' || !Array.isArray(data.picks)) throw new Error('Unsupported dataset');
  const ids = new Set(), ranks = new Set();
  for (const p of data.picks) {
    if (!p || ![p.id,p.symbol,p.companyName,p.thesis].every(text) || ids.has(p.id) || !Number.isInteger(p.rank) || p.rank < 1 || ranks.has(p.rank) || p.currency !== 'USD' || !['core','growth','speculative'].includes(p.bucket) || !date(p.updatedAt)) throw new Error('Invalid pick identity');
    if (!positive(p.quote?.price) || !date(p.quote.asOf) || !text(p.quote.source) || (p.quote.freshness !== undefined && !['live','delayed','stale'].includes(p.quote.freshness)) || !positive(p.entryZone?.low) || !positive(p.entryZone.high) || p.entryZone.low > p.entryZone.high || !Array.isArray(p.risks) || !p.risks.length || !p.risks.every(text)) throw new Error('Invalid quote, entry zone, or risks');
    const a = p.analystTargets;
    if (a !== null && (!a || ![a.low,a.average,a.high].every(positive) || a.low > a.average || a.average > a.high || (a.analystCount !== null && (!Number.isInteger(a.analystCount) || a.analystCount < 1)) || !Number.isInteger(a.horizonMonths) || a.horizonMonths < 1 || (a.rating !== null && !['strong-buy','buy','hold','sell','strong-sell'].includes(a.rating)) || !date(a.asOf) || !text(a.source) || (a.freshness !== undefined && !['live','delayed','stale'].includes(a.freshness)))) throw new Error('Invalid analyst targets');
    ids.add(p.id); ranks.add(p.rank);
  }
  return data;
}
export function upsidePercent(pick) {
  return pick.analystTargets ? (pick.analystTargets.average / pick.quote.price - 1) * 100 : null;
}
export function selectPicks(picks, {query = '', bucket = 'all', sort = 'rank'} = {}) {
  const q = query.trim().toLowerCase();
  return picks.filter(p => (bucket === 'all' || p.bucket === bucket) && `${p.symbol} ${p.companyName}`.toLowerCase().includes(q)).sort((a,b) => sort === 'symbol' ? a.symbol.localeCompare(b.symbol) : sort === 'upside' ? (upsidePercent(b) ?? -Infinity) - (upsidePercent(a) ?? -Infinity) || a.rank - b.rank : a.rank - b.rank);
}
