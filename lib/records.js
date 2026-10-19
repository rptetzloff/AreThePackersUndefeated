// Server-side records/superlatives over the games lib/derived.js hands in:
// the CSV's seasons plus the season being played from ESPN. They were
// computed once at startup from the CSV alone, so the season being played
// never counted until a data commit and a deploy. Pure computation lives in
// records-core.js (shared with the browser page).
import { computeSuperlatives, computeSeasonHistory, recordsCopy, historyCopy, RECORD_SLUGS } from '../records-core.js';

export function recordsData(games) {
	return { records: computeSuperlatives(games), seasonHistory: computeSeasonHistory(games) };
}

export function historyMeta(seasonHistory) {
	return historyCopy(seasonHistory);
}

export function isRecordSlug(slug) {
	return RECORD_SLUGS.includes(slug);
}

// slug undefined/'overview' -> landing-page copy.
export function recordsMeta(slug, records) {
	return recordsCopy(slug || 'overview', records);
}
