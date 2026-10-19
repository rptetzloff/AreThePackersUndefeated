// Server-side head coaches over the games lib/derived.js hands in, plus
// data/packers_coaches.csv. Pure computation lives in coaches-core.js
// (shared with the browser page).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCoachesCsv, computeCoaches, coachesCopy } from '../coaches-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tenures = parseCoachesCsv(readFileSync(join(__dirname, '..', 'data', 'packers_coaches.csv'), 'utf8'));

export function coachesData(games, seasonHistory) {
	const champions = seasonHistory.filter((s) => s.champion).map((s) => s.season);
	return computeCoaches(games, tenures, champions);
}

export function coachesMeta(coaches) {
	return coachesCopy(coaches);
}
