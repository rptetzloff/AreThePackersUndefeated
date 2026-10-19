import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseGames, seasonBeingPlayed } from '../records-core.js'
import { attendanceOf, attendanceToCsv, parseAttendance } from '../lib/attendance.js'
import { parseCsv, mapNflverseRow, rowToCsv, GAMES_HEADER } from '../lib/nflverse-games.js'
import { crowdOf, gameDayGame, gameDayBoards, tally, stadiumStats } from '../stadiums-core.js'

// A parseGames row, as the CSV gives it.
const row = (o = {}) => ({
	date: '2008-01-20', season: '2007', regular_season: '0', Opponent: 'New York Giants', result: 'LOSS',
	scoreFor: '20', scoreAgainst: '23', location: 'HOME', espnId: '280120009', stadium: 'Lambeau Field',
	roof: 'outdoors', surface: 'grass', temp: '-1', wind: '12', referee: 'Bill Carollo', ...o,
})

test('a crowd of 0 is an empty stadium in 2020 only; any other season, ESPN did not record it', () => {
	assert.equal(crowdOf(0, 2020), 0)
	assert.equal(crowdOf(0, 2012), null)
	assert.equal(crowdOf(72740, 2007), 72740)
	assert.equal(crowdOf(null, 2020), null)
})

test('ESPN summary crowds, and the committed file round-trips with an unrecorded game kept', () => {
	assert.equal(attendanceOf({ gameInfo: { attendance: 59872 } }), 59872)
	assert.equal(attendanceOf({ gameInfo: {} }), null)
	assert.equal(attendanceOf({ gameInfo: { attendance: -3 } }), null)
	const byId = new Map([['400000002', null], ['190912009', 59872]])
	const csv = attendanceToCsv(byId)
	assert.equal(csv, 'espn_id,attendance\n190912009,59872\n400000002,\n')
	assert.deepEqual(parseAttendance(csv), new Map([['190912009', 59872], ['400000002', null]]))
})

test('indoors, the temperature and wind mean nothing; an open retractable roof is outdoors', () => {
	const dome = gameDayGame(row({ roof: 'dome', temp: '68', wind: '0' }), new Map())
	assert.deepEqual([dome.indoors, dome.temp, dome.wind], [true, null, null])
	const closed = gameDayGame(row({ roof: 'closed', temp: '50' }), new Map())
	assert.equal(closed.temp, null)
	const open = gameDayGame(row({ roof: 'open', temp: '80' }), new Map())
	assert.deepEqual([open.indoors, open.temp], [false, 80])
	// Blank is unknown, not zero.
	assert.equal(gameDayGame(row({ temp: '', wind: '' }), new Map()).temp, null)
	// Not played, or before 1999: not on the page.
	assert.equal(gameDayGame(row({ result: '' }), new Map()), null)
	assert.equal(gameDayGame(row({ season: '1967' }), new Map()), null)
})

test('a record shows ties only when there are any', () => {
	const g = (result) => ({ result })
	assert.deepEqual(tally([g('W'), g('W'), g('L')]), { games: 3, w: 2, l: 1, t: 0, record: '2–1', winPct: 2 / 3 })
	assert.equal(tally([g('W'), g('T')]).record, '1–0–1')
	assert.equal(tally([]).winPct, null)
})

test('boards: coldest first, ties to the earlier game, and empty stadiums off the crowd lists', () => {
	const g = (date, temp, crowd) => ({ date, temp, wind: null, crowd })
	const b = gameDayBoards([g('2010-01-01', 5, 0), g('2008-01-20', 5, 70000), g('2009-01-01', null, 500), g('2011-01-01', 40, 80000)], 10)
	assert.deepEqual(b.coldest.map((x) => x.date), ['2008-01-20', '2010-01-01', '2011-01-01'])
	assert.deepEqual(b.smallestCrowds.map((x) => x.crowd), [500, 70000, 80000])
	assert.deepEqual(b.biggestCrowds.map((x) => x.crowd), [80000, 70000, 500])
	assert.equal(b.windiest.length, 0)
})

// The committed data, as the page counts it.
const games = parseGames(readFileSync(new URL('../data/packers_games.csv', import.meta.url), 'utf8'))
const attendance = parseAttendance(readFileSync(new URL('../data/packers_attendance.csv', import.meta.url), 'utf8'))
const s = stadiumStats(games, attendance)

test("Lambeau's games add up: regular season and playoffs are every game there", () => {
	const L = s.lambeau
	assert.equal(L.regular.games + L.postseason.games, L.games)
	assert.equal(L.first, 1999)
	assert.equal(L.games, games.filter((g) => Number(g.season) >= 1999 && g.result && g.location === 'HOME').length)
	// The 2008 NFC Championship, -1°F: the coldest since 1999, there and anywhere.
	assert.equal(L.coldest.date, '2008-01-20')
	assert.equal(s.coldest[0].date, '2008-01-20')
	assert.ok(L.averageCrowd > 60000 && L.averageCrowd < 82000, String(L.averageCrowd))
})

test('every road stadium and referee is counted once, and the conditions split what they cover', () => {
	const road = games.filter((g) => Number(g.season) >= 1999 && g.result && g.location !== 'HOME')
	assert.equal(s.roadStadiums.reduce((n, r) => n + r.games, 0), road.length)
	assert.equal(s.referees.reduce((n, r) => n + r.games, 0), games.filter((g) => Number(g.season) >= 1999 && g.result && g.referee).length)
	for (const c of s.conditions) assert.equal(c.lambeau.games + c.road.games, c.all.games, c.label)
	// The temperature bands cover every outdoor game with a temperature, once.
	const bands = s.conditions.filter((c) => ['Below freezing', 'Cold', 'Mild', 'Warm'].includes(c.label))
	assert.equal(bands.reduce((n, c) => n + c.all.games, 0), s.weatherGames)
})

test('the attendance file has every past game since 1999, and no 0 outside 2020 is counted', () => {
	const past = games.filter((g) => g.espnId && Number(g.season) >= 1999 && Number(g.season) < seasonBeingPlayed())
	assert.deepEqual(past.filter((g) => !attendance.has(g.espnId)).map((g) => g.date), [])
	const counted = stadiumStats(games, attendance).biggestCrowds.concat(s.smallestCrowds)
	assert.ok(counted.every((g) => g.crowd > 0))
})

test("the season being played, read from nflverse's schedules, parses as the CSV's rows do", () => {
	const nflverse = [
		'game_id,season,game_type,week,gameday,away_team,away_score,home_team,home_score,location,espn,stadium,roof,surface,temp,wind,referee',
		'2026_06_DAL_GB,2026,REG,6,2026-10-18,DAL,13,GB,23,Home,401772001,Lambeau Field,outdoors,grass,48,9,Shawn Smith',
		'2026_07_GB_DET,2026,REG,7,2026-10-25,GB,,DET,,Home,401772002,Ford Field,dome,,NA,NA,',
		'2026_06_KC_LV,2026,REG,6,2026-10-18,KC,30,LV,10,Home,401772003,Allegiant Stadium,dome,,NA,NA,',
	].join('\n')
	const mapped = parseCsv(nflverse).map(mapNflverseRow).filter(Boolean)
	const rows = parseGames([GAMES_HEADER, ...mapped.map(rowToCsv)].join('\n'))
	assert.equal(rows.length, 1)
	const g = gameDayGame(rows[0], new Map())
	assert.deepEqual([g.opponent, g.home, g.result, g.pf, g.pa, g.temp, g.wind, g.referee, g.espnId],
		['Dallas Cowboys', true, 'W', 23, 13, 48, 9, 'Shawn Smith', '401772001'])
})
