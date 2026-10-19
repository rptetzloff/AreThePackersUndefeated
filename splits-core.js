// The Splits page: the Packers' record by when they played, in close games
// and overtime, by the point spread, and by starting quarterback on both
// sides, from the games CSV's columns from nflverse's schedules (CC BY 4.0).
// nflverse has these from 1999, so the page starts there, as Stadiums does.
//
// Pure: the server passes the rows in (stadiums-core.js's, the CSV's with the
// season being played from nflverse at runtime).
import { tally } from './stadiums-core.js';

const RESULT = { WIN: 'W', LOSS: 'L', TIE: 'T' };
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** A game's row for the page, or null for one not played or before 1999. */
export function splitsGame(r) {
	const season = Number(r.season);
	const result = RESULT[r.result];
	if (!result || season < 1999) return null;
	const [h, m] = String(r.kickoff || '').split(':').map(Number);
	return {
		espnId: r.espnId || '', date: r.date, season, opponent: r.Opponent,
		home: r.location === 'HOME', regular: r.regular_season === '1',
		result, pf: Number(r.scoreFor) || 0, pa: Number(r.scoreAgainst) || 0,
		weekday: r.weekday || '',
		// Minutes after midnight Eastern, or null where nflverse has no time.
		kickoff: Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null,
		overtime: r.overtime === '1',
		division: r.division === '1',
		spread: num(r.spread),
		qbId: r.qbId || '', qb: r.qb || '',
		oppQbId: r.oppQbId || '', oppQb: r.oppQb || '',
	};
}

/** Thanksgiving: the fourth Thursday of November. */
export function isThanksgiving(date) {
	const [, mo, d] = date.split('-').map(Number);
	return mo === 11 && d >= 22 && d <= 28 && new Date(`${date}T12:00:00Z`).getUTCDay() === 4;
}

const ET = (h, m = 0) => h * 60 + m;
const WHEN = [
	['Sunday, early', 'kickoff before 3 p.m. ET', (g) => g.weekday === 'Sunday' && g.kickoff !== null && g.kickoff < ET(15)],
	['Sunday, late afternoon', '3 to 7 p.m. ET', (g) => g.weekday === 'Sunday' && g.kickoff !== null && g.kickoff >= ET(15) && g.kickoff < ET(19)],
	['Sunday night', '7 p.m. ET or later', (g) => g.weekday === 'Sunday' && g.kickoff !== null && g.kickoff >= ET(19)],
	['Monday night', '', (g) => g.weekday === 'Monday'],
	['Thursday', 'Thanksgiving included', (g) => g.weekday === 'Thursday'],
	['Saturday', 'late season and playoffs', (g) => g.weekday === 'Saturday'],
	['Thanksgiving', '', (g) => isThanksgiving(g.date)],
	['Christmas', 'December 25', (g) => g.date.slice(5) === '12-25'],
];

const CLOSE = [
	['Overtime', '', (g) => g.overtime],
	['Decided by 3 or fewer', '', (g) => Math.abs(g.pf - g.pa) <= 3],
	['One-score games', 'decided by 8 or fewer', (g) => Math.abs(g.pf - g.pa) <= 8],
	['Decided by 21 or more', '', (g) => Math.abs(g.pf - g.pa) >= 21],
	['Division games', '', (g) => g.division],
	['Everyone else', '', (g) => !g.division],
];

const LINE = [
	['Favored by 7 or more', '', (g) => g.spread !== null && g.spread >= 7],
	['Favored by less than 7', '', (g) => g.spread !== null && g.spread > 0 && g.spread < 7],
	["Pick 'em", 'no favorite', (g) => g.spread === 0],
	['Underdog by less than 7', '', (g) => g.spread !== null && g.spread < 0 && g.spread > -7],
	['Underdog by 7 or more', '', (g) => g.spread !== null && g.spread <= -7],
];

/** Against the spread: the Packers cover when they win by more than they
 *  were favored by, or lose by less than they were the underdog by; landing
 *  on the number is a push. */
export function atsResult(g) {
	if (g.spread === null) return null;
	const margin = g.pf - g.pa - g.spread;
	return margin > 0 ? 'W' : margin < 0 ? 'L' : 'T';
}

function ats(games) {
	return tally(games.map((g) => ({ result: atsResult(g) })).filter((g) => g.result));
}

const rowsOf = (defs, games, withAts = false) => defs.map(([label, note, test]) => {
	const gs = games.filter(test);
	return { label, note, ...tally(gs), ...(withAts ? { ats: ats(gs) } : {}) };
}).filter((r) => r.games > 0);

const span = (games) => {
	const s = games.map((g) => g.season);
	return { first: Math.min(...s), last: Math.max(...s) };
};

/** Everything the Splits page shows, from parseGames rows. */
export function splitStats(rows, { minFaced = 3 } = {}) {
	const games = rows.map(splitsGame).filter(Boolean).sort(byDate);
	if (!games.length) return null;

	const group = (idKey, nameKey, list) => {
		const m = new Map();
		for (const g of list) {
			const key = g[idKey] || g[nameKey];
			if (!key) continue;
			if (!m.has(key)) m.set(key, { id: g[idKey], name: g[nameKey], games: [] });
			const e = m.get(key);
			e.name = g[nameKey] || e.name;
			e.games.push(g);
		}
		return [...m.values()];
	};

	const starters = group('qbId', 'qb', games).map((q) => ({
		id: q.id, name: q.name, ...span(q.games),
		...tally(q.games),
		regular: tally(q.games.filter((g) => g.regular)),
		playoffs: tally(q.games.filter((g) => !g.regular)),
	})).sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));

	const opposing = group('oppQbId', 'oppQb', games)
		.filter((q) => q.games.length >= minFaced)
		.map((q) => ({ id: q.id, name: q.name, ...span(q.games), ...tally(q.games), opponents: [...new Set(q.games.map((g) => g.opponent))] }))
		.sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));

	return {
		range: span(games),
		games: games.length,
		when: rowsOf(WHEN, games),
		close: rowsOf(CLOSE, games),
		line: rowsOf(LINE, games, true),
		// Every game with a line, under the five bands that split it.
		lineAll: { label: 'Every game', note: '', ...tally(games.filter((g) => g.spread !== null)), ats: ats(games) },
		starters,
		opposing,
		minFaced,
	};
}

/** One quarterback's record as the Packers' starter, for his player page,
 *  or null if he never started for them. */
export function starterRecord(rows, id) {
	const games = rows.map(splitsGame).filter((g) => g && g.qbId === id);
	if (!games.length) return null;
	return {
		...span(games),
		regular: tally(games.filter((g) => g.regular)),
		playoffs: tally(games.filter((g) => !g.regular)),
	};
}
