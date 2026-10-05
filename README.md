# Money Buckets

A practical starting point for a stock advisory research app. Compare ranked stock picks, entry zones, and analyst expectations in a responsive dashboard.

**Demo by default:** without a Finnhub API key, the backend returns clearly labeled illustrative quote/target fixtures. With a configured key, Finnhub data is loaded and freshness is shown per quote and target. This app does not provide personalized investment advice, brokerage connectivity, or trade execution.

## Run locally

Requires Node.js 22 or newer and a modern browser. No dependencies, API keys, account, or install step are needed.

```sh
git clone https://github.com/greth-art/Money-buckets.git
cd Money-buckets
npm start
```

Open http://127.0.0.1:3000. Do not open `index.html` directly: loading JSON and ES modules requires HTTP. `PORT=4000 npm start` changes the port. The development server binds to localhost by default.

To enable the optional backend provider, set `FINNHUB_API_KEY` in the server environment before starting it. Do not put the key in browser code, `data/picks.json`, or a public static host. The frontend calls `/api/picks`; with no backend route, it falls back to the demo fixture.

```sh
npm test          # Data validation, filtering, sorting, and upside calculations
npm run build    # Validate fixtures and copy public assets to dist/
node scripts/serve.mjs dist  # Preview the build locally
```

`dist/` can be served by any static host, including a subdirectory. Hosting is not configured by this starter. The included HTTP server is for local development, not production.

## Included

- Five editorially ranked demo picks in Core, Growth, and Speculative buckets.
- Search by symbol/company, bucket filtering, and sorting by rank, symbol, or average-target upside.
- Quote, entry zone, low/average/high analyst targets, consensus rating, analyst count, and target horizon. Provider mode displays quote and target provenance and freshness.
- Expandable thesis risks and source timestamps, plus loading, empty, failure, and retry states.
- Accessible labels, keyboard focus styles, responsive cards, and safe text rendering.
- Runtime data validation, Node tests, and GitHub Actions checks.

## Project structure

```text
index.html              Page shell and controls
src/app.js              DOM rendering and interactions
src/styles.css          Responsive styling
src/model.js            Data types, validation, and pure calculations
src/repository.js       Replaceable data-loading boundary
data/picks.json         Versioned fictional fixtures
docs/data-model.md      Field definitions and persistence direction
scripts/serve.mjs       Local static server
scripts/build.mjs       Static build and fixture validation
tests/model.test.js     Data and business-rule tests
.github/workflows/ci.yml Test/build on pushes and pull requests
```

## Extend it

Edit `data/picks.json` to add demo picks, following [the data contract](docs/data-model.md). Use `analystTargets: null` when there is no coverage. Ranks and IDs must be unique. Run tests and build before committing.

The optional Finnhub adapter is implemented in `scripts/market-data.mjs` and served by `scripts/serve.mjs`; API credentials remain server-side. Provider integration uses three requests per symbol, a five-minute in-memory cache, five-second timeouts, and at most one retry for transient errors and rate limiting. Without credentials the demo mode remains usable.

Finnhub advertises a free $0 plan with a 60-request-per-minute limit and US stock coverage. Real-time access and data redistribution rights depend on exchange entitlements and account terms; the free tier is for personal/non-commercial use. Verify current coverage, delay, costs, and licensing before deployment or commercial display: [pricing](https://finnhub.io/pricing), [API docs](https://finnhub.io/docs/api), [terms](https://finnhub.io/terms-of-service). Freshness labels are timestamp thresholds, not a promise of exchange-level live service. Preserve separate quote/target timestamps and attribution. The app currently has no authentication, saved watchlists, database, or production deployment configuration.

## Next steps

See the repository's [issues](https://github.com/greth-art/Money-buckets/issues) for scoped work on provider integration, saved research/watchlists, and browser/accessibility testing. Prioritize real-data provenance and freshness before using the app for financial decisions.
