import { loadPicks } from '../src/repository.js';
import { selectPicks, upsidePercent } from '../src/model.js';
import { withFreshness } from '../src/freshness.js';

const $ = id => document.getElementById(id);
const currency = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
const dateTime = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const timeOnly = value => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const make = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
};
const field = (parent, title, value) => {
  const cell = make('div');
  cell.append(make('small', title), make('strong', value));
  parent.append(cell);
};
const para = (parent, text) => parent.append(make('p', text));

let dataset = null;
let bucket = 'all';
let loading = false;
let refreshError = false;
let lastChecked = null;

function renderCard(p, expanded) {
  const article = make('article', undefined, 'pick-card');
  article.dataset.pickId = p.id;
  const header = make('div', undefined, 'card-top');
  const heading = make('div');
  const ticker = make('h3', p.symbol, 'ticker');
  ticker.style.margin = '0';
  heading.append(ticker, make('div', p.companyName, 'company'));
  header.append(make('span', '#' + p.rank, 'rank'), heading, make('span', p.bucket, 'category ' + p.bucket));
  article.append(header, make('hr', undefined, 'card-divider'));

  const quote = make('div', undefined, 'price-row');
  const price = make('div');
  price.append(make('div', dataset.isDemo ? 'SAMPLE PRICE' : 'LATEST QUOTE', 'metric-label'), make('div', currency(p.quote.price), 'price-main'));
  const quality = dataset.isDemo ? 'SAMPLE' : (p.quote.freshness || 'stale').toUpperCase();
  price.append(make('span', quality, 'freshness ' + (dataset.isDemo ? 'demo' : quality.toLowerCase())));
  const upside = make('div', undefined, 'upside');
  const gain = upsidePercent(p);
  const gainText = gain === null ? 'N/A' : (gain > 0 ? '+' : '') + gain.toFixed(1) + '%';
  const gainClass = gain === null ? 'unknown' : gain < 0 ? 'negative' : '';
  upside.append(make('div', 'TARGET UPSIDE', 'metric-label'), make('div', gainText, 'upside-value ' + gainClass));
  quote.append(price, upside);
  article.append(quote);

  const a = p.analystTargets;
  const strip = make('div', undefined, 'target-strip');
  field(strip, 'TARGET LOW', a ? currency(a.low) : 'N/A');
  field(strip, 'TARGET AVG', a ? currency(a.average) : 'N/A');
  field(strip, 'TARGET HIGH', a ? currency(a.high) : 'N/A');
  article.append(strip);
  const ratingSource = dataset.isDemo ? a : p.recommendation;
  const rating = ratingSource?.rating?.replaceAll('-', ' ') || 'Not reported';
  const analystCount = ratingSource?.analystCount;
  const support = make('div', undefined, 'support-row');
  const analyst = make('span');
  analyst.append(make('span', 'Analyst ratings: '), make('strong', analystCount ?? 'N/A'));
  const consensus = make('span');
  consensus.append(make('span', 'Consensus: '), make('strong', rating));
  support.append(analyst, consensus);
  article.append(support);

  const details = make('details');
  details.open = expanded;
  details.append(make('summary', 'Research details & sources'));
  const body = make('div', undefined, 'detail-content');
  para(body, p.thesis);
  body.append(make('h3', 'Entry range'));
  para(body, currency(p.entryZone.low) + ' – ' + currency(p.entryZone.high) +
    (dataset.editorialIsDemo || dataset.isDemo ? ' · illustrative, not a verified entry recommendation' : ''));
  body.append(make('h3', 'Data timestamps'));
  para(body, 'Quote: ' + p.quote.source + ' · ' + dateTime(p.quote.asOf));
  if (a) para(body, 'Price targets: ' + a.source + ' · ' + dateTime(a.asOf) +
    (a.freshness ? ' · ' + a.freshness.toUpperCase() : '') + ' · ' + a.horizonMonths + '-month horizon');
  else para(body, 'Price targets: not available from this provider/account.');
  if (!dataset.isDemo && p.recommendation) para(body, 'Analyst recommendations: ' + p.recommendation.source + ' · ' +
    dateTime(p.recommendation.asOf) + ' · ' + (p.recommendation.freshness || 'stale').toUpperCase());
  else if (!dataset.isDemo) para(body, 'Analyst recommendations: not available from this provider/account.');
  para(body, 'Research ranking last edited: ' + dateTime(p.updatedAt) + '. Analyst rating counts are not the number of contributors to price targets.');
  body.append(make('h3', 'Risks to consider'));
  const ul = make('ul');
  for (const risk of p.risks) ul.append(make('li', risk));
  body.append(ul);
  details.append(body);
  article.append(details);
  return article;
}

function setSummary() {
  if (!dataset) return;
  const quotes = dataset.picks.map(p => p.quote.freshness || 'stale');
  $('tracked').textContent = String(dataset.picks.length).padStart(2, '0');
  if (dataset.isDemo) {
    $('mode').textContent = 'SAMPLE MODE';
    $('mode').className = 'mode-pill';
    $('quote-status').textContent = 'Demo only';
    $('quote-foot').textContent = 'Prices are fictional';
    $('notice').textContent = 'All prices, analyst targets, and rankings are illustrative. Connect a licensed market-data provider to view validated prices.';
  } else {
    $('mode').textContent = 'PROVIDER DATA';
    $('mode').className = 'mode-pill provider';
    const live = quotes.filter(q => q === 'live').length;
    const delayed = quotes.filter(q => q === 'delayed').length;
    const stale = quotes.filter(q => q === 'stale').length;
    $('quote-status').textContent = stale ? stale + ' stale' : delayed ? delayed + ' delayed' : live + ' current';
    $('quote-foot').textContent = live + ' recent · ' + delayed + ' delayed · ' + stale + ' stale';
    $('notice').textContent = 'Provider quotes and analyst snapshots can be delayed or incomplete. Rankings, entry zones, and research notes remain illustrative and are not personalized investment advice.';
  }
  if (lastChecked) {
    $('last-checked').textContent = timeOnly(lastChecked);
    $('last-foot').textContent = dateTime(lastChecked);
  }
}

function render() {
  if (!dataset) return;
  const focused = document.activeElement;
  const focusedSummary = focused?.tagName === 'SUMMARY' ? focused.closest('article')?.dataset.pickId : null;
  const expanded = new Set([...$('cards').querySelectorAll('article')].filter(n => n.querySelector('details')?.open).map(n => n.dataset.pickId));
  dataset = withFreshness(dataset, Date.now(), refreshError);
  const visible = selectPicks(dataset.picks, { query: $('search').value, bucket, sort: $('sort').value });
  $('cards').replaceChildren(...visible.map(p => renderCard(p, expanded.has(p.id))));
  $('results-count').textContent = visible.length + ' of ' + dataset.picks.length;
  if (!visible.length) $('cards').append(make('div', 'No matches. Try another search or bucket.', 'empty'));
  if (focusedSummary) $('cards').querySelectorAll('article').forEach(a => {
    if (a.dataset.pickId === focusedSummary) a.querySelector('summary').focus({ preventScroll: true });
  });
  setSummary();
}

async function refresh(force = false) {
  if (loading) return;
  loading = true;
  const button = $('refresh');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  $('message').className = 'message';
  $('message').textContent = dataset ? 'Checking for updated data…' : 'Loading stock research…';
  try {
    const next = await loadPicks(fetch, { force });
    dataset = next;
    refreshError = false;
    lastChecked = Date.now();
    render();
    $('message').textContent = next.isDemo
      ? 'Sample data loaded · no live market connection in this preview.'
      : 'Latest available provider snapshots checked.';
  } catch {
    refreshError = true;
    if (dataset) render();
    $('message').className = 'message error';
    $('message').textContent = dataset
      ? 'Refresh failed. Previously displayed provider quotes are marked stale. Tap Refresh to retry.'
      : 'Unable to load data. Check your connection and tap Refresh.';
  } finally {
    loading = false;
    button.disabled = false;
    button.setAttribute('aria-busy', 'false');
  }
}

$('refresh').addEventListener('click', () => refresh(true));
$('search').addEventListener('input', render);
$('sort').addEventListener('change', render);
$('buckets').addEventListener('click', event => {
  const target = event.target.closest('button[data-bucket]');
  if (!target) return;
  bucket = target.dataset.bucket;
  for (const button of $('buckets').querySelectorAll('button')) {
    const active = button === target;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  render();
});
setInterval(() => { if (!document.hidden) render(); }, 30_000);
setInterval(() => { if (!document.hidden) refresh(); }, 300_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh();
});
refresh();
