import { validateDataset } from './model.js';
// Prefer the backend; static hosts without the API retain the demo fixture.
export async function loadPicks() {
  const api = await fetch(new URL('../api/picks', import.meta.url));
  if (api.status === 404) {
    const demo = await fetch(new URL('../data/picks.json', import.meta.url));
    if (!demo.ok) throw new Error(`Unable to load picks (${demo.status})`);
    return validateDataset(await demo.json());
  }
  if (!api.ok) throw new Error(`Unable to load picks (${api.status})`);
  return validateDataset(await api.json());
}
