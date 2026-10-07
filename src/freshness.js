// Shared by the server and browser. These are age labels, not exchange entitlements.
export const FUTURE_TOLERANCE_MS = 60_000;
export function freshness(asOf, now = Date.now(), kind = 'quote') {
  const age = now - Date.parse(asOf);
  if (!Number.isFinite(age) || age < -FUTURE_TOLERANCE_MS) return 'stale';
  if (kind !== 'quote') return age <= 30 * 86400_000 ? 'delayed' : 'stale';
  return age <= 15 * 60_000 ? 'live' : age <= 86400_000 ? 'delayed' : 'stale';
}

export function withFreshness(dataset, now = Date.now(), forceStale = false) {
  const result = structuredClone(dataset);
  if (result.isDemo) return result;
  for (const pick of result.picks) {
    for (const [snapshot, kind] of [[pick.quote, 'quote'], [pick.analystTargets, 'target'], [pick.recommendation, 'recommendation']]) {
      if (snapshot) {
        // A failed refresh must never be made fresh merely by a browser timer.
        snapshot.freshness = forceStale || snapshot.freshness === 'stale'
          ? 'stale' : freshness(snapshot.asOf, now, kind);
      }
    }
  }
  return result;
}
