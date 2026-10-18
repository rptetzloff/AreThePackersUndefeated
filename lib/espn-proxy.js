// A cache in front of ESPN's public API, for /api/espn/*. The browser used
// to call site.api.espn.com itself, so every visitor's every refresh was a
// call to ESPN, a live game's 30-second poll included, and the page was
// only as available as ESPN was to that visitor. Through here, viewers of a
// live game share one ESPN call per refresh, and a brief ESPN outage serves
// the last good answer rather than an empty schedule.
//
// Ported from the Brewers repo's server.js, where it lives inline; here it
// is a module so the rules can be tested without a server or a network.
//
// The lifetime is chosen per response from what it says, because what can
// still change differs:
//   a finished game's summary, or a schedule whose games are all over: a day
//   a schedule with no game underway or within two hours: an hour, since
//     nothing on it can change before the next kickoff
//   anything near or during a game: a minute
//   a game in progress's summary: 15 seconds
// Football plays once a week, so the hour tier covers most of the week.
//
// What it does not do: lib/seasons.js still calls ESPN directly for the
// server-rendered title and social cards, with its own cache.

export const TTL = {
	live: 15 * 1000,
	normal: 60 * 1000,
	idle: 60 * 60 * 1000,
	final: 24 * 60 * 60 * 1000,
};
const GAME_SOON_MS = 2 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

/** How long an ESPN response may be served from the cache. */
export function ttlFor(target, status, body, now = Date.now()) {
	if (status !== 200) return TTL.normal;
	try {
		if (target.includes('/summary?')) {
			const st = JSON.parse(body)?.header?.competitions?.[0]?.status?.type;
			return st?.completed ? TTL.final : st?.state === 'in' ? TTL.live : TTL.normal;
		}
		if (target.includes('/schedule')) {
			const events = JSON.parse(body)?.events || [];
			let allDone = events.length > 0;
			for (const e of events) {
				const st = e?.competitions?.[0]?.status?.type;
				// 'post' covers finals and postponements without a new date;
				// both are settled until a reschedule, which the idle TTL
				// picks up soon enough.
				if (st?.state === 'post') continue;
				allDone = false;
				if (st?.state === 'in') return TTL.normal;
				const startsIn = Date.parse(e?.date || '') - now;
				if (Number.isNaN(startsIn) || startsIn < GAME_SOON_MS) return TTL.normal;
			}
			return allDone ? TTL.final : TTL.idle;
		}
	} catch { /* unparseable: treat as volatile */ }
	return TTL.normal;
}

/** The browser's max-age for a response: short for anything volatile or
 *  stale, so the server's cache stays the one that decides. */
export function browserMaxAge({ ttl, cacheState }) {
	if (cacheState === 'stale' || ttl <= TTL.normal) return 15;
	return ttl === TTL.idle ? 300 : 3600;
}

/**
 * A cache over `fetchImpl`. get(target) resolves to
 *   { status, body, ttl, at, cacheState }  cacheState 'hit' | 'miss' | 'stale'
 * or null when ESPN is unreachable and nothing is cached. Requests for a URL
 * already being fetched share that fetch.
 */
export function createEspnCache(fetchImpl = fetch, now = () => Date.now()) {
	const cache = new Map(); // target -> { at, status, body, ttl }
	const inFlight = new Map();
	async function get(target) {
		const hit = cache.get(target);
		if (hit && now() - hit.at < hit.ttl) return { ...hit, cacheState: 'hit' };
		if (!inFlight.has(target)) {
			inFlight.set(target, (async () => {
				try {
					const r = await fetchImpl(target);
					const body = await r.text();
					// A 403 or 5xx from ESPN is not worth replacing a good answer
					// with; serve the last one stale, as for a network failure.
					if (r.status >= 400 && hit) return { ...hit, cacheState: 'stale' };
					if (cache.size >= MAX_ENTRIES) {
						// Drop expired entries first so long-lived ones survive.
						for (const [k, v] of cache) if (now() - v.at >= v.ttl) cache.delete(k);
						if (cache.size >= MAX_ENTRIES) cache.clear();
					}
					const entry = { at: now(), status: r.status, body, ttl: ttlFor(target, r.status, body, now()) };
					cache.set(target, entry);
					return { ...entry, cacheState: 'miss' };
				} catch {
					return hit ? { ...hit, cacheState: 'stale' } : null;
				} finally {
					inFlight.delete(target);
				}
			})());
		}
		return inFlight.get(target);
	}
	return { get, size: () => cache.size };
}
