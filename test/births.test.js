import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { birthDates, birthsToCsv, parseBirths } from '../lib/player-births.js'
import { bornOn } from '../stats-core.js'
import { parsePlayerGames } from '../lib/player-stats.js'

// players.csv's own head, cut to a few columns either side of the two read.
const PLAYERS = [
	'gsis_id,display_name,suffix,birth_date,position,headshot',
	'00-0023459,Aaron Rodgers,,1983-12-02,QB,"https://static.example/a,b.png"',
	'00-0033873,"Mahomes, Patrick",II,1995-09-17,QB,',
	'00-0099999,No Date,,,K,',
	'00-0088888,Bad Date,,12/02/1983,K,',
].join('\n')

test('birth dates for the ids asked for, past a quoted comma, and only real dates', () => {
	const got = birthDates(PLAYERS, new Set(['00-0023459', '00-0033873', '00-0099999', '00-0088888']))
	assert.deepEqual([...got], [['00-0023459', '1983-12-02'], ['00-0033873', '1995-09-17']])
	assert.equal(birthDates(PLAYERS, new Set(['00-0011111'])).size, 0)
})

test('the committed file round-trips, a line a player, by id', () => {
	const births = new Map([['00-0033873', '1995-09-17'], ['00-0023459', '1983-12-02']])
	const csv = birthsToCsv(births)
	assert.equal(csv, 'player_id,birth_date\n00-0023459,1983-12-02\n00-0033873,1995-09-17\n')
	assert.deepEqual(parseBirths(csv), new Map([...births].sort()))
})

const row = (id, name, season, week = 1) => ({ player_id: id, player_display_name: name, position: 'WR', season: String(season), week: String(week), season_type: 'REG' })

test('Packers born on a day: the most seasons first, then the most games, then the earliest born', () => {
	const rows = [
		row('a', 'Two Seasons', 2010), row('a', 'Two Seasons', 2011),
		row('b', 'One Season Three Games', 2012, 1), row('b', 'One Season Three Games', 2012, 2), row('b', 'One Season Three Games', 2012, 3),
		row('c', 'One Game Older', 2013), row('d', 'One Game Younger', 2014),
		row('e', 'Other Day', 2015),
		// nflverse's nameless rows are no one, born on no day.
		row('', '', 2016),
	]
	const births = new Map([['a', '1985-12-02'], ['b', '1990-12-02'], ['c', '1970-12-02'], ['d', '1980-12-02'], ['e', '1985-12-03'], ['', '1985-12-02']])
	const born = bornOn(rows, births, '12-02')
	assert.deepEqual(born.map((b) => b.name), ['Two Seasons', 'One Season Three Games', 'One Game Older', 'One Game Younger'])
	assert.deepEqual(born[0], { id: 'a', name: 'Two Seasons', pos: 'WR', year: 1985, seasons: '2010–2011' })
	assert.deepEqual(bornOn(rows, births, '01-01'), [])
	// A leap-day birthday is on February 29th only.
	const leap = new Map([['a', '1988-02-29']])
	assert.deepEqual(bornOn(rows, leap, '02-29').map((b) => b.id), ['a'])
	assert.deepEqual(bornOn(rows, leap, '02-28'), [])
})

test('the committed file has a birth date for nearly every player in the stats file', () => {
	// All 645 when written. nflverse has no birth date for a few dozen of its
	// 25,000 players, so a newcomer without one is allowed; a births file
	// that was not regenerated with the stats is not.
	const births = parseBirths(readFileSync(new URL('../data/packers_player_births.csv', import.meta.url), 'utf8'))
	const ids = new Set(parsePlayerGames(readFileSync(new URL('../data/packers_player_games.csv', import.meta.url), 'utf8')).map((r) => r.player_id).filter(Boolean))
	const missing = [...ids].filter((id) => !births.has(id))
	assert.ok(missing.length <= 3, `no birth date for ${missing.join(', ')}`)
	assert.equal(births.get('00-0023459'), '1983-12-02')
})
