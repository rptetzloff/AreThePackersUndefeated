import test from 'node:test'
import assert from 'node:assert/strict'
import { computeSuperlatives, streakSpan } from '../records-core.js'
import { LONG_AFTER, game, season } from './helpers/rows.js'

const compute = (rows, opts = {}) => computeSuperlatives(rows, { now: LONG_AFTER, ...opts })

test('best start counts only the unbeaten run that opens a season', () => {
	// Wins after the first loss must not be added to the opening run.
	const rows = season(2011, 'WWWWLWWW')
	const { bestStarts } = compute(rows)
	assert.deepEqual(bestStarts[0], { season: 2011, games: 4 })
})

test('a tie ends an opening run, because the run is of wins', () => {
	const { bestStarts } = compute(season(1972, 'WWTWW'))
	assert.equal(bestStarts[0].games, 2)
})

test('a season opening with a loss has no best start at all', () => {
	const { bestStarts } = compute(season(1988, 'LWWWW'))
	assert.equal(bestStarts.length, 0)
})

test('worst start is the mirror image', () => {
	const { worstStarts } = compute(season(1988, 'LLLLWL'))
	assert.deepEqual(worstStarts[0], { season: 1988, games: 4 })
})

test('starts are ranked longest first, ties broken by the earlier season', () => {
	const rows = [...season(1962, 'WWW'), ...season(1929, 'WWW'), ...season(2011, 'WWWW')]
	const { bestStarts } = compute(rows)
	assert.deepEqual(bestStarts.map((s) => s.season), [2011, 1929, 1962])
})

test('starts ignore playoff games', () => {
	// A playoff win in January must not extend the previous season's opening
	// run, and must not open the next one either.
	const rows = [
		...season(2011, 'WW'),
		game({ date: '2012-01-15', season: 2011, regular: false, result: 'WIN' }),
	]
	assert.equal(compute(rows).bestStarts[0].games, 2)
})

// The guard that keeps a live season from being announced as perfect.
test('an unbeaten season is not perfect until it is over', () => {
	const rows = season(2026, 'WWWW')
	const midSeason = new Date(2026, 9, 15) // October of the same year
	assert.equal(compute(rows, { now: midSeason }).perfectSeasons.length, 0)
})

test('an unbeaten season counts once March of the following year arrives', () => {
	const rows = season(2026, 'WWWW')
	assert.equal(compute(rows, { now: new Date(2027, 2, 1) }).perfectSeasons.length, 1)
	// February is still too early: the season runs into January and February.
	assert.equal(compute(rows, { now: new Date(2027, 1, 28) }).perfectSeasons.length, 0)
})

test('a season with ties but no losses is still perfect', () => {
	const { perfectSeasons } = compute(season(1929, 'WWTW'))
	assert.equal(perfectSeasons.length, 1)
	assert.equal(perfectSeasons[0].record, '3–0–1')
})

test('losing once disqualifies a season however many wins it has', () => {
	assert.equal(compute(season(1962, 'WWWWWWWWWWWWWL')).perfectSeasons.length, 0)
})

test('win streaks run across season boundaries', () => {
	// Three to end one season, three to open the next, is a streak of six.
	const rows = [...season(2010, 'WWW'), ...season(2011, 'WWW')]
	const [longest] = compute(rows).winStreaks
	assert.equal(longest.games, 6)
	assert.equal(longest.startSeason, 2010)
	assert.equal(longest.endSeason, 2011)
})

test('a tie ends a win streak, by record-book convention', () => {
	const [longest] = compute(season(2011, 'WWWTWW')).winStreaks
	assert.equal(longest.games, 3)
})

test('playoff wins do not extend a regular-season streak', () => {
	const rows = [
		...season(2011, 'WWW'),
		game({ date: '2012-01-15', season: 2011, regular: false, result: 'WIN' }),
		...season(2012, 'L'),
	]
	assert.equal(compute(rows).winStreaks[0].games, 3)
})

test('streakSpan names one season or two', () => {
	assert.equal(streakSpan({ startSeason: 2011, endSeason: 2011 }), '2011')
	assert.equal(streakSpan({ startSeason: 2010, endSeason: 2011 }), '2010–2011')
})

test('lopsided wins are ranked by margin, not by score', () => {
	const rows = [
		game({ date: '1962-10-07', result: 'WIN', pf: 49, pa: 0 }),  // margin 49
		game({ date: '1983-10-17', result: 'WIN', pf: 55, pa: 14 }), // margin 41
	]
	const { lopsidedWins } = compute(rows)
	assert.deepEqual(lopsidedWins.map((g) => g.pf), [49, 55])
})

test('equal margins are broken by the higher score', () => {
	const rows = [
		game({ date: '1962-10-07', result: 'WIN', pf: 20, pa: 0 }),
		game({ date: '1983-10-17', result: 'WIN', pf: 40, pa: 20 }),
	]
	assert.equal(compute(rows).lopsidedWins[0].pf, 40)
})

test('lopsided lists include playoff games and say so', () => {
	const rows = [game({ date: '1968-01-14', season: 1967, regular: false, result: 'WIN', pf: 33, pa: 14, championship: 'II' })]
	const [g] = compute(rows).lopsidedWins
	assert.equal(g.playoff, true)
	assert.equal(g.championship, true)
})

test('ties are listed in full and newest first', () => {
	const rows = [
		game({ date: '1921-11-20', result: 'TIE', pf: 3, pa: 3 }),
		game({ date: '1949-10-16', result: 'TIE', pf: 7, pa: 7 }),
		game({ date: '1935-09-15', result: 'WIN' }),
	]
	const { ties } = compute(rows)
	assert.equal(ties.length, 2)
	assert.deepEqual(ties.map((t) => t.date), ['1949-10-16', '1921-11-20'])
})

test('rows with no result are ignored rather than counted as losses', () => {
	// A scheduled future game arrives with an empty result column, and the
	// weekly data workflow commits them mid-season.
	const rows = [...season(2026, 'WW'), game({ date: '2026-12-06', season: 2026, result: '' })]
	const { perfectSeasons } = compute(rows, { now: new Date(2027, 2, 1) })
	assert.equal(perfectSeasons.length, 1)
	assert.equal(perfectSeasons[0].wins, 2)
})

test('top is respected', () => {
	const rows = [2001, 2002, 2003, 2004, 2005, 2006].flatMap((y) => season(y, 'WWL'))
	assert.equal(compute(rows, { top: 3 }).bestStarts.length, 3)
})
