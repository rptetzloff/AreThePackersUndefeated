import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { espnBoxscore, coverageOf, withGameDay } from '../lib/espn-box.js'
import { gamePageHtml, gameSummaryHtml, gameDayLine, missingNote } from '../game-core.js'
import { parseGames, seasonBeingPlayed } from '../records-core.js'

// Past seasons' box scores: ESPN ids from nflverse's games.csv, the
// game-day details beside them, and ESPN's patchy older records.

const final = espnBoxscore(JSON.parse(readFileSync(new URL('./fixtures/espn-final-401872990.json', import.meta.url), 'utf8')))
const team = (score, quarters = ['7', '7', '7', '7']) => ({ score, quarters })

test('a whole game: every section counts as there', () => {
	assert.deepEqual(final.coverage, { quarters: true, scoring: true, drives: true })
	assert.equal(missingNote(final), '')
})

test('scoring plays are whole only when the last running score is the final score', () => {
	// The 2003 opener, Minnesota 30, Green Bay 25: ESPN has two scoring plays.
	const partial = coverageOf({ away: team('30'), home: team('25'), final: true, drives: [], scoring: [{ away: 7, home: 0 }, { away: 7, home: 7 }] })
	assert.equal(partial.scoring, false)
	const whole = coverageOf({ away: team('30'), home: team('25'), final: true, drives: [], scoring: [{ away: 7, home: 0 }, { away: 30, home: 25 }] })
	assert.equal(whole.scoring, true)
	// 0-0 has nothing to list, and that is whole.
	assert.equal(coverageOf({ away: team('0'), home: team('0'), final: true, drives: [], scoring: [] }).scoring, true)
})

test('1999: no quarters, no scoring plays, no drives, and the page says so', () => {
	const c = coverageOf({ away: team('24', []), home: team('28', []), final: true, drives: [], scoring: [] })
	assert.deepEqual(c, { quarters: false, scoring: false, drives: false })
	const box = { ...final, coverage: c }
	assert.match(missingNote(box), /does not have the score by quarter, every scoring play or the drives\./)
	const html = gamePageHtml(box)
	assert.doesNotMatch(html, /Score by Quarter|>Scoring<|>Drives</)
	assert.match(html, /Team Stats/)
	assert.doesNotMatch(gameSummaryHtml(box), /game-linescore|>Scoring</)
})

test('fewer than ten drives is a partial list', () => {
	assert.equal(coverageOf({ away: team('7'), home: team('0'), final: true, scoring: [], drives: Array(4).fill({}) }).drives, false)
	assert.equal(coverageOf({ away: team('7'), home: team('0'), final: true, scoring: [], drives: Array(24).fill({}) }).drives, true)
})

test('a game being played is taken as it comes', () => {
	assert.deepEqual(coverageOf({ away: team('0', []), home: team('7', ['7']), final: false, scoring: [], drives: [] }), { quarters: true, scoring: true, drives: true })
})

test("the CSV's day: its date wins for a finished game, its stadium fills ESPN's gap", () => {
	// ESPN's 1999 opener reads 1999-09-11: a midnight-Eastern placeholder for
	// a kickoff time, which is the day before in Central. It was the 12th.
	const row = { date: '1999-09-12', stadium: 'Lambeau Field', roof: 'outdoors', surface: 'grass', temp: '72', wind: '6', referee: 'Bob McElwee' }
	const espn = { ...final, date: '1999-09-11', venue: '' }
	const merged = withGameDay(espn, row)
	assert.equal(merged.date, '1999-09-12')
	assert.equal(merged.venue, 'Lambeau Field')
	assert.equal(gameDayLine(merged), 'Outdoors · Grass · 72°F, wind 6 mph · Referee Bob McElwee')
	// ESPN's own venue is kept when it has one, and a game being played
	// keeps ESPN's date.
	assert.equal(withGameDay({ ...final, venue: 'Lambeau Field' }, { ...row, stadium: 'Somewhere' }).venue, 'Lambeau Field')
	assert.equal(withGameDay({ ...espn, final: false }, row).date, '1999-09-11')
	assert.equal(withGameDay(final, undefined), final)
})

test('the game-day line leaves out what nflverse left blank', () => {
	assert.equal(gameDayLine({ gameDay: { roof: 'dome', surface: 'fieldturf', temp: '', wind: '', referee: '' } }), 'Dome · Fieldturf')
	assert.equal(gameDayLine({ gameDay: null }), '')
	assert.match(gameDayLine({ gameDay: { referee: '<b>' } }), /&lt;b&gt;/)
})

test('the season being played: named for the year it starts, January and February the year before', () => {
	assert.equal(seasonBeingPlayed(new Date(2026, 9, 18)), 2026)
	assert.equal(seasonBeingPlayed(new Date(2027, 0, 10)), 2026)
	assert.equal(seasonBeingPlayed(new Date(2027, 1, 14)), 2026)
	assert.equal(seasonBeingPlayed(new Date(2027, 2, 1)), 2027)
})

// The real data: relations, not counts, since the file grows every week.
const games = parseGames(readFileSync(new URL('../data/packers_games.csv', import.meta.url), 'utf8'))

test('every game from 1999 has an ESPN id, unique, and none before 1999 has one', () => {
	const modern = games.filter((g) => Number(g.season) >= 1999)
	assert.ok(modern.length >= 475)
	assert.ok(modern.every((g) => /^\d{8,12}$/.test(g.espnId)), 'a game from 1999 on has no ESPN id')
	assert.equal(new Set(modern.map((g) => g.espnId)).size, modern.length)
	assert.ok(games.filter((g) => Number(g.season) < 1999).every((g) => g.espnId === ''))
	assert.ok(modern.filter((g) => g.stadium).length / modern.length > 0.99)
})
