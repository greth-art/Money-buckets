
# Money Buckets 2 — iPhone-first dashboard

This is a **separate new interface** under `/mobile-v2/`, not a replacement for the original Money Buckets page. The existing `/index.html` continues to work.

## Run and preview locally

```sh
npm start
# Open http://127.0.0.1:3000/mobile-v2/
```

For a production-style static build check, run `npm test && npm run build` then `node scripts/serve.mjs dist` and open `/mobile-v2/`.

## What's included

- Large, readable quotes and mobile-friendly ranked cards for the existing five stocks.
- Search, Core/Growth/Speculative bucket filters, and rank/upside/symbol sorting.
- Low / average / high analyst price targets, reported recommendation counts, and consensus, with unavailable values **shown as N/A rather than invented**.
- A visible provider/demo status and separate quote/analyst timestamps in expandable per-stock source details.
- **One-tap Refresh** that checks the entire dataset. A force-refresh bypasses the five-minute backend cache **only once a minute**, respecting API cooldown and quota limits.
- Automatic checks every five minutes while the tab is visible and on foreground return. Transport errors retain snapshots with stale labels.
- A standalone display manifest and launcher icon for supported mobile browsers.

## Limits and release safety

The current editorial top-five ranks, entry ranges, and thesis/risks remain **fictional illustrative research**, even if Finnhub price data is configured. The SPXL/SPXS/cash trading signal and benchmark backtest are planned features, **not active recommendations**.

No API key is shipped to the browser. Without the Finnhub key, the server provides labeled demo data. Serving the static build on a host **without** a backend falls back to demo-only mode. A stock-data API requires a compatible secured server runtime. Provider quote freshness is a timestamp calculation, not proof of an exchange feed entitlement.

**Not deployed:** This branch does not change the existing invited-tester Site. Publish to a **separate private preview** only after confirming hosting, account entitlements, licensing, and that the backend can safely serve `/api/picks`. Then validate iPhone Safari and Home Screen behavior and keep the old URL available as rollback.

## Developer notes

- Entry point: `mobile-v2/index.html`
- Styles: `mobile-v2/styles.css`
- Interactions: `mobile-v2/app.js`
- Shared validation/model/provider: `src/`, `scripts/market-data.mjs`
- Tests: `tests/mobile-v2.test.js` and existing tests

The app is research-only and does not connect to a brokerage or place trades.
