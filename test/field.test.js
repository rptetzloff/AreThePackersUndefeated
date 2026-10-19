import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { espnBoxscore } from '../lib/espn-box.js'
import { fieldSvg, driveLogHtml, fieldTrackerHtml, lineToGain, playKind, MAX_ARROWS } from '../field-core.js'
import { gamePageHtml, gameSummaryHtml } from '../game-core.js'

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
		{ yardLine: 10, down: 1, distance: 10, downDistance: '1st & 10 at GB 10', possession: 'home', lastPlay: undefined },
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
	assert.doesNotMatch(fieldTrackerHtml(evil), /<img src=x|<b>/)
})
