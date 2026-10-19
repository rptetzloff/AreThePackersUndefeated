import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { passerRating, totalsByPlayer, categoryTable, seasonTables, leaders, rowsOf, CATEGORIES } from '../stats-core.js'
import { packersPlayerRows, playerRowsToCsv, parsePlayerGames, PLAYER_COLUMNS } from '../lib/player-stats.js'

// Unit tests build their own rows and pin exact numbers; the real-data tests
// below check relations and known seasons, never row counts.

const row = (o) => ({ player_id: 'p1', player_display_name: 'A Player', position: 'QB', season: '2011', week: '1', season_type: 'REG', opponent_team: 'NO', ...o })
const cat = (key) => CATEGORIES.find((c) => c.key === key)

test("passer rating is the league's formula, each part held between 0 and 2.375", () => {
	// Aaron Rodgers 2011: 343/502, 4,643 yards, 45 TD, 6 INT, rated 122.5.
	assert.equal(passerRating(343, 502, 4643, 45, 6), 122.5)
	// Perfect: every part at its ceiling.
	assert.equal(passerRating(10, 10, 200, 3, 0), 158.3)
	// No attempts: no rating, not a rating of 0.
	assert.equal(passerRating(0, 0, 0, 0, 0), null)
})

test('totals sum each stat over the games, take the longest kick, and count games', () => {
	const t = totalsByPlayer([
		row({ week: '1', fg_made: '2', fg_att: '3', fg_long: '48' }),
		row({ week: '2', fg_made: '1', fg_att: '1', fg_long: '52', player_display_name: 'A Player Jr.' }),
	]).get('p1')
	assert.equal(t.games, 2)
	assert.equal(t.fg_made, 3)
	assert.equal(t.fg_long, 52)
	// The name and position are the latest game's.
	assert.equal(t.name, 'A Player Jr.')
})

test('a rate with no denominator is empty, and a player shows only in categories he played in', () => {
	const totals = totalsByPlayer([row({ carries: '10', rushing_yards: '40' }), row({ player_id: 'p2', player_display_name: 'B', receptions: '0', targets: '3' })])
	const rushing = categoryTable(totals, cat('rushing'))
	assert.deepEqual(rushing.map((r) => [r.name, r.car, r.yds, r.avg]), [['A Player', 10, 40, 4]])
	// Targeted three times and caught none: in the table, with no average.
	const receiving = categoryTable(totals, cat('receiving'))
	assert.deepEqual(receiving.map((r) => [r.name, r.tgt, r.rec, r.avg]), [['B', 3, 0, null]])
})

test('regular season, playoffs or both', () => {
	const rows = [row({ passing_yards: '300', attempts: '30' }), row({ week: '19', season_type: 'POST', passing_yards: '250', attempts: '25' })]
	const yds = (type) => seasonTables(rows, 2011, type).passing[0].yds
	assert.deepEqual([yds('REG'), yds('POST'), yds('ALL')], [300, 250, 550])
	assert.equal(rowsOf(rows, { type: 'nonsense' }).length, 1)
})

test('leaders: single seasons apart, careers summed, players with none left out', () => {
	const rows = [
		row({ season: '2010', receiving_yards: '1000', receptions: '70' }),
		row({ season: '2011', receiving_yards: '1200', receptions: '80' }),
		row({ player_id: 'p2', player_display_name: 'B', season: '2011', receiving_yards: '1500', receptions: '90' }),
	]
	const l = leaders(rows).receiving_yards
	assert.deepEqual(l.season.map((e) => [e.name, e.season, e.value]), [['B', 2011, 1500], ['A Player', 2011, 1200], ['A Player', 2010, 1000]])
	assert.deepEqual(l.career.map((e) => [e.name, e.seasons, e.value]), [['A Player', '2010–2011', 2200], ['B', '2011', 1500]])
	assert.deepEqual(leaders(rows).def_sacks.season, [])
})

test("nflverse's rows: the Packers' only, NA and 0 written empty, a quoted comma kept", () => {
	const head = ['team', ...PLAYER_COLUMNS, 'fg_made_list'].join(',')
	const line = (team, extra) => [team, ...PLAYER_COLUMNS.map((c) => extra[c] ?? (c === 'season' ? '2011' : 'NA')), '"48,52"'].join(',')
	const csv = [head, line('GB', { player_id: 'p1', fg_made: '2', fg_att: '0' }), line('CHI', { player_id: 'p9', fg_made: '1' })].join('\n')
	const rows = packersPlayerRows(csv)
	assert.equal(rows.length, 1)
	assert.equal(rows[0].fg_made, '2')
	assert.equal(rows[0].fg_att, '')
	assert.equal(rows[0].opponent_team, '')
	// Written and read back, the same rows.
	assert.deepEqual(parsePlayerGames(playerRowsToCsv(rows)), rows)
	assert.throws(() => packersPlayerRows('team,player_id\nGB,p1'), /missing/)
})

// The real data: known seasons, checked against the record.
const all = parsePlayerGames(readFileSync(new URL('../data/packers_player_games.csv', import.meta.url), 'utf8'))

test('the data runs from 1999, every row a Packers player in a regular-season or playoff game', () => {
	const seasons = [...new Set(all.map((r) => Number(r.season)))].sort((a, b) => a - b)
	assert.equal(seasons[0], 1999)
	assert.ok(seasons.length >= 27)
	assert.ok(all.every((r) => r.season_type === 'REG' || r.season_type === 'POST'))
})

test('known seasons come out as the record has them', () => {
	const t2011 = seasonTables(all, 2011)
	const rodgers = t2011.passing.find((r) => r.name === 'Aaron Rodgers')
	// 45 TD, 6 INT, rated 122.5, as the league has it.
	assert.deepEqual([rodgers.td, rodgers.int, rodgers.rate], [45, 6, 122.5])
	const nelson = t2011.receiving.find((r) => r.name === 'Jordy Nelson')
	assert.deepEqual([nelson.rec, nelson.yds, nelson.td], [68, 1263, 15])
	const crosby = t2011.kicking.find((r) => r.name === 'Mason Crosby')
	assert.deepEqual([crosby.fgm, crosby.fga, crosby.lng], [24, 28, 58])
	assert.equal(seasonTables(all, 2021).receiving.find((r) => r.name === 'Davante Adams').yds, 1553)
})

test("nflverse is play-by-play's count, a play short here and there: the page says so", () => {
	// Rodgers 2011 is 343/502 for 4,643 officially; nflverse has a 7-yard
	// completion fewer. Pinned so that a fix upstream shows up here, and so
	// the page's caveat is not removed while it is still true.
	const rodgers = seasonTables(all, 2011).passing.find((r) => r.name === 'Aaron Rodgers')
	assert.ok(Math.abs(rodgers.yds - 4643) <= 10 && Math.abs(rodgers.cmp - 343) <= 1)
	assert.match(readFileSync(new URL('../stats.html', import.meta.url), 'utf8'), /can differ from official totals/)
})
