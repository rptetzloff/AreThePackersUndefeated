// The Stadiums page: Lambeau Field, the weather, the crowds, every road
// stadium and every referee, from the games CSV's game-day columns (nflverse's
// schedules, CC BY 4.0, 1999 on) and ESPN's attendance (lib/attendance.js).
// Nothing before 1999: no source this site can use has the weather, the
// stadium or the referee for an earlier game, so the Ice Bowl (-13°F, 1967)
// is not on the coldest list, and the page says so.
//
// Pure: the server passes the rows and the crowds in.

const RESULT = { WIN: 'W', LOSS: 'L', TIE: 'T' };
// Indoors, the temperature and wind nflverse leaves blank mean nothing for
// the game; a retractable roof left open is outdoors.
const INDOORS = new Set(['dome', 'closed']);
// Desso GrassMaster is natural grass stitched with fibres (Lambeau's own);
// every other surface nflverse names is artificial.
const GRASS = new Set(['grass', 'dessograss']);

const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

/** A crowd from ESPN's figure. 0 is an empty stadium in 2020 only, when
 *  games were played without fans; any other season's 0 is a crowd ESPN did
 *  not record (the 2012 divisional round at Lambeau, a full house, reads 0). */
export function crowdOf(n, season) {
	if (n == null) return null;
	return n === 0 && season !== 2020 ? null : n;
}

/** A game's row for the page, or null for one not played or before 1999. */
export function gameDayGame(r, attendance) {
	const season = Number(r.season);
	const result = RESULT[r.result];
	if (!result || season < 1999) return null;
	const indoors = INDOORS.has(r.roof);
	return {
		espnId: r.espnId || '', date: r.date, season, opponent: r.Opponent,
		location: r.location, home: r.location === 'HOME', regular: r.regular_season === '1',
		result, pf: Number(r.scoreFor) || 0, pa: Number(r.scoreAgainst) || 0,
		stadium: r.stadium || '', roof: r.roof || '', surface: r.surface || '', indoors,
		temp: indoors ? null : num(r.temp),
		wind: indoors ? null : num(r.wind),
		referee: r.referee || '',
		crowd: crowdOf(attendance?.get(r.espnId) ?? null, season),
	};
}

/** W–L–T over games, ties shown only when there are any. */
export function tally(games) {
	let w = 0, l = 0, t = 0;
	for (const g of games) { if (g.result === 'W') w++; else if (g.result === 'L') l++; else t++; }
	const n = w + l + t;
	return { games: n, w, l, t, record: t ? `${w}–${l}–${t}` : `${w}–${l}`, winPct: n ? (w + t / 2) / n : null };
}

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
const span = (games) => {
	const s = games.map((g) => g.season);
	return { first: Math.min(...s), last: Math.max(...s) };
};

/** The game-day boards over a pool, top `n` of each, ties to the earlier
 *  game. Crowds leave out 2020's empty stadiums: a board of zeros says
 *  nothing about who came. */
export function gameDayBoards(pool, n) {
	const board = (list, key, dir) => list
		.filter((g) => g[key] !== null)
		.sort((a, b) => dir * (a[key] - b[key]) || byDate(a, b))
		.slice(0, n);
	const crowds = pool.filter((g) => g.crowd > 0);
	return {
		coldest: board(pool, 'temp', 1),
		hottest: board(pool, 'temp', -1),
		windiest: board(pool, 'wind', -1),
		biggestCrowds: board(crowds, 'crowd', -1),
		smallestCrowds: board(crowds, 'crowd', 1),
	};
}

// The conditions the record is split by, each a test of a game.
const CONDITIONS = [
	['Below freezing', '32°F or colder', (g) => g.temp !== null && g.temp <= 32],
	['Cold', '33–49°F', (g) => g.temp !== null && g.temp >= 33 && g.temp <= 49],
	['Mild', '50–69°F', (g) => g.temp !== null && g.temp >= 50 && g.temp <= 69],
	['Warm', '70°F or warmer', (g) => g.temp !== null && g.temp >= 70],
	['Windy', 'wind 15 mph or more', (g) => g.wind !== null && g.wind >= 15],
	['Indoors', 'dome or closed roof', (g) => g.indoors],
	['On grass', 'natural grass', (g) => GRASS.has(g.surface)],
	['On artificial turf', 'any other surface', (g) => g.surface !== '' && !GRASS.has(g.surface)],
];

/** Everything the Stadiums page shows. `rows` are parseGames rows (the
 *  CSV's, with the season being played from nflverse where it has more),
 *  `attendance` a Map of ESPN id to crowd. */
export function stadiumStats(rows, attendance, { top = 10 } = {}) {
	const games = rows.map((r) => gameDayGame(r, attendance)).filter(Boolean).sort(byDate);
	if (!games.length) return null;
	const home = games.filter((g) => g.home);
	const road = games.filter((g) => !g.home);

	const lambeau = (() => {
		const at = home.filter((g) => g.stadium === 'Lambeau Field');
		if (!at.length) return null;
		const own = gameDayBoards(at, 1);
		const crowds = at.filter((g) => g.crowd > 0);
		return {
			...span(at),
			games: at.length,
			regular: tally(at.filter((g) => g.regular)),
			postseason: tally(at.filter((g) => !g.regular)),
			averageCrowd: crowds.length ? Math.round(crowds.reduce((s, g) => s + g.crowd, 0) / crowds.length) : null,
			biggestCrowd: own.biggestCrowds[0] || null,
			coldest: own.coldest[0] || null,
			hottest: own.hottest[0] || null,
			windiest: own.windiest[0] || null,
			firstGame: at[0],
			latestGame: at.at(-1),
		};
	})();

	const conditions = CONDITIONS.map(([label, note, test]) => {
		const all = games.filter(test);
		return { label, note, all: tally(all), lambeau: tally(all.filter((g) => g.home)), road: tally(all.filter((g) => !g.home)) };
	}).filter((c) => c.all.games > 0);

	const groupBy = (list, key) => {
		const m = new Map();
		for (const g of list) { if (!g[key]) continue; if (!m.has(g[key])) m.set(g[key], []); m.get(g[key]).push(g); }
		return [...m].map(([name, gs]) => ({ name, ...span(gs), ...tally(gs), latestGame: gs.at(-1) }))
			.sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
	};

	return {
		range: span(games),
		games: games.length,
		lambeau,
		conditions,
		...gameDayBoards(games, top),
		// Away and neutral sites: Lambeau is the only home since 1999.
		roadStadiums: groupBy(road, 'stadium'),
		referees: groupBy(games, 'referee'),
		weatherGames: games.filter((g) => g.temp !== null).length,
		indoorGames: games.filter((g) => g.indoors).length,
		crowdGames: games.filter((g) => g.crowd !== null).length,
	};
}
