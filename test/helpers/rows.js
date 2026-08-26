// Building game rows by hand, so a test says what it is about.
//
// The CSV columns are positional and oddly named ('Packers Win' holds
// WIN/LOSS/TIE, regular_season is the string '1'), which makes a literal row
// object in a test read as noise. These helpers keep the shape in one place:
// when the CSV gains a column, this file changes and the tests do not.

/** One game. Defaults to a regular-season home win, because most games are. */
export function game({
	date = '2020-09-13',
	season = null,
	result = 'WIN',
	pf = 24,
	pa = 17,
	opponent = 'Chicago Bears',
	regular = true,
	superbowl = '',
	location = 'HOME',
} = {}) {
	return {
		date,
		// Almost every test wants the season to match the date, and saying so
		// twice is how they drift apart.
		season: String(season ?? date.slice(0, 4)),
		regular_season: regular ? '1' : '0',
		playoff: regular ? '0' : '1',
		superbowl,
		Opponent: opponent,
		'Packers Win': result,
		packers_score: String(pf),
		opponent_score: String(pa),
		location,
	};
}

/**
 * A run of games in one season, one per week from September.
 *
 * `results` is a compact string: 'WWLT' is win, win, loss, tie. Dates advance
 * a week at a time so ordering is realistic without every test spelling out a
 * calendar.
 */
export function season(year, results, { regular = true, opponent } = {}) {
	return [...results].map((code, i) => {
		const day = 6 + i * 7
		const month = 9 + Math.floor((day - 1) / 30)
		const dom = ((day - 1) % 30) + 1
		return game({
			date: `${year}-${String(month).padStart(2, '0')}-${String(dom).padStart(2, '0')}`,
			season: year,
			result: { W: 'WIN', L: 'LOSS', T: 'TIE' }[code],
			regular,
			...(opponent ? { opponent } : {}),
		})
	})
}

/** A date far enough past every fixture season that it counts as settled.
 *  seasonSettled() wants March of the following year, so tests that are not
 *  about that rule pass this and stop thinking about it. */
export const LONG_AFTER = new Date(2030, 5, 1)
