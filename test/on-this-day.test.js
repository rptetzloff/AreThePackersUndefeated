import test from 'node:test'
import assert from 'node:assert/strict'
import { onThisDayCandidates, onThisDayPool, onThisDayView } from '../records-core.js'
import { game } from './helpers/rows.js'

// The second piece lifted out of main.js. buildOnThisDay and _renderOnThisDay
// between them found the candidates, chose a pool, derived every display value
// and built the markup — 82 lines with no seam anywhere in them.
//
// The random pick stays in main.js. It is one line, and a test that asserts
// "returns one of these" proves less than the tests below.

const bySeason = (rows) => {
	const out = {}
	for (const r of rows) (out[r.season] ??= []).push(r)
	return out
}

// July, so the ±3 day window does not run into a month boundary.
const JUL = 6

test('a game on the day itself is a candidate', () => {
	const rows = [game({ date: '2011-07-15', season: 2011 })]
	const found = onThisDayCandidates(bySeason(rows), JUL, 15)
	assert.equal(found.length, 1)
	assert.equal(found[0].season, 2011)
})

test('the window reaches three days either side, and stops there', () => {
	const rows = [
		game({ date: '2011-07-12', season: 2011 }),
		game({ date: '2012-07-18', season: 2012 }),
		game({ date: '2013-07-11', season: 2013 }),
		game({ date: '2014-07-19', season: 2014 }),
	]
	const seasons = onThisDayCandidates(bySeason(rows), JUL, 15).map((c) => c.season).sort()
	assert.deepEqual(seasons, [2011, 2012])
})

test('the window is adjustable', () => {
	const rows = [game({ date: '2013-07-11', season: 2013 })]
	assert.equal(onThisDayCandidates(bySeason(rows), JUL, 15).length, 0)
	assert.equal(onThisDayCandidates(bySeason(rows), JUL, 15, { windowDays: 4 }).length, 1)
})

test('rows with no date, or an unparseable one, are skipped rather than thrown on', () => {
	const rows = [
		{ ...game({ date: '2011-07-15', season: 2011 }), date: '' },
		{ ...game({ date: '2012-07-15', season: 2012 }), date: 'not-a-date' },
	]
	assert.deepEqual(onThisDayCandidates(bySeason(rows), JUL, 15), [])
})

test('the window does not wrap around the end of the year', () => {
	// Documenting the limitation rather than asserting it is correct. The
	// proximity test is month * 31 + day, so 30 December is 371 and 1 January is
	// 1. Anyone widening this should expect this test to fail and should say so.
	const rows = [game({ date: '2011-12-30', season: 2011 })]
	assert.deepEqual(onThisDayCandidates(bySeason(rows), 0, 1), [], 'late December is not near 1 January')
})

test('the pool prefers seasons with photographs', () => {
	const candidates = [
		{ game: game({}), season: 1996, date: new Date(1996, 6, 15) },
		{ game: game({}), season: 2011, date: new Date(2011, 6, 15) },
	]
	const pool = onThisDayPool(candidates, { 2011: [{ url: 'x' }] })
	assert.deepEqual(pool.map((c) => c.season), [2011])
})

test('but an empty pool is never preferred to a photoless one', () => {
	const candidates = [{ game: game({}), season: 1996, date: new Date(1996, 6, 15) }]
	assert.equal(onThisDayPool(candidates, {}).length, 1)
})

const view = (g, date = new Date(2011, 0, 8)) =>
	onThisDayView({ game: g, season: 2010, date })

test('a win, a loss and a tie each get their own badge', () => {
	assert.deepEqual(
		['WIN', 'LOSS', 'TIE'].map((result) => {
			const v = view(game({ result }))
			return [v.resultLabel, v.resultClass]
		}),
		[['W', 'win'], ['L', 'loss'], ['T', 'tie']],
	)
})

test('a shutout still shows its score', () => {
	// The scores are strings, so '0' is truthy. If they ever become numbers this
	// test fails, which is the point of writing it down.
	assert.equal(view(game({ pf: 21, pa: 0 })).scoreText, '21–0')
})

test('a game with no score shows none rather than a dash', () => {
	assert.equal(view({ ...game({}), scoreFor: '', scoreAgainst: '' }).scoreText, '')
})

test('the game type is regular, playoff, or the championship by name', () => {
	assert.equal(view(game({})).gameTypeLabel, 'Regular Season')
	assert.equal(view(game({ regular: false })).gameTypeLabel, 'Playoff')
	assert.equal(view(game({ regular: false, championship: 'XLV' })).gameTypeLabel, 'Super Bowl')
})

test('a championship that was lost is still labelled as one', () => {
	// Unlike seasonTally's championshipName, which only names a title that was
	// won. This is a game type, not an honour.
	const v = view(game({ regular: false, result: 'LOSS', championship: 'XXXII' }))
	assert.equal(v.gameTypeLabel, 'Super Bowl')
	assert.equal(v.resultLabel, 'L')
})

test('the championship noun comes from the site manifest', () => {
	const v = onThisDayView(
		{ game: game({ regular: false, championship: '1982' }), season: 1982, date: new Date(1982, 9, 20) },
		{ championship: 'World Series' },
	)
	assert.equal(v.gameTypeLabel, 'World Series')
})

test('an unknown opponent is named rather than left blank', () => {
	assert.equal(view({ ...game({}), Opponent: '' }).opponent, 'Unknown')
})

test('the date reads as a month and day, without the year', () => {
	// The year is rendered separately by the panel, so repeating it here would
	// print it twice.
	assert.equal(view(game({}), new Date(2011, 0, 8)).dateStr, 'January 8')
})
