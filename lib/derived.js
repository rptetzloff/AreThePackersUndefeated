// Everything the server derives from the games — records, history,
// head-to-head, coaches — for the games as they stand now: the CSV's seasons
// plus the season being played (lib/current-season.js). Computed once per
// version of the season being played, so between games it is computed once,
// not on every request.
import { recordsData } from './records.js';
import { h2hData } from './h2h.js';
import { coachesData } from './coaches.js';

let memo = null;

/** `games` with the season being played pooled in, and `version`, which
 *  changes exactly when they do. */
export function derive(games, version) {
	if (memo?.version === version) return memo;
	const { records, seasonHistory } = recordsData(games);
	memo = { version, games, records, seasonHistory, h2h: h2hData(games), coaches: coachesData(games, seasonHistory) };
	return memo;
}
