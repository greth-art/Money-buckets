import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMarketDataAdapter } from './market-data.mjs';
export async function createAppServer({ root = resolve('.'), apiKey, fetchImpl, appVariant = 'classic' } = {}) {
  if (!['classic', 'mobile-v2'].includes(appVariant)) throw new Error('Invalid app variant');
  root = resolve(root);
  const demo = JSON.parse(await readFile(resolve(root, 'data/picks.json'), 'utf8'));
  const loadMarketData = createMarketDataAdapter({
    picks: demo,
    apiKey, fetchImpl
  });
  const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
  return createServer(async (req,res) => {
    try {
      if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405,{'Allow':'GET, HEAD'}).end(); return; }
      const url = new URL(req.url,'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/api/picks') {
        try {
          const data = await loadMarketData({ force: url.searchParams.get('refresh') === '1' }) || demo;
          res.writeHead(200, {'Content-Type': types['.json'], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
          res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data));
        } catch {
          res.writeHead(502, {'Content-Type': types['.json'], 'Cache-Control': 'no-store'}).end(req.method === 'HEAD' ? undefined : JSON.stringify({error:'Market data provider unavailable'}));
        }
        return;
      }
      const betaRootAsset = /^\/(?:index\.html|app\.js|styles\.css|manifest\.webmanifest|icon\.svg)$/.test(pathname);
      let relative = pathname === '/' ? (appVariant === 'mobile-v2' ? 'mobile-v2/index.html' : 'index.html')
        : pathname === '/mobile-v2' || pathname === '/mobile-v2/' ? 'mobile-v2/index.html'
        : appVariant === 'mobile-v2' && betaRootAsset
          ? 'mobile-v2/' + (pathname === '/index.html' ? 'index.html' : pathname.slice(1))
          : pathname.slice(1);
      // Only serve public app assets; never source-control, secrets, or scripts.
      if (!(relative === 'index.html' || /^(src|data|mobile-v2)\/[a-zA-Z0-9_./-]+$/.test(relative)) || relative.split('/').some(p => p.startsWith('.'))) { res.writeHead(404).end('Not found'); return; }
      const file = resolve(root,relative);
      if (!file.startsWith(root + sep)) { res.writeHead(404).end('Not found'); return; }
      const body = await readFile(file);
      res.writeHead(200,{'Content-Type':types[extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff'});
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404).end('Not found'); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = await createAppServer({ root: resolve(process.argv[2] || '.'), apiKey: process.env.FINNHUB_API_KEY, appVariant: process.env.APP_VARIANT === 'mobile-v2' ? 'mobile-v2' : 'classic' });
  const host = process.env.HOST || '127.0.0.1';
  server.listen(Number(process.env.PORT || 3000), host, () => console.log(`Money Buckets: http://${host}:${server.address().port}`));
}
