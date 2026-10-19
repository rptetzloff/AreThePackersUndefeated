import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { passerRating, totalsByPlayer, categoryTable, seasonTables, leaders, rowsOf, CATEGORIES, playerSummary, gameLog, playerIndex, formatStat, PLAYER_ID } from '../stats-core.js'
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

test("a play nflverse credits to no one is no one's: no nameless row in any table", () => {
	const rows = [row({ def_tackles_solo: '3' }), row({ player_id: '', player_display_name: '', def_tackles_solo: '6', def_sacks: '1' })]
	assert.deepEqual(seasonTables(rows, 2011).defense.map((r) => r.name), ['A Player'])
	// The real data has 20 such rows; none may reach a table.
	for (const season of [...new Set(all.map((r) => Number(r.season)))]) {
		for (const [cat, table] of Object.entries(seasonTables(all, season, 'ALL'))) {
			assert.ok(table.every((r) => r.id && r.name), `${season} ${cat} has a row with no player`)
		}
	}
})

test("a player's page: a row a season in each category he played, his career beneath", () => {
	const rows = [
		row({ season: '2010', week: '1', attempts: '30', completions: '20', passing_yards: '250', passing_tds: '2' }),
		row({ season: '2011', week: '1', attempts: '40', completions: '30', passing_yards: '350', passing_tds: '3', carries: '5', rushing_yards: '20' }),
		row({ season: '2011', week: '20', season_type: 'POST', attempts: '35', completions: '25', passing_yards: '300' }),
	]
	const p = playerSummary(rows, 'p1')
	assert.deepEqual(p.categories.map((c) => c.key), ['passing', 'rushing'])
	const passing = p.categories[0]
	assert.deepEqual(passing.seasons.map((s) => [s.season, s.row.yds]), [[2010, 250], [2011, 350]])
	// The career is the regular season's, summed as the tables sum: 600, not
	// the playoff game's 300 too.
	assert.equal(passing.career.yds, 600)
	assert.equal(playerSummary(rows, 'p1', 'ALL').categories[0].career.yds, 900)
	assert.deepEqual(p.seasons, [2011, 2010])
	assert.equal(p.span, '2010–2011')
	assert.equal(playerSummary(rows, 'nobody'), null)
})

test("a season's game log: regular season by week, then the playoffs, a line in each category", () => {
	const rows = [
		row({ week: '20', season_type: 'POST', opponent_team: 'NYG', attempts: '46', completions: '26', passing_yards: '264' }),
		row({ week: '2', opponent_team: 'CAR', attempts: '39', completions: '19', passing_yards: '308', carries: '4', rushing_yards: '6' }),
		row({ week: '1', opponent_team: 'NO', attempts: '35', completions: '27', passing_yards: '312' }),
	]
	const log = gameLog(rows, 'p1', 2011)
	assert.deepEqual(log.games.map((g) => [g.week, g.type, g.opponent]), [[1, 'REG', 'NO'], [2, 'REG', 'CAR'], [20, 'POST', 'NYG']])
	assert.deepEqual(log.categories.map((c) => c.key), ['passing', 'rushing'])
	assert.equal(log.games[0].lines.rushing, null)
	assert.equal(log.games[1].lines.rushing.yds, 6)
})

test('search lists each player once, by name, with his position and seasons', () => {
	const idx = playerIndex([row({ player_id: 'p2', player_display_name: 'Zed', season: '2001' }), row({ season: '2005' }), row({ season: '2009' })])
	assert.deepEqual(idx, [{ id: 'p1', name: 'A Player', pos: 'QB', seasons: '2005–2009' }, { id: 'p2', name: 'Zed', pos: 'QB', seasons: '2001' }])
	assert.ok(PLAYER_ID.test('00-0023459'))
	assert.ok(!PLAYER_ID.test('../etc') && !PLAYER_ID.test('00-002345'))
	// The whole id and nothing around it: it lands in a path.
	assert.ok(!PLAYER_ID.test('00-0023459/../x') && !PLAYER_ID.test('x00-0023459'))
})

test('rates show one decimal always, counts their thousands, none a dash', () => {
	assert.equal(formatStat('rate', 106), '106.0')
	assert.equal(formatStat('pct', 40), '40.0')
	assert.equal(formatStat('yds', 4636), '4,636')
	assert.equal(formatStat('avg', null), '—')
})

test("Aaron Rodgers's page: eighteen seasons, his career as the record has it to a play", () => {
	const p = playerSummary(all, '00-0023459')
	assert.equal(p.name, 'Aaron Rodgers')
	const passing = p.categories.find((c) => c.key === 'passing')
	assert.equal(passing.seasons.length, 18)
	// 475 touchdowns in 230 regular-season games, as the record has them;
	// yards within the one missing completion of the official 59,055.
	assert.deepEqual([passing.career.td, passing.career.g], [475, 230])
	assert.ok(Math.abs(passing.career.yds - 59055) <= 10)
})
