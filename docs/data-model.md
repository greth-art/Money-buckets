# Data contract (v1)

`data/picks.json` is a versioned envelope: `{ schemaVersion: 1, isDemo: true, picks: StockPick[] }`. The backend endpoint returns the same contract with `isDemo: false` only after validating provider data.
`src/model.js` provides JSDoc types, runtime validation, filtering, and target-upside calculation. `src/repository.js` owns data loading; UI modules do not fetch providers directly.

| Field | Meaning / constraint |
| --- | --- |
| id | Stable unique pick identifier; not necessarily the ticker |
| rank | Unique positive editorial rank; unrelated to selected display sort |
| symbol, companyName | Display identity; a future provider adapter should add exchange and provider identifiers |
| currency | USD for v1; all amounts in a pick share this currency |
| bucket | core, growth, or speculative; organizational tags, not risk guarantees |
| quote | Positive price, ISO timestamp with timezone (`asOf`), source attribution, and optional `freshness` (`live`, `delayed`, or `stale`) |
| entryZone | Positive low/high research entry range, low ≤ high |
| analystTargets | Nullable snapshot: low ≤ average ≤ high; nullable analystCount/rating when the provider omits recommendations; asOf; source; positive integer horizonMonths; optional freshness |
| thesis, risks | Research rationale and nonempty array of risks |
| updatedAt | ISO timestamp with timezone for the editorial pick |

Ratings: strong-buy, buy, hold, sell, strong-sell. Missing target coverage is `analystTargets: null`, never zero-filled. If a target exists but recommendation coverage does not, `analystCount` and `rating` are null. The average is the provider's consensus, not the midpoint of low/high. The Finnhub adapter's `analystCount` is the sum of strong-buy, buy, hold, sell, and strong-sell counts in the latest recommendation snapshot; its rating is the nearest category to the weighted mean (5 to 1, with exact ties rounded toward sell). This recommendation population may differ from the price-target population.

Upside = `(analystTargets.average / quote.price - 1) * 100`. It is a target comparison, not a probability, expected return, or risk-adjusted score. Missing targets sort last by upside. Quotes and targets carry separate timestamps because their update schedules differ. Quote freshness is `live` at up to 15 minutes old, `delayed` up to 24 hours, then `stale`; analyst targets are snapshots and marked `delayed` up to 30 days, then `stale`. If the provider cannot be reached but a cached response exists, all cached provider fields are marked stale. These are application thresholds based on timestamps, not a guarantee of exchange-level real-time service.

## Provider adapter

The optional backend uses Finnhub's `/quote`, `/stock/price-target`, and `/stock/recommendation` endpoints for the five US symbols in the fixture. API credentials are read only from the server's `FINNHUB_API_KEY` environment variable. Without the key the backend returns the demo fixture; a static-only host falls back to that same fixture. Responses time out after five seconds, retry at most once for network errors, HTTP 429, or server errors, and successful snapshots are cached in memory for five minutes.

Finnhub advertises a $0 free plan with a 60-request-per-minute limit and US stock coverage; real-time access and use/redistribution rights depend on the account's exchange entitlements and applicable Finnhub terms. The free tier is for personal/non-commercial use; commercial display requires confirming and obtaining the appropriate license. Quote delay is not assumed from plan name: the UI classifies freshness from the provider timestamp, and users must verify entitlements and licensing before use. Current terms can change; consult [Finnhub pricing](https://finnhub.io/pricing), [API documentation](https://finnhub.io/docs/api), and [terms](https://finnhub.io/terms-of-service).

Future persistence: normalize into `stocks` (identity), `picks` (rank, bucket, thesis, entry zone), `quote_snapshots`, and `analyst_target_snapshots`, linked by stock ID. Retain historical snapshots rather than overwriting them. Add server-side validation, currency normalization, and migrations when introducing a database.
