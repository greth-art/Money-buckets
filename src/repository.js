import { validateDataset } from './model.js';
// Replace this boundary with a backend API adapter when live data is available.
export async function loadPicks() {
  const response = await fetch(new URL('../data/picks.json', import.meta.url));
  if (!response.ok) throw new Error(`Unable to load picks (${response.status})`);
  const data = validateDataset(await response.json());
  if (!data.isDemo) throw new Error('This starter only supports demo datasets');
  return data.picks;
}
