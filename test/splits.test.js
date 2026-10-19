import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseGames } from '../records-core.js'
import { parseCsv, mapNflverseRow } from '../lib/nflverse-games.js'
import { splitsGame, isThanksgiving, atsResult, splitStats, starterRecord } from '../splits-core.js'

// A parseGames row: the 2010 NFC Championship at Chicago, favored by 3.5.
const row = (o = {}) => ({
	date: '2011-01-23', season: '2010', regular_season: '0', Opponent: 'Chicago Bears', result: 'WIN',
	scoreFor: '21', scoreAgainst: '14', location: 'AWAY', espnId: '310123003',
	weekday: 'Sunday', kickoff: '15:00', overtime: '0', division: '1', spread: '3.5',
	qbId: '00-0023459', qb: 'Aaron Rodgers', oppQbId: '00-0024226', oppQb: 'Jay Cutler', ...o,
})

test("the spread is the Packers' side: nflverse's is the home team's", () => {
	const nfl = (o) => ({ season: '2010', game_type: 'REG', gameday: '2010-12-01', away_team: 'GB', home_team: 'CHI', away_score: '21', home_score: '14', location: 'Home', spread_line: '-3.5', ...o })
	// At Chicago, the home line -3.5 is Green Bay favored by 3.5.
	assert.equal(mapNflverseRow(nfl({})).spread, '3.5')
	// At Lambeau, the home line is Green Bay's own.
	assert.equal(mapNflverseRow(nfl({ away_team: 'CHI', home_team: 'GB', spread_line: '-1.5' })).spread, '-1.5')
	assert.equal(mapNflverseRow(nfl({ spread_line: '0' })).spread, '0')
	assert.equal(mapNflverseRow(nfl({ spread_line: 'NA' })).spread, '')
	// Each side's quarterback, from the Packers' side.
	const q = mapNflverseRow(nfl({ away_qb_id: '00-0023459', away_qb_name: 'Aaron Rodgers', home_qb_id: '00-0024226', home_qb_name: 'Jay Cutler' }))
	assert.deepEqual([q.qb, q.opponent_qb], ['Aaron Rodgers', 'Jay Cutler'])
})

test('against the spread: winning by more than the line covers, landing on it pushes', () => {
	const g = (pf, pa, spread) => splitsGame(row({ scoreFor: String(pf), scoreAgainst: String(pa), spread: String(spread), result: pf > pa ? 'WIN' : pf < pa ? 'LOSS' : 'TIE' }))
	assert.equal(atsResult(g(21, 14, 3.5)), 'W')
	assert.equal(atsResult(g(17, 14, 3.5)), 'L')
	assert.equal(atsResult(g(17, 14, 3)), 'T')
	// An underdog by 7 losing by 6 covers.
	assert.equal(atsResult(g(14, 20, -7)), 'W')
	assert.equal(atsResult(splitsGame(row({ spread: '' }))), null)
})

test('Thanksgiving is the fourth Thursday of November, not any late-November Thursday', () => {
	assert.equal(isThanksgiving('2013-11-28'), true)
	assert.equal(isThanksgiving('2022-11-24'), true)
	assert.equal(isThanksgiving('2012-11-22'), true)
	// The Thursday a week before.
	assert.equal(isThanksgiving('2013-11-21'), false)
	assert.equal(isThanksgiving('2013-11-27'), false)
})

test('kickoff in minutes Eastern; a game before 1999 or not played is not on the page', () => {
	assert.equal(splitsGame(row()).kickoff, 15 * 60)
	assert.equal(splitsGame(row({ kickoff: '' })).kickoff, null)
	assert.equal(splitsGame(row({ season: '1998' })), null)
	assert.equal(splitsGame(row({ result: '' })), null)
})

const games = parseGames(readFileSync(new URL('../data/packers_games.csv', import.meta.url), 'utf8'))
const s = splitStats(games)

test('the starters account for every game, once, and Rodgers is 147–74–1', () => {
	assert.equal(s.starters.reduce((n, q) => n + q.games, 0), s.games)
	const rodgers = s.starters.find((q) => q.name === 'Aaron Rodgers')
	// Officially 147–75–1: nflverse credits the 2018 finale at Detroit, which
	// he left in the first quarter, to DeShone Kizer. The page says so.
	assert.equal(rodgers.regular.record, '147–74–1')
	assert.deepEqual(starterRecord(games, '00-0023459').playoffs.record, '11–10')
	assert.equal(starterRecord(games, '00-0000000'), null)
	assert.equal(s.starters.find((q) => q.name === 'DeShone Kizer').games, 1)
})

test('the line bands and Sunday slots split what they cover, once', () => {
	const sum = (rows) => rows.reduce((n, r) => n + r.games, 0)
	assert.equal(sum(s.line), s.lineAll.games)
	assert.equal(s.lineAll.games, s.games)
	assert.equal(s.lineAll.ats.games, s.games)
	const sundays = games.filter((g) => Number(g.season) >= 1999 && g.result && g.weekday === 'Sunday' && g.kickoff).length
	assert.equal(sum(s.when.filter((r) => r.label.startsWith('Sunday'))), sundays)
	// Division and everyone else are every game.
	assert.equal(sum(s.close.filter((r) => r.label === 'Division games' || r.label === 'Everyone else')), s.games)
})

test('opposing quarterbacks faced three times or more, the most faced first', () => {
	assert.ok(s.opposing.every((q) => q.games >= 3))
	assert.ok(s.opposing.every((q, i, a) => i === 0 || a[i - 1].games >= q.games))
	assert.equal(s.opposing[0].name, 'Matthew Stafford')
})

test("the season being played from nflverse's schedules carries the new columns", () => {
	const csv = [
		'game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location,overtime,spread_line,div_game,away_qb_id,home_qb_id,away_qb_name,home_qb_name',
		'2026_06_DAL_GB,2026,REG,6,2026-10-18,Sunday,20:20,DAL,13,GB,23,Home,0,-1.5,0,00-0033077,00-0036264,Dak Prescott,Jordan Love',
	].join('\n')
	const [m] = parseCsv(csv).map(mapNflverseRow)
	assert.deepEqual([m.weekday, m.gametime, m.overtime, m.div_game, m.spread, m.qb, m.opponent_qb], ['Sunday', '20:20', '0', '0', '-1.5', 'Jordan Love', 'Dak Prescott'])
})
