import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gameDetails, addsUp, cleanText } from '../lib/game-details.js'
import { withDetails } from '../lib/espn-box.js'
import { gamePageHtml, filledNote } from '../game-core.js'
import { parseGames } from '../records-core.js'

// Minnesota 30, Green Bay 25, 7 September 2003: ESPN's record has two
// scoring plays and four drives. Its 174 plays from nflverse, trimmed to the
// columns lib/game-details.js reads.
const plays = JSON.parse(readFileSync(new URL('./fixtures/pbp-2003-01-MIN-GB.json', import.meta.url), 'utf8'))
const d = gameDetails(plays)

test('the 2003 opener rebuilt: the score by quarter and every score, ending 30-25', () => {
	assert.deepEqual(d.quarters, { away: ['10', '10', '7', '3'], home: ['0', '3', '8', '14'] })
	assert.equal(d.scoring.length, 10)
	assert.deepEqual([d.scoring.at(-1).away, d.scoring.at(-1).home], [30, 25])
	assert.ok(addsUp(d, 30, 25))
})

test('a try is folded into its touchdown, as a box score shows it', () => {
	const first = d.scoring[0]
	assert.deepEqual([first.quarter, first.clock, first.side, first.type, first.away, first.home], [1, '9:28', 'away', 'TD', 7, 0])
	assert.match(first.text, /^D\.Culpepper pass to J\.Avery for 11 yards, TOUCHDOWN\. \(kick\)$/)
	assert.match(d.scoring.find((s) => /A\.Green left end/.test(s.text)).text, /\(two-point conversion\)$/)
	assert.ok(!d.scoring.some((s) => /extra point is GOOD/.test(s.text)))
})

test('drives: who, when, from where, how far and how they ended', () => {
	assert.ok(d.drives.length >= 20)
	assert.deepEqual(d.drives[0], { side: 'away', quarter: 1, start: '15:00', from: 'MIN 24', summary: '10 plays, 65 yards, 5:32', result: 'Touchdown', score: true })
	// From the Green Bay 48 to the Green Bay 3 is 45 yards for Minnesota.
	assert.equal(d.drives.find((x) => x.from === 'GB 48').summary, '10 plays, 45 yards, 4:34')
})

const p = (o) => ({ home_team: 'GB', away_team: 'CHI', posteam: 'GB', qtr: '1', time: '10:00', desc: '', total_home_score: '0', total_away_score: '0', touchdown: '0', field_goal_result: '', safety: '0', fixed_drive: '', ...o })

test("who scored is whose score went up, not who had the ball", () => {
	// Chicago has the ball; Green Bay returns an interception for a touchdown,
	// then a safety against Chicago.
	const x = gameDetails([
		p({ posteam: 'CHI', desc: 'J.Fields pass INTERCEPTED by D.Savage, returned for TOUCHDOWN.', touchdown: '1', total_home_score: '6' }),
		p({ posteam: 'GB', desc: 'A.Carlson extra point is GOOD.', total_home_score: '7' }),
		p({ posteam: 'CHI', qtr: '2', desc: 'J.Fields sacked in end zone, SAFETY.', safety: '1', total_home_score: '9' }),
	])
	assert.deepEqual(x.scoring.map((s) => [s.side, s.type, s.home]), [['home', 'TD', 7], ['home', 'SF', 9]])
	assert.deepEqual(x.quarters.home, ['7', '2', '0', '0'])
})

test("a game whose scores land on the wrong sides does not add up, and is not used", () => {
	// Green Bay at Jacksonville, 3 December 2001, 28-21: nflverse's running
	// scores put Jacksonville's touchdowns on Green Bay's side and add up to
	// 40-9. Here, the same kind of swap.
	const swapped = gameDetails([p({ touchdown: '1', total_away_score: '6' }), p({ total_away_score: '7' })])
	assert.equal(addsUp(swapped, 0, 7), false)
	assert.equal(addsUp(swapped, 7, 0), true)
})

test('a score corrected downward can leave the quarters right and the scoring list wrong', () => {
	// Quarters count only what was gained, so a 7 later corrected to 4 still
	// sums to 7 there while the list ends at 4: the two checks part only
	// when a running score goes down, and the last score is what catches it.
	const corrected = gameDetails([
		p({ touchdown: '1', total_home_score: '6' }),
		p({ total_home_score: '7' }),
		p({ qtr: '2', total_home_score: '4' }),
	])
	assert.deepEqual(corrected.quarters.home, ['7', '0', '0', '0'])
	assert.equal(corrected.scoring.at(-1).home, 7)
	assert.equal(addsUp({ ...corrected, scoring: [...corrected.scoring, { away: 0, home: 4 }] }, 0, 7), false)
})

test('play text without the clock, formation, jersey numbers, snapper or holder', () => {
	assert.equal(cleanText('(9:28) (Shotgun) 11-D.Culpepper pass to 33-J.Avery for 11 yards, TOUCHDOWN.'), 'D.Culpepper pass to J.Avery for 11 yards, TOUCHDOWN.')
	assert.equal(cleanText('(1:55) 8-A.Elling 22 yard field goal is GOOD, Center-43-B.Liddiard, Holder-12-G.Frerotte.'), 'A.Elling 22 yard field goal is GOOD.')
	assert.equal(cleanText('(:08) 8-A.Elling 46 yard field goal is GOOD, Center-B.Liddiard, Holder-G.Frerotte.'), 'A.Elling 46 yard field goal is GOOD.')
})

test('running out the clock in the fourth quarter ends the game, not the half', () => {
	const x = gameDetails([p({ fixed_drive: '9', qtr: '4', drive_quarter_start: '4', drive_start_yard_line: 'GB 6', drive_end_yard_line: 'GB 40', drive_play_count: '12', drive_time_of_possession: '6:08', fixed_drive_result: 'End of half' })])
	assert.equal(x.drives[0].result, 'End of game')
})

const espnBox = (coverage) => ({
	final: true, coverage, filled: undefined,
	away: { abbr: 'MIN', short: 'Vikings', name: 'Minnesota Vikings', score: '30', quarters: [] },
	home: { abbr: 'GB', short: 'Packers', name: 'Green Bay Packers', score: '25', quarters: [] },
	scoring: [{ quarter: 1, side: 'away', type: 'TD', text: 'ESPN text', away: 7, home: 0 }],
	drives: [], teamStats: [], players: { away: [], home: [] }, teamSide: 'home', status: 'Final', date: '2003-09-07',
})

test('only what ESPN lacks is filled, and the page says where it came from', () => {
	const box = withDetails(espnBox({ quarters: true, scoring: false, drives: false }), d)
	assert.deepEqual(box.filled, ['scoring', 'drives'])
	assert.deepEqual(box.coverage, { quarters: true, scoring: true, drives: true })
	// ESPN's quarters were whole, so they stay ESPN's.
	assert.deepEqual(box.home.quarters, [])
	assert.equal(box.scoring.length, 10)
	assert.match(filledNote(box), /The scoring plays and the drives from <a [^>]*>nflverse<\/a> play-by-play/)
	assert.match(gamePageHtml(box), />Drives</)
	// A whole ESPN record is left as it is, and a game being played too.
	assert.deepEqual(withDetails(espnBox({ quarters: true, scoring: true, drives: true }), d).filled, [])
	assert.equal(withDetails({ ...espnBox({}), final: false }, d).filled, undefined)
	assert.equal(withDetails(espnBox({ quarters: false, scoring: false, drives: false }), undefined).filled, undefined)
})

// The committed file: every game it has adds up to that game's result.
const details = JSON.parse(readFileSync(new URL('../data/packers_game_details.json', import.meta.url), 'utf8'))
const games = parseGames(readFileSync(new URL('../data/packers_games.csv', import.meta.url), 'utf8'))

test('every game in the details file adds up to its result, and nearly every past game since 1999 is there', () => {
	const past = games.filter((g) => g.espnId && Number(g.season) >= 1999 && Number(g.season) < 2026)
	const have = past.filter((g) => details[g.espnId])
	assert.ok(have.length / past.length > 0.99, `${have.length} of ${past.length}`)
	for (const g of have) {
		const det = details[g.espnId]
		const [us, them] = [Number(g.scoreFor), Number(g.scoreAgainst)]
		assert.ok(addsUp(det, them, us) || addsUp(det, us, them), `${g.date} ${g.Opponent}`)
	}
	// The one known not to add up is not in it.
	assert.equal(details['211203030'], undefined)
})
