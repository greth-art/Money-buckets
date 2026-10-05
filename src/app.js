import { loadPicks } from './repository.js';
import { selectPicks, upsidePercent } from './model.js';
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(n);
const stamp = value => new Date(value).toLocaleString('en-US', {timeZone:'UTC',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) + ' UTC';
let picks = [];
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function metric(list, label, value) { list.append(element('dt',label),element('dd',value)); }
function card(p) {
  const article = element('article',undefined,'card');
  const heading = element('div',undefined,'card-heading');
  heading.append(element('span',`#${p.rank}`,'rank'),element('span',p.bucket,'bucket'));
  article.append(heading,element('h3',p.symbol),element('p',p.companyName,'company'));
  const dl = element('dl');
  metric(dl,'Demo quote',money(p.quote.price));
  metric(dl,'Entry zone',`${money(p.entryZone.low)} – ${money(p.entryZone.high)}`);
  const a = p.analystTargets;
  metric(dl,'Analyst low / avg / high',a ? `${money(a.low)} / ${money(a.average)} / ${money(a.high)}` : 'Not available');
  metric(dl,'Consensus / analysts',a ? `${a.rating.replaceAll('-',' ')} / ${a.analystCount}` : 'Not available');
  const upside = upsidePercent(p);
  metric(dl,'Average target upside',upside === null ? 'Not available' : `${upside >= 0 ? '+' : ''}${upside.toFixed(1)}%`);
  article.append(dl,element('p',p.thesis,'thesis'));
  const details = element('details');
  details.append(element('summary','Risks & data sources'));
  const risks = element('ul');
  p.risks.forEach(r => risks.append(element('li',r)));
  details.append(risks,element('p',`Quote: ${p.quote.source} · ${stamp(p.quote.asOf)}`));
  if (a) details.append(element('p',`Targets: ${a.source} · ${stamp(a.asOf)} · ${a.horizonMonths}-month horizon`));
  details.append(element('p',`Pick updated: ${stamp(p.updatedAt)}`));
  article.append(details);
  return article;
}
function render() {
  const visible = selectPicks(picks,{query:$('search').value,bucket:$('bucket').value,sort:$('sort').value});
  $('picks').replaceChildren(...visible.map(card));
  $('status').textContent = `${visible.length} of ${picks.length} demo picks`;
  if (!visible.length) $('picks').append(element('p','No matches. Try another search or bucket.','empty'));
}
async function load() {
  $('retry').hidden = true;
  $('status').textContent = 'Loading sample picks…';
  try { picks = await loadPicks(); render(); }
  catch { $('picks').replaceChildren(); $('status').textContent = 'Could not load sample picks. Check the data file and try again.'; $('retry').hidden = false; }
}
$('search').addEventListener('input',render);
$('bucket').addEventListener('change',render);
$('sort').addEventListener('change',render);
$('retry').addEventListener('click',load);
load();
