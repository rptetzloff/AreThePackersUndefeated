// Each Packers game's crowd, 1999 on, from ESPN's game summary (gameInfo.
// attendance; nflverse's schedules have none). update-data.js writes past
// games' to data/packers_attendance.csv, fetching only the games the file
// lacks: a finished game's crowd does not change. The season being played
// is read from ESPN at runtime, through the server's cache.
//
// Pure: no fetch, no fs.

/** The crowd from an ESPN summary: a whole number, or null where ESPN has
 *  none. 0 is kept: 2020's games were played to empty stadiums. */
export function attendanceOf(summary) {
	const n = summary?.gameInfo?.attendance;
	return Number.isInteger(n) && n >= 0 ? n : null;
}

/** The committed file: espn_id,attendance, a line a game, by id. A game
 *  ESPN had no crowd for is kept with an empty attendance, so it is not
 *  asked for again. */
export function attendanceToCsv(byId) {
	const rows = [...byId].sort(([a], [b]) => a.localeCompare(b)).map(([id, n]) => `${id},${n ?? ''}`);
	return ['espn_id,attendance', ...rows].join('\n') + '\n';
}

/** The committed file as a Map of ESPN id to crowd (null where ESPN had
 *  none). */
export function parseAttendance(csv) {
	const out = new Map();
	for (const line of csv.split('\n').slice(1)) {
		const [id, n] = line.trim().split(',');
		if (id) out.set(id, n === '' || n === undefined ? null : Number(n));
	}
	return out;
}
