# Money Buckets

A practical starting point for a stock advisory research app. Compare ranked stock picks, entry zones, and analyst expectations in a responsive dashboard.

**Demo only:** all five companies, symbols, prices, targets, analyst counts, and rankings are fictional fixtures. This app does not provide live quotes, personalized investment advice, brokerage connectivity, or trade execution.

## Run locally

Requires Node.js 22 or newer and a modern browser. No dependencies, API keys, account, or install step are needed.

```sh
git clone https://github.com/greth-art/Money-buckets.git
cd Money-buckets
npm start
```

Open http://127.0.0.1:3000. Do not open `index.html` directly: loading JSON and ES modules requires HTTP. `PORT=4000 npm start` changes the port. The development server binds to localhost by default.

```sh
npm test          # Data validation, filtering, sorting, and upside calculations
npm run build    # Validate fixtures and copy public assets to dist/
node scripts/serve.mjs dist  # Preview the build locally
```

`dist/` can be served by any static host, including a subdirectory. Hosting is not configured by this starter. The included HTTP server is for local development, not production.

## Included

- Five editorially ranked demo picks in Core, Growth, and Speculative buckets.
- Search by symbol/company, bucket filtering, and sorting by rank, symbol, or average-target upside.
- Quote, entry zone, low/average/high analyst targets, consensus rating, analyst count, and target horizon.
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

For real data, replace `loadPicks()` in `src/repository.js` with an adapter to a backend that validates and normalizes provider responses. This version intentionally rejects non-demo datasets: remove that guard only alongside accurate live/delayed/stale indicators and an updated disclosure. Never place provider secrets in frontend code or committed JSON; all static assets are publicly readable.

Keep provider timestamps and attribution, honor data licensing, and define caching and rate limits. Preserve the separation of quotes, editorial picks, and analyst snapshots. The app currently has no authentication, saved watchlists, database, or live provider integration.

## Next steps

See the repository's [issues](https://github.com/greth-art/Money-buckets/issues) for scoped work on provider integration, saved research/watchlists, and browser/accessibility testing. Prioritize real-data provenance and freshness before using the app for financial decisions.
