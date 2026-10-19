// A past game's quarters, scoring plays and drives, from nflverse's
// play-by-play (CC BY 4.0), in the shapes lib/espn-box.js gives ESPN's: for
// the box score sections ESPN's older records lack. ESPN has no quarters,
// scoring or drives for 1999, quarters only for 2000, and from 2001 is whole
// for most games but not all (the 2003 opener, 30-25, has two scoring plays
// and four drives); nflverse has every play of every game from 1999.
//
// Pure: update-data.js streams the season files through it and commits the
// result as data/packers_game_details.json, keyed by ESPN's game id.

/** The play-by-play columns this reads. */
export const PBP_COLUMNS = [
	'game_id', 'home_team', 'away_team', 'posteam', 'qtr', 'time', 'desc', 'play_type',
	'total_home_score', 'total_away_score', 'touchdown', 'field_goal_result', 'safety',
	'fixed_drive', 'fixed_drive_result', 'drive_play_count', 'drive_time_of_possession',
	'drive_quarter_start', 'drive_game_clock_start', 'drive_start_yard_line', 'drive_end_yard_line',
];

// "(9:28) (Shotgun) 11-D.Culpepper pass to 33-J.Avery for 11 yards, TOUCHDOWN."
// -> "D.Culpepper pass to J.Avery for 11 yards, TOUCHDOWN." The clock is
// shown on its own, formation notes say nothing a box score needs, and the
// jersey numbers were dropped from play text after 2000s.
export function cleanText(desc) {
	return String(desc || '')
		.replace(/^\(\d{1,2}:\d{2}\)\s*/, '')
		.replace(/^\(:\d{2}\)\s*/, '')
		.replace(/\((?:Shotgun|No Huddle|No Huddle, Shotgun|Punt formation|Run formation|Field Goal formation)\)\s*/gi, '')
		.replace(/\b\d{1,2}-(?=[A-Z][a-zA-Z]*\.)/g, '')
		// Who snapped and held a kick, which ESPN's text leaves out too.
		.replace(/,\s*Center-[^,.]+(?:\.[^,.]+)?(?:,\s*Holder-[^,.]+(?:\.[^,.]+)?)?/g, '')
		.trim();
}

const clock = (t) => String(t || '').replace(/^0(?=\d:)/, '');

// Yards to the opponent's goal from a line like "GB 26", for the team with
// the ball. "MID 50" or "50" is midfield.
function toGo(line, team) {
	const m = String(line || '').match(/^([A-Z]{2,3})?\s*(\d{1,2})$/);
	if (!m) return null;
	const n = Number(m[2]);
	if (n === 50 || !m[1] || m[1] === 'MID') return 50;
	return m[1] === team ? 100 - n : n;
}

/**
 * One game's details from its plays, in order: each play an object keyed by
 * PBP_COLUMNS. Who scored is read from which score went up, not from who had
 * the ball, so a defensive or return touchdown and a safety land with the
 * side that scored. An extra point or two-point try is folded into the
 * touchdown before it, as a box score shows it.
 */
export function gameDetails(plays) {
	const first = plays[0];
	if (!first) return null;
	const home = first.home_team;
	const away = first.away_team;
	const quarters = { away: [], home: [] };
	const scoring = [];
	let prev = { away: 0, home: 0 };
	for (const p of plays) {
		const now = { away: Number(p.total_away_score) || 0, home: Number(p.total_home_score) || 0 };
		const q = Number(p.qtr) || 1;
		const gained = { away: now.away - prev.away, home: now.home - prev.home };
		if (gained.away > 0 || gained.home > 0) {
			const side = gained.home > 0 ? 'home' : 'away';
			const pts = gained[side];
			for (const s of ['away', 'home']) {
				while (quarters[s].length < q) quarters[s].push(0);
				quarters[s][q - 1] += gained[s] > 0 ? gained[s] : 0;
			}
			const last = scoring.at(-1);
			const conversion = /extra point|two-point|two point/i.test(p.desc) && !/touchdown/i.test(p.desc);
			if (conversion && last && last.side === side && last.type === 'TD') {
				// Fold the try into its touchdown: the running score moves on,
				// and the text says how the try went.
				last.away = now.away;
				last.home = now.home;
				last.text += pts === 1 ? ' (kick)' : pts === 2 ? ' (two-point conversion)' : '';
			} else {
				scoring.push({
					quarter: q,
					clock: clock(p.time),
					side,
					type: p.touchdown === '1' || pts === 6 ? 'TD' : p.field_goal_result === 'made' || pts === 3 ? 'FG' : p.safety === '1' || pts === 2 ? 'SF' : 'PTS',
					text: cleanText(p.desc),
					away: now.away,
					home: now.home,
				});
			}
			prev = now;
		}
		for (const s of ['away', 'home']) while (quarters[s].length < q) quarters[s].push(0);
	}
	// Quarters as text, as ESPN's are; regulation's four even if one was blank.
	for (const s of ['away', 'home']) {
		while (quarters[s].length < 4) quarters[s].push(0);
		quarters[s] = quarters[s].map(String);
	}

	const drives = [];
	const seen = new Set();
	for (const p of plays) {
		const d = p.fixed_drive;
		if (!d || d === 'NA' || seen.has(d) || !p.posteam || !p.drive_start_yard_line) continue;
		seen.add(d);
		const start = toGo(p.drive_start_yard_line, p.posteam);
		const end = toGo(p.drive_end_yard_line, p.posteam);
		const yards = start != null && end != null ? start - end : null;
		const count = Number(p.drive_play_count) || 0;
		drives.push({
			side: p.posteam === home ? 'home' : p.posteam === away ? 'away' : null,
			quarter: Number(p.drive_quarter_start) || null,
			start: clock(p.drive_game_clock_start),
			from: p.drive_start_yard_line,
			summary: [`${count} play${count === 1 ? '' : 's'}`, yards != null ? `${yards} yard${Math.abs(yards) === 1 ? '' : 's'}` : null, p.drive_time_of_possession].filter(Boolean).join(', '),
			// nflverse calls running out the clock "End of half" at the end of
			// the game too.
			result: p.fixed_drive_result === 'End of half' && Number(p.drive_quarter_start) >= 4 ? 'End of game' : (p.fixed_drive_result || ''),
			score: /^(Touchdown|Field goal)$/i.test(p.fixed_drive_result || ''),
		});
	}
	return { quarters, scoring, drives };
}

/**
 * Whether a game's details add up to its final score: the quarters summed
 * and the last scoring play's running score. Not always so in nflverse's
 * play-by-play: Green Bay at Jacksonville, 3 December 2001, 28-21, has its
 * running scores on the wrong sides partway through (Mark Brunell's
 * touchdown credited to Green Bay) and adds up to 40-9. A game that fails is
 * left out, and its page keeps ESPN's record with what that lacks said.
 */
export function addsUp(details, away, home) {
	const sum = (qs) => qs.reduce((s, q) => s + Number(q), 0);
	const last = details.scoring.at(-1) || { away: 0, home: 0 };
	return sum(details.quarters.away) === Number(away) && sum(details.quarters.home) === Number(home)
		&& last.away === Number(away) && last.home === Number(home);
}
