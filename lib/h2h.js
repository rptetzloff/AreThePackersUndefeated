// Server-side head-to-head over the games lib/derived.js hands in: the
// CSV's seasons plus the season being played from ESPN. Pure computation
// lives in h2h-core.js (shared with the browser page).
import { computeHeadToHead, h2hCopy } from '../h2h-core.js';

export function h2hData(games) {
	return computeHeadToHead(games);
}

export function isOpponentSlug(slug, h2h) {
	return h2h.bySlug.has(slug);
}

// slug undefined/'overview' -> landing-page copy.
export function h2hMeta(slug, h2h) {
	return h2hCopy(slug || 'overview', h2h);
}
