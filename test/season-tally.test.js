import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computeSeasonHistory, parseGames, seasonTally } from '../records-core.js'
import { game, season } from './helpers/rows.js'

// seasonTally is the first piece lifted out of main.js. Everything it does was
// running untested until now — it sat inline in processCsvSeasonData, which
// tallied and rendered in one pass, and it is where every past season came to
// render 0-0.

test('regular-season wins, losses and ties are counted separately', () => {
	const t = seasonTally(season(2016, 'WWLT'))
	assert.deepEqual([t.wins, t.losses, t.ties], [2, 1, 1])
})

test('postseason games do not touch the regular-season record', () => {
	const rows = [
		...season(2010, 'WWL'),
		game({ date: '2011-01-08', season: 2010, regular: false, result: 'WIN' }),
	]
	const t = seasonTally(rows)
	assert.deepEqual([t.wins, t.losses, t.ties], [2, 1, 0])
	assert.deepEqual(t.postseason, { w: 1, l: 0, t: 0 })
})

test('a season with no playoff games has no postseason at all', () => {
	assert.equal(seasonTally(season(2005, 'LLL')).postseason, null)
})

test('a postseason of ties alone does not count as a postseason', () => {
	// Only unplayed or malformed rows can produce this. Showing "0-0-1" would be
	// worse than showing nothing, and the inline version showed nothing.
	const rows = [
		...season(2016, 'WW'),
		game({ date: '2017-01-08', season: 2016, regular: false, result: 'TIE' }),
	]
	assert.equal(seasonTally(rows).postseason, null)
})

test('winning the championship game yields its name, not a flag', () => {
	const rows = [
		...season(2010, 'WW'),
		game({ date: '2011-02-06', season: 2010, regular: false, result: 'WIN', championship: 'xlv' }),
	]
	assert.equal(seasonTally(rows).championshipName, 'Super Bowl XLV')
})

test('losing the championship game yields no name', () => {
	const rows = [
		...season(1997, 'WW'),
		game({ date: '1998-01-25', season: 1997, regular: false, result: 'LOSS', championship: 'XXXII' }),
	]
	assert.equal(seasonTally(rows).championshipName, null)
})

test('the vocabulary comes from the site, not from the football in the code', () => {
	// The same rows under a different manifest. This is what lets the function
	// move to a shared core without the noun moving with it.
	const rows = [
		...season(1982, 'WW'),
		game({ date: '1982-10-20', season: 1982, regular: false, result: 'WIN', championship: '1982' }),
	]
	const t = seasonTally(rows, { championship: 'World Series' })
	assert.equal(t.championshipName, 'World Series 1982')
})

test('undefeated means no losses yet, and a tie does not end it', () => {
	assert.equal(seasonTally(season(1929, 'WWTW')).undefeated, true)
	assert.equal(seasonTally(season(1929, 'WWLW')).undefeated, false)
})

test('a season with no games played is not undefeated', () => {
	// Otherwise every future season answers YES the moment its rows appear.
	assert.equal(seasonTally([]).undefeated, false)
	assert.equal(seasonTally(season(2030, 'TT')).undefeated, false)
})

test('an unfinished season can be undefeated here but not in the records list', () => {
	// The one difference that makes these two functions separate, pinned so a
	// later merge of them has to fail this test first.
	//
	// The site is named after a question a team can answer yes to in October.
	// The records page lists seasons that finished without a loss. Collapsing
	// them would either announce a perfect season in week three or refuse to
	// call a team undefeated while it is.
	const rows = season(2030, 'WWW')
	assert.equal(seasonTally(rows).undefeated, true)

	const [inHistory] = computeSeasonHistory(rows, { now: new Date(2030, 9, 1) })
	assert.equal(inHistory.undefeated, false, 'the season has not finished yet')

	const [settled] = computeSeasonHistory(rows, { now: new Date(2031, 5, 1) })
	assert.equal(settled.undefeated, true, 'and it counts once it has')
})

test('the real 1929 and 2010 seasons come out as the site shows them', () => {
	const rows = parseGames(readFileSync(new URL('../data/packers_games.csv', import.meta.url), 'utf8'))
	const of = (yr) => seasonTally(rows.filter((r) => parseInt(r.season, 10) === yr))

	const y1929 = of(1929)
	assert.deepEqual([y1929.wins, y1929.losses, y1929.ties], [12, 0, 1])
	assert.equal(y1929.undefeated, true)
	assert.equal(y1929.championshipName, null, 'no Super Bowl existed in 1929')

	const y2010 = of(2010)
	assert.deepEqual([y2010.wins, y2010.losses, y2010.ties], [10, 6, 0])
	assert.deepEqual(y2010.postseason, { w: 4, l: 0, t: 0 })
	assert.equal(y2010.championshipName, 'Super Bowl XLV')
})
