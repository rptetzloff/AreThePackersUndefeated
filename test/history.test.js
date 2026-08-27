import test from 'node:test'
import assert from 'node:assert/strict'
import { computeSeasonHistory } from '../records-core.js'
import { LONG_AFTER, game, season } from './helpers/rows.js'

const history = (rows, opts = {}) => computeSeasonHistory(rows, { now: LONG_AFTER, ...opts })
const seasonOf = (rows, year, opts) => history(rows, opts).find((s) => s.season === year)

test('seasons come back in chronological order regardless of row order', () => {
	const rows = [...season(2011, 'W'), ...season(1929, 'W'), ...season(1967, 'W')]
	assert.deepEqual(history(rows).map((s) => s.season), [1929, 1967, 2011])
})

// A tie is half a win. Getting this wrong is invisible in a record line and
// wrong in every chart and sort that uses winPct.
test('a tie counts half in win percentage', () => {
	const s = seasonOf(season(1929, 'WWTT'), 1929)
	assert.equal(s.record, '2–0–2')
	assert.equal(s.winPct, 0.75) // (2 + 1) / 4
})

test('an all-tie season is exactly .500', () => {
	assert.equal(seasonOf(season(1929, 'TT'), 1929).winPct, 0.5)
})

test('a season with no games is 0 rather than NaN', () => {
	// Division by zero here would render as "NaN" on the chart axis.
	const rows = [game({ date: '2026-09-06', season: 2026, result: '' })]
	assert.deepEqual(history(rows), [])
})

test('playoffs are excluded from the record by default', () => {
	const rows = [
		...season(2010, 'WWL'),
		game({ date: '2011-02-06', season: 2010, regular: false, result: 'WIN', pf: 31, pa: 25, championship: 'XLV' }),
	]
	const s = seasonOf(rows, 2010)
	assert.equal(s.record, '2–1')
	assert.equal(s.pf, 24 * 2 + 24) // three regular-season games at the default score
})

test('playoffs fold into the record when asked for', () => {
	const rows = [
		...season(2010, 'WWL'),
		game({ date: '2011-02-06', season: 2010, regular: false, result: 'WIN', pf: 31, pa: 25, championship: 'XLV' }),
	]
	assert.equal(seasonOf(rows, 2010, { playoffs: true }).record, '3–1')
})

test('winning the final playoff game makes a champion', () => {
	const rows = [
		...season(2010, 'WW'),
		game({ date: '2011-02-06', season: 2010, regular: false, result: 'WIN', championship: 'XLV' }),
	]
	const s = seasonOf(rows, 2010)
	assert.equal(s.champion, true)
	assert.equal(s.championship, true)
})

test('losing the final playoff game does not', () => {
	const rows = [
		...season(2014, 'WW'),
		game({ date: '2015-01-18', season: 2014, regular: false, result: 'LOSS' }),
	]
	assert.equal(seasonOf(rows, 2014).champion, false)
})

// Winning a playoff game and then losing the next one is the case a naive
// "won any playoff game" check gets wrong.
test('winning a playoff game but losing the last one does not', () => {
	const rows = [
		...season(2014, 'WW'),
		game({ date: '2015-01-11', season: 2014, regular: false, result: 'WIN' }),
		game({ date: '2015-01-18', season: 2014, regular: false, result: 'LOSS' }),
	]
	assert.equal(seasonOf(rows, 2014).champion, false)
})

// 1929-31 were awarded on standings — there was no championship game to win,
// so the "won the last playoff game" rule cannot find them.
test('the three standings-era titles are champions with no playoff game', () => {
	for (const year of [1929, 1930, 1931]) {
		assert.equal(seasonOf(season(year, 'WWW'), year).champion, true, `${year}`)
	}
})

test('a neighbouring unbeaten season is not awarded a standings title', () => {
	assert.equal(seasonOf(season(1932, 'WWW'), 1932).champion, false)
})

test('superbowl is only true when the Super Bowl was won', () => {
	const rows = [
		...season(1997, 'WW'),
		game({ date: '1998-01-25', season: 1997, regular: false, result: 'LOSS', championship: 'XXXII' }),
	]
	const s = seasonOf(rows, 1997)
	assert.equal(s.championship, false)
	assert.equal(s.champion, false)
})

test('undefeated ignores playoff losses, because the flag is regular-season', () => {
	const rows = [
		...season(2011, 'WWW'),
		game({ date: '2012-01-15', season: 2011, regular: false, result: 'LOSS' }),
	]
	assert.equal(seasonOf(rows, 2011).undefeated, true)
})

test('undefeated waits for the season to settle, like perfect seasons do', () => {
	const rows = season(2026, 'WWW')
	assert.equal(seasonOf(rows, 2026, { now: new Date(2026, 9, 1) }).undefeated, false)
	assert.equal(seasonOf(rows, 2026, { now: new Date(2027, 2, 1) }).undefeated, true)
})

test('points for and against add up across the season', () => {
	const rows = [
		game({ date: '2011-09-08', season: 2011, pf: 42, pa: 34 }),
		game({ date: '2011-09-15', season: 2011, pf: 30, pa: 23 }),
	]
	const s = seasonOf(rows, 2011)
	assert.equal(s.pf, 72)
	assert.equal(s.pa, 57)
})

test('a season is present even if every game was lost', () => {
	const s = seasonOf(season(1958, 'LLL'), 1958)
	assert.equal(s.record, '0–3')
	assert.equal(s.winPct, 0)
	assert.equal(s.undefeated, false)
})
