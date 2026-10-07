import { validateDataset } from './model.js';
// Prefer the backend; static hosts without the API retain the demo fixture.
export async function loadPicks(fetchImpl = fetch) {
  const api = await fetchImpl(new URL('../api/picks', import.meta.url));
  if (api.status === 404) {
    const demo = await fetchImpl(new URL('../data/picks.json', import.meta.url));
    if (!demo.ok) throw new Error(`Unable to load picks (${demo.status})`);
    const data = validateDataset(await demo.json());
    if (!data.isDemo) throw new Error('Static fallback must be demo data');
    return data;
  }
  if (!api.ok) throw new Error(`Unable to load picks (${api.status})`);
  return validateDataset(await api.json());
}
