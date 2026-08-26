import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computeSeasonHistory, computeSuperlatives, parseGamesCsv, recordsCopy } from '../records-core.js'
import { canonicalOpponent, computeHeadToHead } from '../h2h-core.js'
import { SITE } from '../site.js'

// The real data, asserted against the real functions.
//
// The other test files pin exact numbers because they build their own rows.
// This one cannot: update-data.js commits new games every week during the
// season, so any assertion of the form "there are N games" is a test that
// fails every Monday and gets edited until nobody reads it.
//
// So the rule here is relations and floors, never snapshots. Anything the
// future can add to gets `>=` or `includes`. Equality is reserved for facts
// that finished happening — 1929's record is not going to change.

const rows = parseGamesCsv(readFileSync(new URL('../data/packers_games.csv', import.meta.url), 'utf8'))
const SETTLED = new Date(2030, 5, 1)
const history = computeSeasonHistory(rows, { now: SETTLED })
const supers = computeSuperlatives(rows, { now: SETTLED, top: 10 })

test('the file parses into a plausible number of games', () => {
	// A floor rather than a count. If this drops below it, something truncated
	// the file rather than appended to it.
	assert.ok(rows.length > 1500, `only ${rows.length} rows parsed`)
})

test('every row has the columns the code reads', () => {
	const required = ['date', 'season', 'regular_season', 'Opponent', 'Packers Win', 'packers_score', 'opponent_score']
	for (const key of required) {
		const missing = rows.filter((r) => r[key] === undefined)
		assert.equal(missing.length, 0, `${missing.length} rows missing ${key}`)
	}
})

test('every result is one the code knows how to count', () => {
	// An unrecognised value is silently dropped by every compute function, so
	// a typo upstream loses games rather than failing loudly. This is the only
	// place that would notice.
	const known = new Set(['WIN', 'LOSS', 'TIE', ''])
	const strange = [...new Set(rows.map((r) => r['Packers Win']))].filter((v) => !known.has(v))
	assert.deepEqual(strange, [], `unexpected result values: ${strange.join(', ')}`)
})

test('every date is an ISO date that sorts correctly as a string', () => {
	// Every compute function sorts on the raw string rather than parsing, so
	// a row in another format would sort into the wrong decade.
	const bad = rows.filter((r) => !/^\d{4}-\d{2}-\d{2}$/.test(r.date))
	assert.deepEqual(bad.map((r) => r.date), [])
})

test('a game never predates the franchise or postdates the season it belongs to', () => {
	for (const r of rows) {
		const year = parseInt(r.season, 10)
		const dateYear = parseInt(r.date.slice(0, 4), 10)
		assert.ok(year >= 1921, `season ${year} predates the franchise`)
		// A season runs into January and February of the following year.
		assert.ok(dateYear === year || dateYear === year + 1,
			`${r.date} is filed under season ${year}`)
	}
})

test('scores are non-negative integers', () => {
	const played = rows.filter((r) => r['Packers Win'] !== '')
	for (const r of played) {
		for (const key of ['packers_score', 'opponent_score']) {
			assert.match(r[key], /^\d+$/, `${r.date} has ${key}="${r[key]}"`)
		}
	}
})

test('the result column agrees with the scores', () => {
	// The two are stored separately, so they can disagree — and a WIN with a
	// lower score would show a wrong record on the front page.
	const played = rows.filter((r) => ['WIN', 'LOSS', 'TIE'].includes(r['Packers Win']))
	const wrong = played.filter((r) => {
		const pf = parseInt(r.packers_score, 10)
		const pa = parseInt(r.opponent_score, 10)
		const implied = pf > pa ? 'WIN' : pf < pa ? 'LOSS' : 'TIE'
		return implied !== r['Packers Win']
	})
	assert.deepEqual(wrong.map((r) => `${r.date} ${r['Packers Win']} ${r.packers_score}-${r.opponent_score}`), [])
})

test('seasons are contiguous from the first to the last', () => {
	// A missing year is a data gap that renders as a hole in the history chart
	// rather than as an error.
	const years = history.map((s) => s.season)
	for (let i = 1; i < years.length; i++) {
		assert.equal(years[i], years[i - 1] + 1, `gap between ${years[i - 1]} and ${years[i]}`)
	}
})

test('the history starts in 1921 and covers at least a century', () => {
	assert.equal(history[0].season, 1921)
	assert.ok(history.length >= 105, `only ${history.length} seasons`)
})

// Closed historical facts. These are safe to pin exactly because they have
// already finished happening.
test('the championship seasons the code can identify include the known ones', () => {
	const champions = history.filter((s) => s.champion).map((s) => s.season)
	for (const year of [1929, 1930, 1931, 1936, 1939, 1944, 1961, 1962, 1965, 1966, 1967, 1996, 2010]) {
		assert.ok(champions.includes(year), `${year} is not marked a championship season`)
	}
})

test('the four Super Bowl wins are flagged and nothing before 1966 is', () => {
	const superbowls = history.filter((s) => s.superbowl).map((s) => s.season)
	assert.deepEqual(superbowls.filter((y) => y <= 2025), [1966, 1967, 1996, 2010])
})

test('the standings-era titles are champions despite having no playoff game', () => {
	// The rule that finds every other title — "won the last playoff game" —
	// cannot find these, so they are the ones a refactor would quietly lose.
	for (const year of [1929, 1930, 1931]) {
		const season = history.find((s) => s.season === year)
		assert.equal(season.champion, true, `${year}`)
		assert.equal(rows.some((r) => r.season === String(year) && r.regular_season !== '1'), false,
			`${year} has playoff rows, so this test is no longer testing what it says`)
	}
})

test('1929 remains the only undefeated season, at 12-0-1', () => {
	const undefeated = history.filter((s) => s.undefeated)
	assert.equal(undefeated.length, 1)
	assert.equal(undefeated[0].season, 1929)
	assert.equal(undefeated[0].record, '12–0–1')
})

test('the longest win streak and best start are at least their historical values', () => {
	// Floors, because these are records and records get broken. A drop below
	// means the computation changed, not that history did.
	assert.ok(supers.winStreaks[0].games >= 15, `longest streak is ${supers.winStreaks[0].games}`)
	assert.ok(supers.bestStarts[0].games >= 13, `best start is ${supers.bestStarts[0].games}`)
})

test('every tie ever is listed, newest first', () => {
	assert.ok(supers.ties.length >= 39, `only ${supers.ties.length} ties`)
	const dates = supers.ties.map((t) => t.date)
	assert.deepEqual(dates, [...dates].sort().reverse())
})

test('head-to-head covers every opponent exactly once', () => {
	const { opponents } = computeHeadToHead(rows)
	const names = opponents.map((o) => o.name)
	assert.equal(new Set(names).size, names.length, 'an opponent appears twice')
	const slugs = opponents.map((o) => o.slug)
	assert.equal(new Set(slugs).size, slugs.length, 'two opponents share a slug')
})

test('no aliased franchise name survives into the output', () => {
	// The whole point of canonicalOpponent. If one leaks through, that
	// franchise's history is split across two pages.
	const { opponents } = computeHeadToHead(rows)
	for (const o of opponents) {
		assert.equal(canonicalOpponent(o.name), o.name, `${o.name} should have been folded`)
	}
})

test('head-to-head games add up to the games actually played', () => {
	const { opponents } = computeHeadToHead(rows)
	const counted = opponents.reduce((n, o) => n + o.games, 0)
	const played = rows.filter((r) => ['WIN', 'LOSS', 'TIE'].includes(r['Packers Win'])).length
	assert.equal(counted, played, 'games were lost or double-counted in the fold')
})

test('the current NFL is represented, and defunct opponents are not counted as current', () => {
	const { opponents } = computeHeadToHead(rows)
	const current = opponents.filter((o) => o.current)
	// 31 other franchises exist; the Packers have played all of them.
	assert.equal(current.length, 31, `${current.length} current franchises matched`)
	assert.ok(opponents.length > current.length, 'no defunct opponents found, which cannot be right')
})

test('every opponent record sums to its game count', () => {
	for (const o of computeHeadToHead(rows).opponents) {
		assert.equal(o.wins + o.losses + o.ties, o.games, `${o.name} does not add up`)
	}
})

// 1929 finished 12–0–1: undefeated, with a scoreless tie against the Frankford
// Yellow Jackets. A tie does not disqualify a perfect season here — the rule is
// losses === 0 — so the list is never empty and the "no perfect season"
// fallback in site.js can never render.
//
// Worth pinning both halves. If the rule ever changed to require zero ties, or
// if 1929 dropped out of the data, this site would start publishing "No Packers
// season has finished without a loss" — a sentence that is true only when it is
// shown, and would be shown wrongly.
test('1929 makes the no-perfect-season fallback unreachable', () => {
	const perfect = supers.perfectSeasons
	assert.ok(perfect.length > 0, 'the fallback copy would render')
	assert.ok(perfect.some((s) => s.season === 1929), '1929 is missing from perfect seasons')

	const card = recordsCopy('perfect-seasons', supers)
	assert.notEqual(card.desc, SITE.copy.noLosslessSeason)
	assert.match(card.desc, /12–0–1 in 1929/)
})

test('a tie does not disqualify an unbeaten season', () => {
	const nineteen29 = history.find((s) => s.season === 1929)
	assert.equal(nineteen29.ties, 1, '1929 should carry its tie')
	assert.equal(nineteen29.losses, 0)
	assert.equal(nineteen29.undefeated, true)
})
