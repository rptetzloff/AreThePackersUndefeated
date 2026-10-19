import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GAMES_COLUMNS, currentSeasonRows, gameRow, rowsToCsv } from '../lib/current-season.js'
import { parseGames, parseGamesCsv, poolCurrentSeason } from '../records-core.js'
import { computeHeadToHead } from '../h2h-core.js'

// The season being played, counted from ESPN: its completed games as rows
// of the games CSV, replacing the file's rows for that season.

const fixture = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'))
// ESPN's 2026 Packers schedule the night of the Cowboys game, trimmed.
const regular = fixture('espn-schedule-2026-type2.json')
const post = fixture('espn-schedule-2026-type3.json')
const csvText = readFileSync(new URL('../data/packers_games.csv', import.meta.url), 'utf8')

test("the rows' columns are the games CSV's, in its order", () => {
	assert.equal(csvText.split('\n')[0], GAMES_COLUMNS.join(','))
})

test('the completed games of 2026, Central dates, and nothing to come', () => {
	const rows = currentSeasonRows({ regular, post }, 2026)
	assert.equal(rows.length, 6)
	// Sunday Night Football is Monday in UTC; it was the 18th.
	const dal = rows.at(-1)
	assert.deepEqual([dal.date, dal.Opponent, dal['Packers Win'], dal.packers_score, dal.opponent_score, dal.location, dal.espn_id],
		['2026-10-18', 'Dallas Cowboys', 'WIN', '23', '13', 'HOME', '401873007'])
	assert.ok(rows.every((r) => r.regular_season === '1' && r.playoff === '0'))
})

test("where the file has the same games, ESPN's rows say exactly what the file says", () => {
	const file = parseGamesCsv(csvText).filter((r) => r.season === '2026')
	assert.ok(file.length >= 5)
	const rows = new Map(currentSeasonRows({ regular, post }, 2026).map((r) => [r.espn_id, r]))
	for (const f of file) {
		const r = rows.get(f.espn_id)
		assert.ok(r, `${f.date} ${f.Opponent} missing from ESPN's rows`)
		for (const k of GAMES_COLUMNS.slice(0, 11)) assert.equal(r[k], f[k], `${f.date} ${k}`)
	}
})

const event = (o = {}) => ({
	id: '1', date: '2027-02-14T23:30Z',
	competitions: [{
		status: { type: { completed: true } }, neutralSite: false, notes: [],
		competitors: [
			{ homeAway: 'home', team: { abbreviation: 'GB', displayName: 'Green Bay Packers' }, score: { value: 27 } },
			{ homeAway: 'away', team: { abbreviation: 'KC', displayName: 'Kansas City Chiefs' }, score: { value: 24 } },
		],
		...o,
	}],
})

test('a Super Bowl: neutral, its numeral as the file writes them, a playoff game', () => {
	const r = gameRow(event({ neutralSite: true, notes: [{ headline: 'Super Bowl LXI' }] }), 2026, { playoff: true })
	assert.deepEqual([r.location, r.superbowl, r.playoff, r.regular_season, r['Packers Win']], ['NEUTRAL', 'lxi', '1', '0', 'WIN'])
})

test('a game not yet final is not a row; a tie is a tie', () => {
	assert.equal(gameRow(event({ status: { type: { completed: false } } }), 2026, { playoff: false }), null)
	const tie = event()
	tie.competitions[0].competitors[1].score = { value: 27 }
	assert.equal(gameRow(tie, 2026, { playoff: false })['Packers Win'], 'TIE')
})

test('the CSV text parses back to the same games, a comma in a name included', () => {
	const rows = currentSeasonRows({ regular, post }, 2026)
	rows[0] = { ...rows[0], stadium: 'Stadium, "The"' }
	const back = parseGames(rowsToCsv(rows))
	assert.equal(back.length, rows.length)
	assert.equal(back[0].stadium, 'Stadium, "The"')
	assert.equal(back.at(-1).Opponent, 'Dallas Cowboys')
})

test("ESPN's rows replace the file's for the season, so nothing counts twice", () => {
	const file = parseGames(csvText)
	const current = parseGames(rowsToCsv(currentSeasonRows({ regular, post }, 2026)))
	const pooled = poolCurrentSeason(file, current, 2026)
	const of2026 = pooled.filter((g) => g.season === '2026')
	assert.equal(of2026.length, 6)
	assert.equal(new Set(of2026.map((g) => g.espnId)).size, 6)
	// Every earlier season is the file's, untouched.
	assert.equal(pooled.filter((g) => g.season !== '2026').length, file.filter((g) => g.season !== '2026').length)
	// Without ESPN, the file stands.
	assert.equal(poolCurrentSeason(file, null, 2026), file)
})

test("tonight's win counts in the all-time record against Dallas", () => {
	const file = parseGames(csvText)
	const current = parseGames(rowsToCsv(currentSeasonRows({ regular, post }, 2026)))
	const before = computeHeadToHead(file).opponents.find((o) => o.name === 'Dallas Cowboys')
	const after = computeHeadToHead(poolCurrentSeason(file, current, 2026)).opponents.find((o) => o.name === 'Dallas Cowboys')
	assert.equal(after.games, before.games + 1)
	assert.equal(after.wins, before.wins + 1)
})
