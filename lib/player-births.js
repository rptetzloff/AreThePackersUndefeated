// The Packers' birth dates, from nflverse's players.csv (CC BY 4.0): every
// player in the league's records, about 25,000, with a birth date for all but
// a few dozen. The site needs the 645 who have played for Green Bay since
// 1999. update-data.js writes theirs to data/packers_player_births.csv; the
// server adds anyone the file lacks (a rookie in the season being played)
// from nflverse at runtime.
//
// Pure: no fetch, no fs.
import { splitCsvLine } from '../records-core.js';

/** Birth dates ("1983-12-02") from players.csv, by player id, for the ids
 *  asked for only. */
export function birthDates(csv, ids) {
	const lines = csv.split('\n');
	const head = splitCsvLine(lines[0]);
	const I = head.indexOf('gsis_id');
	const B = head.indexOf('birth_date');
	const out = new Map();
	if (I < 0 || B < 0) return out;
	for (const line of lines.slice(1)) {
		// The id is the first column, so a line not starting with one asked
		// for is skipped before it is split.
		if (I === 0 && !ids.has(line.slice(0, line.indexOf(',')))) continue;
		const row = splitCsvLine(line);
		const id = row[I];
		if (!ids.has(id)) continue;
		const born = row[B];
		if (/^\d{4}-\d{2}-\d{2}$/.test(born)) out.set(id, born);
	}
	return out;
}

/** The committed file: player_id,birth_date, a line a player, by id. */
export function birthsToCsv(births) {
	const rows = [...births].sort(([a], [b]) => a.localeCompare(b)).map(([id, born]) => `${id},${born}`);
	return ['player_id,birth_date', ...rows].join('\n') + '\n';
}

export function parseBirths(csv) {
	const out = new Map();
	for (const line of csv.split('\n').slice(1)) {
		const [id, born] = line.trim().split(',');
		if (id && born) out.set(id, born);
	}
	return out;
}
