// The season being played, as rows of the games CSV, from ESPN's schedule.
//
// The games CSV is committed, and was meant to be refreshed weekly; since
// September 2026 that update could not land (main takes changes only through
// a pull request), and a weekly merge to keep a page current is the wrong
// shape anyway. So head-to-head, records, history and coaches count the
// season being played from ESPN instead, as the Brewers site does (its
// lib/espn-current.js): its completed games, written in the CSV's own
// columns, replace the CSV's rows for that season wherever games are counted
// (poolCurrentSeason in records-core.js). The CSV keeps every season before
// it, and is the fallback for this one when ESPN cannot be reached.
//
// Pure: the server fetches the schedules (through its ESPN cache) and passes
// them in.

/** The games CSV's columns, in its order. test/current-season.test.js holds
 *  this to the file's own header, so the two cannot drift. */
export const GAMES_COLUMNS = [
	'date', 'season', 'regular_season', 'playoff', 'superbowl', 'Opponent', 'Packers Win',
	'packers_score', 'opponent_score', 'location',
	'espn_id', 'stadium', 'roof', 'surface', 'temp', 'wind', 'referee',
];

const TEAM = 'GB';

// The date in Green Bay: a Sunday night game is Monday in UTC.
function centralDate(iso) {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
	const get = (t) => parts.find((p) => p.type === t)?.value;
	return `${get('year')}-${get('month')}-${get('day')}`;
}

const score = (c) => {
	const v = c?.score?.value ?? c?.score?.displayValue ?? c?.score;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
};

/** One completed game from ESPN's team schedule as a CSV row (an object
 *  keyed by GAMES_COLUMNS), or null for a game not yet final. */
export function gameRow(event, season, { playoff }) {
	const comp = event?.competitions?.[0];
	if (!comp?.status?.type?.completed) return null;
	const us = comp.competitors?.find((c) => c.team?.abbreviation === TEAM);
	const them = comp.competitors?.find((c) => c !== us);
	if (!us || !them) return null;
	const [p, o] = [score(us), score(them)];
	if (p == null || o == null) return null;
	// "Super Bowl LXI" -> "lxi", as the CSV writes the ones it has.
	const sb = (comp.notes || []).map((n) => n.headline || '').join(' ').match(/Super Bowl ([IVXLC]+)/i);
	return {
		date: centralDate(event.date),
		season: String(season),
		regular_season: playoff ? '0' : '1',
		playoff: playoff ? '1' : '0',
		superbowl: sb ? sb[1].toLowerCase() : '',
		Opponent: them.team?.displayName || them.team?.name || '',
		'Packers Win': p > o ? 'WIN' : p < o ? 'LOSS' : 'TIE',
		packers_score: String(p),
		opponent_score: String(o),
		location: comp.neutralSite ? 'NEUTRAL' : us.homeAway === 'home' ? 'HOME' : 'AWAY',
		espn_id: String(event.id || ''),
		stadium: comp.venue?.fullName || '',
		roof: '', surface: '', temp: '', wind: '', referee: '',
	};
}

/** The season's completed regular-season and playoff games, in date order,
 *  from ESPN's team schedule for seasontype 2 and 3. The preseason is left
 *  out, as the CSV leaves it out. */
export function currentSeasonRows({ regular, post }, season) {
	const rows = [
		...(regular?.events || []).map((e) => gameRow(e, season, { playoff: false })),
		...(post?.events || []).map((e) => gameRow(e, season, { playoff: true })),
	].filter(Boolean);
	return rows.sort((a, b) => a.date.localeCompare(b.date));
}

const field = (v) => {
	const t = String(v ?? '');
	return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** Rows as CSV text with the games CSV's header, so the pages can parse it
 *  with the same parser as the file. */
export function rowsToCsv(rows) {
	return [GAMES_COLUMNS.join(','), ...rows.map((r) => GAMES_COLUMNS.map((k) => field(r[k])).join(','))].join('\n') + '\n';
}
