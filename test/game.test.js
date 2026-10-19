import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { espnBoxscore } from '../lib/espn-box.js'
import { gamePageHtml, gameTitle, headerHtml, lineScoreHtml, scoringHtml, teamStatsHtml, playersHtml, teamTabsHtml, drivesHtml, situationHtml, quarterName, longDate, leadersOf, gameSummaryHtml } from '../game-core.js'

// A real summary, trimmed to the fields espn-box.js reads: Bears at Packers,
// 11 October 2026, 31-7. The trimming was checked to reduce to the same box
// score as the full 590KB response.
const summary = JSON.parse(readFileSync(new URL('./fixtures/espn-final-401872990.json', import.meta.url), 'utf8'))
const box = espnBoxscore(summary)

test('the box score: the game, both teams, and which side is ours', () => {
	assert.equal(box.id, '401872990')
	assert.equal(box.final, true)
	assert.equal(box.live, false)
	assert.equal(box.date, '2026-10-11')
	assert.equal(box.week, 5)
	assert.equal(box.venue, 'Lambeau Field')
	assert.equal(box.city, 'Green Bay, WI')
	assert.equal(box.attendance, 77755)
	assert.equal(box.teamSide, 'home')
	assert.deepEqual([box.away.abbr, box.away.score, box.home.abbr, box.home.score], ['CHI', '7', 'GB', '31'])
	assert.deepEqual(box.home.quarters, ['7', '7', '9', '8'])
	assert.equal(box.situation, null)
})

test("a night game's date is Green Bay's, not UTC's", () => {
	// Sunday Night Football kicks off at 7:20 PM Central, 00:20Z Monday.
	const s = structuredClone(summary)
	s.header.competitions[0].date = '2026-10-19T00:20Z'
	assert.equal(espnBoxscore(s).date, '2026-10-18')
})

test("the quarters add up to the final score, for both teams", () => {
	for (const t of [box.away, box.home]) assert.equal(t.quarters.reduce((s, q) => s + Number(q), 0), Number(t.score))
})

test('scoring plays run in order and the last one is the final score', () => {
	assert.ok(box.scoring.length >= 4)
	for (let i = 1; i < box.scoring.length; i++) {
		const [a, b] = [box.scoring[i - 1], box.scoring[i]]
		assert.ok(b.quarter >= a.quarter)
		assert.ok(b.away + b.home > a.away + a.home)
	}
	const last = box.scoring.at(-1)
	assert.deepEqual([String(last.away), String(last.home)], [box.away.score, box.home.score])
	assert.ok(box.scoring.every((p) => p.side === 'home' || p.side === 'away'))
})

test('player tables come in box score order, each row as wide as its labels', () => {
	const order = ['passing', 'rushing', 'receiving', 'fumbles', 'defensive', 'interceptions', 'kickReturns', 'puntReturns', 'kicking', 'punting']
	for (const s of ['away', 'home']) {
		const keys = box.players[s].map((c) => c.key)
		assert.deepEqual(keys, order.filter((k) => keys.includes(k)), s)
		assert.ok(keys.includes('passing') && keys.includes('rushing'))
		for (const c of box.players[s]) for (const r of c.rows) assert.equal(r.stats.length, c.labels.length, `${s} ${c.key} ${r.name}`)
	}
	// A category nobody recorded is left out rather than drawn empty: the
	// Bears intercepted nothing.
	assert.ok(!box.players.away.some((c) => c.key === 'interceptions'))
})

test('the box score is small: the page polls it during a game', () => {
	assert.ok(JSON.stringify(box).length < 40_000, `${JSON.stringify(box).length} bytes`)
})

test('no game in the summary is no box score', () => {
	assert.equal(espnBoxscore({}), null)
	assert.equal(espnBoxscore({ header: { competitions: [{ competitors: [] }] } }), null)
})

// A game in progress, built from the fixture: ESPN's situation names the
// team with the ball by id.
function liveBox() {
	const s = structuredClone(summary)
	const c = s.header.competitions[0]
	c.status.type = { state: 'in', completed: false, shortDetail: '3rd 4:12' }
	const gbId = c.competitors.find((t) => t.team.abbreviation === 'GB').team.id
	s.situation = { downDistanceText: '2nd & 7 at CHI 34', possession: gbId, lastPlay: { text: 'J.Love pass short left to C.Watson for 9 yards' } }
	return espnBoxscore(s)
}

test('a game in progress carries down and distance, who has the ball, and the last play', () => {
	const live = liveBox()
	assert.equal(live.live, true)
	assert.deepEqual(live.situation, { downDistance: '2nd & 7 at CHI 34', possession: 'home', lastPlay: 'J.Love pass short left to C.Watson for 9 yards' })
	const html = situationHtml(live)
	assert.match(html, /Packers ball · 2nd &amp; 7 at CHI 34/)
	assert.match(html, /C\.Watson for 9 yards/)
	assert.equal(situationHtml(box), '')
	assert.match(headerHtml(live), /game-status-live/)
})

test('the page: header, line score, scoring, team stats, player stats, drives, each under a heading', () => {
	const html = gamePageHtml(box)
	const titles = [...html.matchAll(/<h3 class="game-section-title">([^<]+)</g)].map((m) => m[1])
	assert.deepEqual(titles, ['Score by Quarter', 'Scoring', 'Team Stats', 'Player Stats', 'Drives'])
	assert.ok(html.indexOf('game-header') < html.indexOf('Score by Quarter'))
	// Nothing on the page is a disclosure any more.
	assert.doesNotMatch(html, /<details|<summary/)
	assert.equal(gameTitle(box), 'Bears 7, Packers 31')
})

// The tabs and panels as [side, open] pairs.
const tabsOf = (html) => [...html.matchAll(/class="game-teamtab( active)?[^"]*"[^>]*data-side="(\w+)"/g)].map((m) => [m[2], Boolean(m[1])])
const openPanels = (html) => [...html.matchAll(/class="game-teampanel"[^>]*data-side="(\w+)"([^>]*)>/g)].filter((m) => !/hidden/.test(m[2])).map((m) => m[1])

test('player stats are two team tabs, away on the left, ours open unless the reader picked the other', () => {
	assert.deepEqual(tabsOf(teamTabsHtml(box)), [['away', false], ['home', true]])
	assert.deepEqual(openPanels(teamTabsHtml(box)), ['home'])
	assert.deepEqual(openPanels(teamTabsHtml(box, 'away')), ['away'])
	// A road game opens on our tab too, still on the left.
	const road = { ...box, teamSide: 'away' }
	assert.deepEqual(tabsOf(teamTabsHtml(road)), [['away', true], ['home', false]])
	// A pick that is not a side is ignored.
	assert.deepEqual(openPanels(teamTabsHtml(box, 'nonsense')), ['home'])
	const html = teamTabsHtml(box)
	assert.match(html, /role="tablist"/)
	assert.match(html, /id="game-tab-home" aria-controls="game-panel-home" aria-selected="true"/)
	assert.match(html, /role="tabpanel" id="game-panel-away" aria-labelledby="game-tab-away" data-side="away" hidden>/)
	// Each panel holds that team's tables, and only theirs.
	const homePanel = html.slice(html.indexOf('id="game-panel-home"'))
	assert.match(homePanel, /Jordan Love/)
	assert.doesNotMatch(homePanel, /Case Keenum/)
})

test('a team with no player stats gets no tab; neither, no section', () => {
	const oneSided = { ...box, players: { away: [], home: box.players.home } }
	assert.deepEqual(tabsOf(teamTabsHtml(oneSided)), [['home', true]])
	assert.equal(teamTabsHtml({ ...box, players: { away: [], home: [] } }), '')
})

test('the header: winner marked, ours marked, date where it was played, the crowd', () => {
	const html = headerHtml(box)
	assert.match(html, /game-team game-team-ours game-team-won"><div class="game-team-name">Green Bay Packers/)
	assert.match(html, /Sunday, October 11, 2026 · Week 5 · Lambeau Field, Green Bay, WI · Att: 77,755/)
})

test('the line score has a column a quarter, and OT only when played', () => {
	assert.match(lineScoreHtml(box), /<th>1<\/th><th>2<\/th><th>3<\/th><th>4<\/th><th>T<\/th>/)
	const ot = { ...box, away: { ...box.away, quarters: ['0', '7', '0', '0', '3'] } }
	assert.match(lineScoreHtml(ot), /<th>4<\/th><th>OT<\/th><th>T<\/th>/)
	assert.deepEqual([1, 4, 5, 6].map(quarterName), ['1', '4', 'OT', '2OT'])
})

test('scoring plays sit under their quarter with the running score', () => {
	const html = scoringHtml(box)
	assert.match(html, /<div class="game-quarter">1st Quarter<\/div>/)
	assert.match(html, /Christian Watson 42 Yd pass from Jordan Love/)
	assert.match(html, /<span class="game-sp-score">0–7<\/span>/)
})

test('team stats put each side on its own side of the label', () => {
	assert.match(teamStatsHtml(box), /<tr><td>17<\/td><th scope="row">1st Downs<\/th><td>18<\/td><\/tr>/)
})

test('player tables use ESPN labels and add a team line only when there is more than one row', () => {
	const html = playersHtml(box, 'home')
	assert.match(html, /<th class="game-player-col">Passing<\/th><th>C\/ATT<\/th>/)
	const one = box.players.home.find((c) => c.rows.length === 1)
	const many = box.players.home.find((c) => c.rows.length > 1)
	const tableOf = (title) => html.slice(html.indexOf(`>${title}</th>`), html.indexOf('</table>', html.indexOf(`>${title}</th>`)))
	assert.doesNotMatch(tableOf(one.title), /game-total-row/)
	assert.match(tableOf(many.title), /game-total-row/)
})

test('text from ESPN is escaped everywhere it lands', () => {
	const evil = structuredClone(box)
	evil.away.name = '<img src=x onerror=1>'
	evil.scoring[0].text = '<script>'
	evil.drives[0].result = '"><b>'
	evil.players.away[0].rows[0].name = '<i>'
	const html = gamePageHtml(evil)
	assert.doesNotMatch(html, /<img src=x|<script>|"><b>|<i>/)
})

test('a game not yet played: no scores, the kickoff instead', () => {
	const pre = { ...box, state: 'pre', final: false, kickoff: '2026-10-19T00:20Z' }
	assert.equal(gameTitle(pre), 'Bears @ Packers')
	assert.doesNotMatch(headerHtml(pre), /game-team-score/)
	// ESPN's pre-game status is the kickoff in Eastern; the meta line has it
	// in the viewer's time, and two times read as two kickoffs.
	assert.doesNotMatch(headerHtml({ ...pre, status: '10/18 - 8:20 PM EDT' }), /EDT|game-status-line/)
	assert.equal(longDate('2026-10-11'), 'Sunday, October 11, 2026')
	assert.ok(drivesHtml({ ...box, drives: [] }) === '')
})

test("each side's leaders: the top passer, rusher and receiver by yards, not ESPN's first row", () => {
	assert.deepEqual(leadersOf(box, 'home'), [
		{ title: 'Passing', name: 'Jordan Love', line: '25/31, 367 YDS, 2 TD' },
		{ title: 'Rushing', name: 'MarShawn Lloyd', line: '10 CAR, 31 YDS, 2 TD' },
		{ title: 'Receiving', name: 'Christian Watson', line: '6 REC, 143 YDS, 2 TD' },
	])
	// An interception is named; no touchdowns on the ground or in the air
	// are left out rather than said as zero, except for the passer.
	assert.deepEqual(leadersOf(box, 'away').map((l) => l.line), ['11/19, 108 YDS, 0 TD, 1 INT', '9 CAR, 43 YDS, 1 TD', '4 REC, 47 YDS'])
	// By yards: put the backup first and the starter still leads.
	const swapped = structuredClone(box)
	const passing = swapped.players.away.find((c) => c.key === 'passing')
	passing.rows.reverse()
	assert.equal(leadersOf(swapped, 'away')[0].name, 'Case Keenum')
})

test('the summary: status, where and when with the crowd, score by quarter, leaders ours first, scoring, the way on', () => {
	const html = gameSummaryHtml(box)
	assert.match(html, /<div class="game-status-line">Final<\/div>/)
	assert.match(html, /Sunday, October 11, 2026 · Lambeau Field, Green Bay, WI · Att: 77,755 · Fox/)
	assert.match(html, /<th>1<\/th><th>2<\/th><th>3<\/th><th>4<\/th><th>T<\/th>/)
	assert.ok(html.indexOf('summary-leaders summary-leaders-ours') < html.indexOf('>Bears</div>'))
	assert.match(html, /Christian Watson 42 Yd pass from Jordan Love/)
	assert.match(html, /<a class="summary-box-link" href="\/game\/401872990">Full Box Score/)
	assert.match(html, /href="https:\/\/www\.espn\.com\/nfl\/game\/_\/gameId\/401872990" target="_blank" rel="noopener noreferrer"/)
	// No section headings but Scoring: it is a pop-up, not the page.
	assert.deepEqual([...html.matchAll(/class="game-section-title">([^<]+)</g)].map((m) => m[1]), ['Scoring'])
})

test('a live summary leads with the situation; one with no stats yet has no leaders block', () => {
	const live = gameSummaryHtml(liveBox())
	assert.match(live, /game-status-live/)
	assert.match(live, /Packers ball/)
	const bare = gameSummaryHtml({ ...box, players: { away: [], home: [] }, scoring: [] })
	assert.doesNotMatch(bare, /summary-leaders|game-section-title/)
})
