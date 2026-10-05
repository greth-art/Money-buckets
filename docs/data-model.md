# Data contract (v1)

`data/picks.json` is a versioned envelope: `{ schemaVersion: 1, isDemo: true, picks: StockPick[] }`.
`src/model.js` provides JSDoc types, runtime validation, filtering, and target-upside calculation. `src/repository.js` owns data loading; UI modules do not fetch providers directly.

| Field | Meaning / constraint |
| --- | --- |
| id | Stable unique pick identifier; not necessarily the ticker |
| rank | Unique positive editorial rank; unrelated to selected display sort |
| symbol, companyName | Display identity; a future provider adapter should add exchange and provider identifiers |
| currency | USD for v1; all amounts in a pick share this currency |
| bucket | core, growth, or speculative; organizational tags, not risk guarantees |
| quote | Positive price, ISO timestamp with timezone (`asOf`), and source attribution |
| entryZone | Positive low/high research entry range, low ≤ high |
| analystTargets | Nullable snapshot: low ≤ average ≤ high; positive analystCount; consensus rating; asOf; source; positive integer horizonMonths |
| thesis, risks | Research rationale and nonempty array of risks |
| updatedAt | ISO timestamp with timezone for the editorial pick |

Ratings: strong-buy, buy, hold, sell, strong-sell. Missing coverage is `analystTargets: null`, never zero-filled. The average is the provider's consensus, not the midpoint of low/high. `analystCount` is the number contributing to that snapshot. A future adapter must document whether rating and target populations differ.

Upside = `(analystTargets.average / quote.price - 1) * 100`. It is a target comparison, not a probability, expected return, or risk-adjusted score. Missing targets sort last by upside. Quotes and targets carry separate timestamps because their update schedules differ. No freshness claim is made by this demo.

Future persistence: normalize into `stocks` (identity), `picks` (rank, bucket, thesis, entry zone), `quote_snapshots`, and `analyst_target_snapshots`, linked by stock ID. Retain historical snapshots rather than overwriting them. Add server-side validation, currency normalization, and migrations when introducing a database.
