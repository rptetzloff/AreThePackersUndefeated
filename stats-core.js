// Player stats for the Stats page: each category's table for a season, and
// single-season and career leaders, summed from nflverse's game-by-game rows
// (lib/player-stats.js; 1999 on, as nflverse has nothing earlier). Pure
// functions over those rows, shared by the server, which builds the data,
// and the tests, which pin it with hand-made rows.
//
// Rates are computed from the totals, never averaged across games, and are
// null when their denominator is zero: a punter with no passes has no
// completion percentage, which is not a completion percentage of 0.

const n = (v) => {
	const x = Number(v);
	return Number.isFinite(x) ? x : 0;
};
const ratio = (a, b, digits = 1) => (b > 0 ? Number((a / b).toFixed(digits)) : null);

/** The NFL passer rating, from totals. Each of the four parts is held to
 *  between 0 and 2.375, as the league computes it. */
export function passerRating(cmp, att, yds, td, int) {
	if (!(att > 0)) return null;
	const clamp = (x) => Math.max(0, Math.min(2.375, x));
	const a = clamp((cmp / att - 0.3) * 5);
	const b = clamp((yds / att - 3) * 0.25);
	const c = clamp((td / att) * 20);
	const d = clamp(2.375 - (int / att) * 25);
	return Number((((a + b + c + d) / 6) * 100).toFixed(1));
}

/**
 * The categories, as the page lays them out. Each names the columns that
 * mean a player belongs in it (`has`), the stat it is sorted by (`sort`),
 * and its columns: a key, a heading, and how to get the value from a
 * player's totals.
 */
export const CATEGORIES = [
	{
		key: 'passing', title: 'Passing', has: ['attempts'], sort: 'yds',
		columns: [
			['cmp', 'Cmp', (t) => t.completions], ['att', 'Att', (t) => t.attempts],
			['pct', 'Pct', (t) => ratio(t.completions * 100, t.attempts)], ['yds', 'Yds', (t) => t.passing_yards],
			['ypa', 'Y/A', (t) => ratio(t.passing_yards, t.attempts)], ['td', 'TD', (t) => t.passing_tds],
			['int', 'Int', (t) => t.passing_interceptions], ['sk', 'Sk', (t) => t.sacks_suffered],
			['rate', 'Rate', (t) => passerRating(t.completions, t.attempts, t.passing_yards, t.passing_tds, t.passing_interceptions)],
		],
	},
	{
		key: 'rushing', title: 'Rushing', has: ['carries'], sort: 'yds',
		columns: [
			['car', 'Car', (t) => t.carries], ['yds', 'Yds', (t) => t.rushing_yards],
			['avg', 'Avg', (t) => ratio(t.rushing_yards, t.carries)], ['td', 'TD', (t) => t.rushing_tds],
		],
	},
	{
		key: 'receiving', title: 'Receiving', has: ['receptions', 'targets'], sort: 'yds',
		columns: [
			['tgt', 'Tgt', (t) => t.targets], ['rec', 'Rec', (t) => t.receptions], ['yds', 'Yds', (t) => t.receiving_yards],
			['avg', 'Avg', (t) => ratio(t.receiving_yards, t.receptions)], ['td', 'TD', (t) => t.receiving_tds],
		],
	},
	{
		key: 'defense', title: 'Defense',
		has: ['def_tackles_solo', 'def_tackle_assists', 'def_sacks', 'def_interceptions', 'def_pass_defended', 'def_fumbles_forced', 'fumble_recovery_opp'],
		sort: 'tot',
		columns: [
			['tot', 'Tot', (t) => t.def_tackles_solo + t.def_tackle_assists], ['solo', 'Solo', (t) => t.def_tackles_solo],
			['ast', 'Ast', (t) => t.def_tackle_assists], ['tfl', 'TFL', (t) => t.def_tackles_for_loss],
			['sk', 'Sk', (t) => t.def_sacks], ['qbh', 'QBH', (t) => t.def_qb_hits], ['int', 'Int', (t) => t.def_interceptions],
			['pd', 'PD', (t) => t.def_pass_defended], ['ff', 'FF', (t) => t.def_fumbles_forced],
			['fr', 'FR', (t) => t.fumble_recovery_opp], ['td', 'TD', (t) => t.def_tds],
		],
	},
	{
		key: 'kicking', title: 'Kicking', has: ['fg_att', 'pat_att'], sort: 'pts',
		columns: [
			['fgm', 'FGM', (t) => t.fg_made], ['fga', 'FGA', (t) => t.fg_att], ['fgpct', 'FG%', (t) => ratio(t.fg_made * 100, t.fg_att)],
			['lng', 'Lng', (t) => t.fg_long || null], ['xpm', 'XPM', (t) => t.pat_made], ['xpa', 'XPA', (t) => t.pat_att],
			['pts', 'Pts', (t) => t.fg_made * 3 + t.pat_made],
		],
	},
	{
		key: 'punting', title: 'Punting', has: ['pt_att'], sort: 'punts',
		columns: [
			['punts', 'Punts', (t) => t.pt_att], ['yds', 'Yds', (t) => t.pt_yards], ['avg', 'Avg', (t) => ratio(t.pt_yards, t.pt_att)],
			['lng', 'Lng', (t) => t.pt_long || null], ['in20', 'In 20', (t) => t.pt_inside_20],
		],
	},
	{
		key: 'returns', title: 'Returns', has: ['kickoff_returns', 'punt_returns'], sort: 'kryds',
		columns: [
			['kr', 'KR', (t) => t.kickoff_returns], ['kryds', 'KR Yds', (t) => t.kickoff_return_yards],
			['kravg', 'KR Avg', (t) => ratio(t.kickoff_return_yards, t.kickoff_returns)], ['pr', 'PR', (t) => t.punt_returns],
			['pryds', 'PR Yds', (t) => t.punt_return_yards], ['pravg', 'PR Avg', (t) => ratio(t.punt_return_yards, t.punt_returns)],
			['td', 'TD', (t) => t.special_teams_tds],
		],
	},
];

// The longest kick or punt is a maximum, not a sum.
const MAX = new Set(['fg_long', 'pt_long']);

/** Each player's totals over `rows`, keyed by player id: every stat column
 *  summed (longs taken as the maximum), games counted, and the name and
 *  position from the player's latest row. */
export function totalsByPlayer(rows) {
	const out = new Map();
	for (const r of rows) {
		let t = out.get(r.player_id);
		if (!t) {
			t = { id: r.player_id, name: r.player_display_name, pos: r.position, games: 0, seasons: new Set(), latest: '' };
			out.set(r.player_id, t);
		}
		t.games += 1;
		t.seasons.add(Number(r.season));
		const when = `${r.season}-${String(r.week).padStart(2, '0')}`;
		if (when >= t.latest) { t.latest = when; t.name = r.player_display_name || t.name; t.pos = r.position || t.pos; }
		for (const [k, v] of Object.entries(r)) {
			if (k === 'player_id' || k === 'player_display_name' || k === 'position' || k === 'season' || k === 'week' || k === 'season_type' || k === 'opponent_team') continue;
			t[k] = MAX.has(k) ? Math.max(t[k] ?? 0, n(v)) : (t[k] ?? 0) + n(v);
		}
	}
	return out;
}

const SEASON_TYPES = { REG: ['REG'], POST: ['POST'], ALL: ['REG', 'POST'] };

/** The rows of `season` (or every season, with null) of the given types. */
export function rowsOf(rows, { season = null, type = 'REG' } = {}) {
	const types = SEASON_TYPES[type] || SEASON_TYPES.REG;
	return rows.filter((r) => (season == null || Number(r.season) === Number(season)) && types.includes(r.season_type));
}

const belongs = (t, cat) => cat.has.some((c) => n(t[c]) > 0);

/** One category's table: a row a player who belongs in it, with games and
 *  each column's value, sorted by the category's own stat. */
export function categoryTable(totals, cat) {
	const rows = [];
	for (const t of totals.values()) {
		if (!belongs(t, cat)) continue;
		const row = { id: t.id, name: t.name, pos: t.pos, g: t.games };
		for (const [key, , get] of cat.columns) row[key] = get(withZeros(t));
		rows.push(row);
	}
	return rows.sort((a, b) => (b[cat.sort] ?? -Infinity) - (a[cat.sort] ?? -Infinity) || a.name.localeCompare(b.name));
}

// Every stat column present, as 0 when the player has none of it.
function withZeros(t) {
	return new Proxy(t, { get: (o, k) => (k in o ? o[k] : 0) });
}

/** Every category's table for a season. */
export function seasonTables(rows, season, type = 'REG') {
	const totals = totalsByPlayer(rowsOf(rows, { season, type }));
	return Object.fromEntries(CATEGORIES.map((c) => [c.key, categoryTable(totals, c)]));
}

/** The seasons the rows cover, newest first. */
export function seasonsOf(rows) {
	return [...new Set(rows.map((r) => Number(r.season)))].sort((a, b) => b - a);
}

/** The stats the leaders page ranks, each with how to read it off totals. */
export const LEADER_STATS = [
	['passing_yards', 'Passing yards', (t) => t.passing_yards],
	['passing_tds', 'Passing TDs', (t) => t.passing_tds],
	['rushing_yards', 'Rushing yards', (t) => t.rushing_yards],
	['rushing_tds', 'Rushing TDs', (t) => t.rushing_tds],
	['receptions', 'Receptions', (t) => t.receptions],
	['receiving_yards', 'Receiving yards', (t) => t.receiving_yards],
	['receiving_tds', 'Receiving TDs', (t) => t.receiving_tds],
	['tackles', 'Tackles', (t) => t.def_tackles_solo + t.def_tackle_assists],
	['def_sacks', 'Sacks', (t) => t.def_sacks],
	['def_interceptions', 'Interceptions', (t) => t.def_interceptions],
	['fg_made', 'Field goals', (t) => t.fg_made],
	['points', 'Kicking points', (t) => t.fg_made * 3 + t.pat_made],
];

/**
 * The top `limit` in each leader stat, for single seasons (one entry a
 * player a season) and careers (one a player, every season here summed).
 * Careers are Packers careers since 1999 only: nflverse has no player
 * stats before 1999, so a career that began earlier is counted from then.
 * Ties share the order they fall in by name.
 */
export function leaders(rows, { type = 'REG', limit = 10 } = {}) {
	const pick = rowsOf(rows, { type });
	const bySeason = [];
	for (const season of seasonsOf(pick)) {
		for (const t of totalsByPlayer(pick.filter((r) => Number(r.season) === season)).values()) bySeason.push({ t: withZeros(t), season });
	}
	const careers = [...totalsByPlayer(pick).values()].map((t) => ({ t: withZeros(t) }));
	const top = (entries, get) => entries
		.map((e) => ({ id: e.t.id, name: e.t.name, pos: e.t.pos, season: e.season ?? null, seasons: e.season ? null : seasonSpan(e.t.seasons), value: get(e.t) }))
		.filter((e) => e.value > 0)
		.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
		.slice(0, limit);
	return Object.fromEntries(LEADER_STATS.map(([key, title, get]) => [key, { title, season: top(bySeason, get), career: top(careers, get) }]));
}

function seasonSpan(set) {
	const s = [...set].sort((a, b) => a - b);
	return s.length ? (s[0] === s.at(-1) ? String(s[0]) : `${s[0]}–${s.at(-1)}`) : '';
}
