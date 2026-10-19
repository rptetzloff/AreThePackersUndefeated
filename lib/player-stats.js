// The Packers' rows of nflverse's weekly player stats (stats_player_week,
// CC BY 4.0, 1999 on): one row per player per game, the columns a stats page
// uses. update-data.js writes every season to data/packers_player_games.csv;
// the server reads the season being played from nflverse at runtime, as it
// reads that season's games from ESPN (lib/current-season.js).
//
// Pure: no fetch, no fs. A row keeps nflverse's own column names, so a column
// here can be looked up in nflverse's data dictionary as it is.

export const ID_COLUMNS = ['player_id', 'player_display_name', 'position', 'season', 'week', 'season_type', 'opponent_team'];

export const STAT_COLUMNS = [
	// passing
	'completions', 'attempts', 'passing_yards', 'passing_tds', 'passing_interceptions', 'sacks_suffered', 'sack_yards_lost',
	// rushing and receiving
	'carries', 'rushing_yards', 'rushing_tds', 'receptions', 'targets', 'receiving_yards', 'receiving_tds', 'fumbles_lost_total',
	// defense
	'def_tackles_solo', 'def_tackle_assists', 'def_tackles_for_loss', 'def_sacks', 'def_qb_hits', 'def_interceptions',
	'def_interception_yards', 'def_pass_defended', 'def_fumbles_forced', 'fumble_recovery_opp', 'def_tds',
	// kicking and punting
	'fg_made', 'fg_att', 'fg_long', 'pat_made', 'pat_att', 'pt_att', 'pt_yards', 'pt_long', 'pt_inside_20',
	// returns
	'punt_returns', 'punt_return_yards', 'kickoff_returns', 'kickoff_return_yards', 'special_teams_tds',
];

export const PLAYER_COLUMNS = [...ID_COLUMNS, ...STAT_COLUMNS];

// A quoted CSV field may hold a comma (nflverse's fg_made_list does), so
// the line is split the long way.
function split(line) {
	const out = [];
	let cur = '';
	let q = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (q) {
			if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
		} else if (c === '"') q = true;
		else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
	}
	out.push(cur);
	return out;
}

/** The Packers' rows of one stats_player_week file, as objects keyed by
 *  PLAYER_COLUMNS. nflverse's NA and a stat of 0 both come out empty. */
export function packersPlayerRows(csvText, team = 'GB') {
	const lines = csvText.replace(/\r/g, '').trim().split('\n');
	const head = split(lines[0]);
	const at = Object.fromEntries(head.map((h, i) => [h, i]));
	const missing = PLAYER_COLUMNS.filter((c) => at[c] === undefined);
	if (missing.length) throw new Error(`stats_player_week is missing ${missing.join(', ')}`);
	const rows = [];
	for (const line of lines.slice(1)) {
		const v = split(line);
		if (v[at.team] !== team) continue;
		const r = {};
		for (const c of PLAYER_COLUMNS) {
			const x = v[at[c]] ?? '';
			r[c] = x === 'NA' || (STAT_COLUMNS.includes(c) && Number(x) === 0) ? '' : x;
		}
		rows.push(r);
	}
	return rows;
}

const field = (v) => {
	const t = String(v ?? '');
	return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** Rows as CSV text, PLAYER_COLUMNS in order, sorted by season, week and
 *  player so a regenerated file diffs by the games that changed. */
export function playerRowsToCsv(rows) {
	const sorted = [...rows].sort((a, b) => Number(a.season) - Number(b.season) || Number(a.week) - Number(b.week) || a.player_id.localeCompare(b.player_id));
	return [PLAYER_COLUMNS.join(','), ...sorted.map((r) => PLAYER_COLUMNS.map((c) => field(r[c])).join(','))].join('\n') + '\n';
}

/** The committed file (or the runtime season) back into rows. */
export function parsePlayerGames(csvText) {
	const lines = csvText.replace(/\r/g, '').trim().split('\n');
	const head = split(lines[0]);
	return lines.slice(1).map((l) => {
		const v = split(l);
		return Object.fromEntries(head.map((h, i) => [h, v[i] ?? '']));
	});
}
