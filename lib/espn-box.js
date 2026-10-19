// A game's box score for /game/<ESPN event id>, boiled down from ESPN's
// game summary: who played where, the score by quarter, the scoring plays,
// the team stats side by side, each team's player tables, and the drives.
// The summary is about 600KB for a finished game; this is a few tens of KB,
// and the page polls it every 15 seconds during a game.
//
// The Brewers repo's espn-box-core.js does the same for baseball and shares
// nothing with this but the idea: innings, pitchers and fielding have no
// football counterpart, and football's player tables come from ESPN already
// labelled, so they pass through as labels and rows rather than being
// rebuilt field by field.
//
// Pure: no fetch, no DOM. ESPN covers the season being played, and every
// past season it has an event id for; the CSV has no ids, so a past
// season's games have no page yet.

const TEAM_ID = 'GB';

// The game's date in Green Bay: ESPN gives UTC, and a night game is already
// tomorrow there. Sunday Night Football on the 18th is 00:20Z on the 19th.
function localDate(iso) {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
	const get = (t) => parts.find((p) => p.type === t)?.value;
	return `${get('year')}-${get('month')}-${get('day')}`;
}

// The categories in the order a football box score reads, and what to call
// them. ESPN sends the same ten, but its order is not this one in every
// summary, and its names are keys rather than headings.
const CATEGORIES = [
	['passing', 'Passing'],
	['rushing', 'Rushing'],
	['receiving', 'Receiving'],
	['fumbles', 'Fumbles'],
	['defensive', 'Defense'],
	['interceptions', 'Interceptions'],
	['kickReturns', 'Kick Returns'],
	['puntReturns', 'Punt Returns'],
	['kicking', 'Kicking'],
	['punting', 'Punting'],
];

// The team stats worth a row, in reading order. ESPN sends about 25,
// several of which say the same thing twice (yards per pass and net passing
// yards per pass); these are the ones a box score prints.
const TEAM_STATS = [
	'firstDowns', 'thirdDownEff', 'fourthDownEff', 'totalOffensivePlays', 'totalYards', 'yardsPerPlay',
	'netPassingYards', 'completionAttempts', 'yardsPerPass', 'sacksYardsLost',
	'rushingYards', 'rushingAttempts', 'yardsPerRushAttempt',
	'redZoneAttempts', 'totalPenaltiesYards', 'turnovers', 'fumblesLost', 'interceptions', 'possessionTime',
];

function team(c) {
	return {
		abbr: c.team?.abbreviation || '',
		name: c.team?.displayName || '',
		short: c.team?.shortDisplayName || c.team?.name || '',
		score: c.score ?? '',
		record: c.record?.[0]?.summary || '',
		quarters: (c.linescores || []).map((l) => l.displayValue ?? ''),
		winner: Boolean(c.winner),
	};
}

/** The box score for the game page from ESPN's summary body, or null when
 *  it has no game in it. */
export function espnBoxscore(summary) {
	const comp = summary?.header?.competitions?.[0];
	const awayC = comp?.competitors?.find((c) => c.homeAway === 'away');
	const homeC = comp?.competitors?.find((c) => c.homeAway === 'home');
	if (!awayC || !homeC) return null;
	const status = comp.status?.type || {};
	const away = team(awayC);
	const home = team(homeC);
	const side = (abbr) => (abbr === home.abbr ? 'home' : abbr === away.abbr ? 'away' : null);

	const statsBy = (abbr) => new Map(((summary.boxscore?.teams || []).find((t) => t.team?.abbreviation === abbr)?.statistics || [])
		.map((s) => [s.name, s]));
	const awayStats = statsBy(away.abbr);
	const homeStats = statsBy(home.abbr);
	const teamStats = TEAM_STATS
		.filter((name) => awayStats.has(name) || homeStats.has(name))
		.map((name) => ({
			label: (awayStats.get(name) || homeStats.get(name)).label,
			away: awayStats.get(name)?.displayValue ?? '',
			home: homeStats.get(name)?.displayValue ?? '',
		}));

	const players = { away: [], home: [] };
	for (const p of summary.boxscore?.players || []) {
		const s = side(p.team?.abbreviation);
		if (!s) continue;
		const byName = new Map((p.statistics || []).map((c) => [c.name, c]));
		for (const [key, title] of CATEGORIES) {
			const c = byName.get(key);
			if (!c?.athletes?.length) continue;
			players[s].push({
				key, title,
				labels: c.labels || [],
				rows: c.athletes.map((a) => ({ name: a.athlete?.displayName || '', jersey: a.athlete?.jersey || '', stats: a.stats || [] })),
				totals: c.totals?.length ? c.totals : null,
			});
		}
	}

	const scoring = (summary.scoringPlays || []).map((p) => ({
		quarter: p.period?.number ?? null,
		clock: p.clock?.displayValue || '',
		side: side(p.team?.abbreviation),
		type: p.type?.abbreviation || '',
		text: p.text || '',
		away: p.awayScore ?? '',
		home: p.homeScore ?? '',
	}));

	const drives = (summary.drives?.previous || []).map((d) => ({
		side: side(d.team?.abbreviation),
		quarter: d.start?.period?.number ?? null,
		start: d.start?.clock?.displayValue || '',
		from: d.start?.text || '',
		summary: d.description || '',
		result: d.displayResult || d.result || '',
		score: Boolean(d.isScore),
	}));

	const live = status.state === 'in';
	const sit = summary.situation;
	const info = summary.gameInfo || {};
	const addr = info.venue?.address || {};
	return {
		id: String(comp.id || ''),
		final: Boolean(status.completed),
		live,
		state: status.state || '',
		status: status.shortDetail || status.detail || '',
		kickoff: comp.date || '',
		date: localDate(comp.date),
		season: summary.header?.season?.year ?? null,
		seasonType: summary.header?.season?.type ?? null,
		week: summary.header?.week ?? null,
		venue: info.venue?.fullName || '',
		city: [addr.city, addr.state].filter(Boolean).join(', '),
		attendance: Number(info.attendance) || null,
		broadcast: comp.broadcasts?.[0]?.media?.shortName || '',
		teamSide: side(TEAM_ID),
		away, home,
		scoring, teamStats, players, drives,
		situation: live && sit ? {
			downDistance: sit.downDistanceText || sit.shortDownDistanceText || '',
			possession: side(awayC.team?.id === sit.possession ? away.abbr : homeC.team?.id === sit.possession ? home.abbr : ''),
			lastPlay: sit.lastPlay?.text || '',
		} : null,
	};
}
