import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createMarketDataAdapter } from './market-data.mjs';
const root = resolve(process.argv[2] || '.');
const demo = JSON.parse(await readFile(resolve(root, 'data/picks.json'), 'utf8'));
const loadMarketData = createMarketDataAdapter({
  picks: demo,
  apiKey: process.env.FINNHUB_API_KEY
});
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
createServer(async (req,res) => {
  try {
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405,{'Allow':'GET, HEAD'}).end(); return; }
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (pathname === '/api/picks') {
      try {
        const data = await loadMarketData() || demo;
        res.writeHead(200, {'Content-Type': types['.json'], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data));
      } catch {
        res.writeHead(502, {'Content-Type': types['.json'], 'Cache-Control': 'no-store'}).end(req.method === 'HEAD' ? undefined : JSON.stringify({error:'Market data provider unavailable'}));
      }
      return;
    }
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    // Only serve public app assets; never source-control, secrets, or scripts.
    if (!(relative === 'index.html' || /^(src|data)\/[a-zA-Z0-9_./-]+$/.test(relative)) || relative.split('/').some(p => p.startsWith('.'))) { res.writeHead(404).end('Not found'); return; }
    const file = resolve(root,relative);
    if (!file.startsWith(root + sep)) { res.writeHead(404).end('Not found'); return; }
    const body = await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(Number(process.env.PORT || 3000),process.env.HOST || '127.0.0.1',() => console.log(`Money Buckets: http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3000}`));
