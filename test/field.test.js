import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { espnBoxscore, changeOfPossessionSpot } from '../lib/espn-box.js'
import { fieldSvg, driveLogHtml, fieldTrackerHtml, scorebugHtml, lineToGain, playKind, MAX_ARROWS } from '../field-core.js'
import { gamePageHtml, gameSummaryHtml, headerHtml } from '../game-core.js'

// Dallas at Green Bay, 18 October 2026, 11:13 left in the 1st, captured
// live and trimmed. The Cowboys' opening drive has just ended in a punt to
// the GB 10, and ESPN has logged an official timeout as the drive's last
// "play".
const live = espnBoxscore(JSON.parse(readFileSync(new URL('./fixtures/espn-live-401873007.json', import.meta.url), 'utf8')))

test("the live drive: Dallas's, every real play in order, spots from the home goal line", () => {
	assert.equal(live.live, true)
	assert.equal(live.drive.side, 'away')
	assert.deepEqual(live.drive.plays.map((p) => p.type), ['K', 'RUSH', 'RUSH', 'REC', 'REC', 'RUSH', 'REC', 'PUNT'])
	// The kickoff from GB 35 is 35; the return to DAL 34 is 66.
	assert.deepEqual([live.drive.plays[0].from, live.drive.plays[0].to], [35, 66])
	// Gains for the visitors go DOWN the yardLine: 8 yards from 66 is 58.
	assert.deepEqual([live.drive.plays[1].from, live.drive.plays[1].to, live.drive.plays[1].yards], [66, 58, 8])
})

test("ESPN's official timeout is not a play: not listed, not drawn, not the last play", () => {
	assert.ok(!live.drive.plays.some((p) => /timeout/i.test(p.typeText)))
	assert.doesNotMatch(driveLogHtml(live), /Official Timeout/)
	assert.match(live.situation.lastPlay, /punts 37 yards to GB 10/)
})

test('the situation is where the punt left it: the Packers 1st & 10 at their 10', () => {
	assert.deepEqual(
		{ ...live.situation, lastPlay: undefined },
		{ yardLine: 10, down: 1, distance: 10, downDistance: '1st & 10 at GB 10', possession: 'home', lastPlay: undefined, timeouts: null },
	)
})

test('the line to gain goes the way the offense goes, and not past a goal line', () => {
	const s = { down: 1, distance: 10, downDistance: '1st & 10', possession: 'home', yardLine: 10 }
	assert.equal(lineToGain(s), 20)
	assert.equal(lineToGain({ ...s, possession: 'away', yardLine: 51 }), 41)
	assert.equal(lineToGain({ ...s, downDistance: '1st & Goal at DAL 6', yardLine: 94, distance: 6 }), null)
	assert.equal(lineToGain({ ...s, down: 0 }), null)
	assert.equal(lineToGain(null), null)
})

test('the field: both end zones, the line of scrimmage and the line to gain where they belong', () => {
	const svg = fieldSvg(live)
	assert.match(svg, /<text x="5"[^>]*>GB<\/text>/)
	assert.match(svg, /<text x="115"[^>]*>DAL<\/text>/)
	// 10 yards of end zone, then the GB 10 at x=20 and the GB 20 at x=30.
	assert.match(svg, /<line x1="20" y1="0" x2="20" y2="40" class="field-scrimmage"\/>/)
	assert.match(svg, /<line x1="30" y1="0" x2="30" y2="40" class="field-togain"\/>/)
	assert.match(svg, /aria-label="Field: Packers ball, 1st &amp; 10 at GB 10"/)
	// Team colours land only as six hex digits.
	assert.match(svg, /style="fill:#204e32"/)
	assert.doesNotMatch(fieldSvg({ ...live, home: { ...live.home, color: '' } }), /fill:#204e32/)
})

test('each play is an arrow from its start spot pointing the way the ball went', () => {
	const svg = fieldSvg(live)
	assert.equal((svg.match(/class="field-play /g) || []).length, live.drive.plays.length)
	// The 8-yard run from DAL 34 (x=76) to DAL 42 (x=68) points left.
	const run = svg.slice(svg.indexOf('right tackle to DAL 42'))
	assert.match(run, /<line x1="76" y1="[\d.]+" x2="69.2"/)
	assert.match(run, /<polygon points="68,/)
	// The 2-yard loss is drawn as a loss.
	assert.match(svg, /field-play-loss"><title>J\.Williams right tackle to DAL 40 for -2 yards/)
})

test('a long drive draws only its latest plays', () => {
	const long = structuredClone(live)
	long.drive.plays = Array.from({ length: 15 }, (_, i) => ({ ...live.drive.plays[1], id: String(i), text: `play ${i}` }))
	const svg = fieldSvg(long)
	assert.equal((svg.match(/class="field-play /g) || []).length, MAX_ARROWS)
	assert.doesNotMatch(svg, /<title>play 4<\/title>/)
	assert.match(svg, /<title>play 14<\/title>/)
})

test('play kinds, in the order that matters: a scoring turnover is a score', () => {
	assert.equal(playKind({ scoring: true, turnover: true, yards: -5 }), 'score')
	assert.equal(playKind({ turnover: true, penalty: true }), 'turnover')
	assert.equal(playKind({ penalty: true, yards: 15 }), 'penalty')
	assert.equal(playKind({ yards: -2 }), 'loss')
	assert.equal(playKind({ yards: 0 }), 'gain')
})

test('the drive log: newest first, down before the snap, yards for scrimmage plays only', () => {
	const html = driveLogHtml(live)
	const texts = [...html.matchAll(/class="drive-play-text">([^<]+)</g)].map((m) => m[1])
	assert.match(texts[0], /punts 37 yards/)
	assert.match(texts.at(-1), /kicks 56 yards/)
	assert.match(html, /Cowboys drive · /)
	// A run shows its yards; the punt and kickoff show none, not ESPN's 0.
	assert.match(html, /<span class="drive-play-text">J\.Williams right tackle to DAL 42 for 8 yards[^<]*<\/span><span class="drive-play-yds">\+8<\/span>/)
	assert.match(html, /punts 37 yards[^<]*<\/span><span class="drive-play-yds"><\/span>/)
	assert.match(html, /<span class="drive-play-when">2nd &amp; 2<span class="drive-play-clock">Q1 14:23<\/span>/)
})

test('the tracker sits on the live game page and in the summary; a finished game has none', () => {
	assert.match(gamePageHtml(live), /<h3 class="game-section-title">Live<\/h3><div class="field-tracker">/)
	assert.match(gameSummaryHtml(live), /class="field-tracker"/)
	const final = espnBoxscore(JSON.parse(readFileSync(new URL('./fixtures/espn-final-401872990.json', import.meta.url), 'utf8')))
	assert.equal(final.drive, null)
	assert.equal(fieldTrackerHtml(final), '')
	assert.doesNotMatch(gamePageHtml(final), /field-tracker/)
})

test('text from ESPN is escaped on the field and in the log', () => {
	const evil = structuredClone(live)
	evil.drive.plays[1].text = '<img src=x onerror=1>'
	evil.away.abbr = '<b>'
	assert.doesNotMatch(fieldTrackerHtml(evil), /<img src=x|<b>/i)
})

// The same live summary with the scoreboard's situation passed in, as the
// server does: these are ESPN's fields, Dallas with the ball at its own 49.
const liveSummary = JSON.parse(readFileSync(new URL('./fixtures/espn-live-401873007.json', import.meta.url), 'utf8'))
const withBoard = (situation, extra = {}) => espnBoxscore(liveSummary, { scoreboard: { situation, ...extra } })
const board = { down: 2, distance: 8, yardLine: 51, downDistanceText: '2nd & 8 at DAL 49', possession: '6', homeTimeouts: 3, awayTimeouts: 2 }

test("the scoreboard's situation wins, with each side's timeouts left", () => {
	const b = withBoard(board)
	assert.deepEqual({ ...b.situation, lastPlay: undefined }, {
		yardLine: 51, down: 2, distance: 8, downDistance: '2nd & 8 at DAL 49', possession: 'away', lastPlay: undefined,
		timeouts: { away: 2, home: 3 },
	})
})

test('between plays ESPN names no one with the ball: possession falls back, and no down is shown', () => {
	// After a score ESPN sent down -1, no possession, no down and distance.
	const b = withBoard({ down: -1, yardLine: 85, distance: 0, isRedZone: true, homeTimeouts: 3, awayTimeouts: 3 })
	assert.equal(b.situation.down, 0)
	assert.equal(b.situation.downDistance, '')
	// The last play here is Dallas's punt, which ends with the Packers.
	assert.equal(b.situation.possession, 'home')
	assert.equal(lineToGain(b.situation), null)
})

test('the strip: home on the left as the field is, scores, three dots a side filled for each left, the ball by its team', () => {
	const html = scorebugHtml(withBoard(board))
	assert.ok(html.indexOf('bug-home') < html.indexOf('bug-status') && html.indexOf('bug-status') < html.indexOf('bug-away'))
	const dots = (s) => {
		const part = html.slice(html.indexOf(`bug-${s}`))
		const t = part.slice(part.indexOf('bug-timeouts'), part.indexOf('</span></div>'))
		return [(t.match(/class="bug-to bug-to-left"/g) || []).length, (t.match(/class="bug-to/g) || []).length]
	}
	assert.deepEqual(dots('home'), [3, 3])
	assert.deepEqual(dots('away'), [2, 3])
	assert.match(html, /title="2 timeouts left"/)
	// The football sits with Dallas, and only there.
	assert.equal((html.match(/mdi-football/g) || []).length, 1)
	assert.match(html, /bug-away bug-has-ball"><span class="bug-abbr">DAL<\/span><i class="mdi mdi-football bug-ball"/)
})

test('no timeouts from the scoreboard: no dots, rather than a guess from timeoutsUsed', () => {
	assert.equal(live.situation.timeouts, null)
	assert.doesNotMatch(scorebugHtml(live), /bug-timeouts/)
	assert.match(fieldTrackerHtml(live), /class="field-bug"/)
})

test("the game page's header puts the football by the team with the ball, during a game only", () => {
	assert.match(headerHtml(withBoard(board)), /Dallas Cowboys <i class="mdi mdi-football game-ball"/)
	const final = espnBoxscore(JSON.parse(readFileSync(new URL('./fixtures/espn-final-401872990.json', import.meta.url), 'utf8')))
	assert.doesNotMatch(headerHtml(final), /mdi-football/)
})

test("during a game the scoreboard's clock and scores win, so one card never shows two", () => {
	const ids = Object.fromEntries(liveSummary.header.competitions[0].competitors.map((c) => [c.homeAway, c.team.id]))
	const b = withBoard(board, {
		status: { type: { state: 'in', completed: false, shortDetail: '4:39 - 1st' } },
		competitors: [{ team: { id: ids.home }, score: '7' }, { team: { id: ids.away }, score: '0' }],
	})
	assert.equal(b.status, '4:39 - 1st')
	assert.deepEqual([b.home.score, b.away.score], ['7', '0'])
	assert.match(scorebugHtml(b), /<div class="bug-status">4:39 - 1st<\/div>/)
	// Without a scoreboard, the summary's own.
	assert.equal(live.status, '11:13 - 1st')
})

// Tonight's plays where the ball changed hands, as ESPN wrote them.
const TONIGHT = {
	kickoff: 'T.Smack kicks 56 yards from GB 35 to DAL 9. K.Turpin to DAL 34 for 25 yards (T.Hopper).',
	fairCatch: 'B.Anger punts 37 yards to GB 10, Center-T.Sieg, fair catch by C.Owen.',
	puntReturn: ' B.Anger punts 45 yards to GB 25, Center-T.Sieg. C.Owen pushed ob at GB 41 for 16 yards (S.James).',
	interception: '(Shotgun) D.Prescott pass short middle intended for C.Lamb INTERCEPTED by E.Williams at GB 3. E.Williams to GB 20 for 17 yards (J.Ferguson).',
	reversed: '(Shotgun) J.Love pass short left intended for M.Golden INTERCEPTED by D.Winters at GB 42. D.Winters for 42 yards, TOUCHDOWN.The Replay Official reviewed the runner was not down by contact ruling, and the play was REVERSED.(Shotgun) J.Love pass short left intended for M.Golden INTERCEPTED by D.Winters at GB 42. D.Winters to GB 42 for no gain (M.Golden).',
}

test('where the ball changed hands, read from the text, in yards from the home goal line', () => {
	const at = (t) => changeOfPossessionSpot(t, 'GB', 'DAL')
	assert.equal(at(TONIGHT.kickoff), 91) // DAL 9, the visitors' side
	assert.equal(at(TONIGHT.fairCatch), 10)
	assert.equal(at(TONIGHT.puntReturn), 25)
	assert.equal(at(TONIGHT.interception), 3)
	// A reviewed play: the call, then the play as it stands. The last counts.
	assert.equal(at(TONIGHT.reversed), 42)
	// Tonight's said GB 42 both times, which cannot tell first from last;
	// one where the review moved the spot can.
	assert.equal(at('J.Love pass INTERCEPTED by D.Bland at GB 45. The Replay Official reviewed the pass completion ruling, and the play was REVERSED. J.Love pass INTERCEPTED by D.Bland at DAL 48.'), 52)
	// Names have periods; the spot is after " at", not the first period.
	assert.equal(at('J.Love sacked at GB 30 for -8 yards. FUMBLES (M.Parsons), RECOVERED by DAL-D.Lawrence at GB 28.'), 28)
	assert.equal(at('T.Smack kicks 65 yards from GB 35 to DAL End Zone. Touchback.'), 100)
	assert.equal(at('J.Williams right tackle to DAL 42 for 8 yards.'), null)
})

// The interception as a play on the field: from the GB 17, picked at the
// GB 3, returned to the GB 20.
const pick = { id: 'x', from: 17, via: 3, to: 20, yards: 17, turnover: true, typeText: 'Pass Interception Return', text: TONIGHT.interception, down: '3rd & 8', quarter: 2, clock: '14:23' }

test('an interception is drawn as the pass to the pick, a mark there, and the return from it', () => {
	const svg = fieldSvg({ ...live, drive: { ...live.drive, plays: [pick] } })
	// x is 10 + yardLine: the GB 17 is 27, the GB 3 is 13, the GB 20 is 30.
	assert.match(svg, /<line x1="27" y1="[\d.]+" x2="13" y2="[\d.]+" class="field-play-air"\/>/)
	assert.match(svg, /<rect x="12\.40"[^>]*class="field-play-via"\/>/)
	// The return: from the pick to the 20, its arrowhead at the 20.
	assert.match(svg, /<line x1="13" y1="[\d.]+" x2="28\.8"/)
	assert.match(svg, /<polygon points="30,/)
	// No straight arrow from the 17 to the 20, which is what it used to be.
	assert.doesNotMatch(svg, /<line x1="27" y1="[\d.]+" x2="28\.8"/)
})

test('a fair catch has no return: the arrowhead sits where it was caught', () => {
	const fair = { ...pick, turnover: false, from: 47, via: 10, to: 10, typeText: 'Punt', text: TONIGHT.fairCatch }
	const svg = fieldSvg({ ...live, drive: { ...live.drive, plays: [fair] } })
	assert.match(svg, /<polygon points="20,/)
	assert.equal((svg.match(/<polygon/g) || []).length, 1)
})

test("a turnover's yardage is not shown as the offense's gain", () => {
	const html = driveLogHtml({ ...live, drive: { ...live.drive, plays: [pick] } })
	assert.match(html, /<span class="drive-play-yds">INT<\/span>/)
	assert.doesNotMatch(html, /\+17/)
})
