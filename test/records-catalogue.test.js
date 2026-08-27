import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { RECORD_SLUGS, computeSuperlatives, parseGames, recordsCopy } from '../records-core.js'
import { SITE } from '../site.js'

// The manifest decides which records this deployment publishes. These check
// that the decision is actually honoured end to end — that every slug it asks
// for can be computed, described, drawn on the page and drawn on a social card.
//
// The failure this prevents is quiet: a slug added to site.js with no card
// behind it renders one fewer card and says nothing.

const rows = parseGames(readFileSync(new URL('../data/packers_games.csv', import.meta.url), 'utf8'))
const supers = computeSuperlatives(rows, { now: new Date(2030, 5, 1), top: 10 })

const source = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')
const slugsIn = (name) => [...source(name).matchAll(/slug: '([a-z-]+)'/g)].map((m) => m[1])
const casesIn = (name) => [...source(name).matchAll(/case '([a-z-]+)'/g)].map((m) => m[1])

test('every published slug has copy that names it', () => {
	for (const slug of SITE.records) {
		const copy = recordsCopy(slug, supers)
		assert.ok(copy.title, `${slug} has no title`)
		assert.ok(copy.desc, `${slug} has no description`)
		// The default branch produces the landing-page copy, which is what an
		// unhandled slug silently falls through to.
		assert.notEqual(copy.title, recordsCopy('definitely-not-a-slug', supers).title,
			`${slug} falls through to the overview copy — recordsCopy has no case for it`)
	}
})

test('every published slug has a card on the records page', () => {
	const defined = slugsIn('records.js')
	for (const slug of SITE.records) {
		assert.ok(defined.includes(slug), `${slug} is published but records.js has no card`)
	}
})

test('every published slug has a social card', () => {
	const defined = casesIn('lib/cards.js')
	for (const slug of SITE.records) {
		assert.ok(defined.includes(slug), `${slug} is published but lib/cards.js has no case`)
	}
})

test('no card is defined that the manifest does not publish', () => {
	// The other direction: a card left behind after a slug was removed would
	// render nothing and cost nothing, which is exactly why nobody would notice.
	for (const slug of slugsIn('records.js')) {
		assert.ok(SITE.records.includes(slug), `records.js defines ${slug}, which the manifest does not publish`)
	}
})

test('RECORD_SLUGS is the manifest, so the router and the page agree', () => {
	assert.equal(RECORD_SLUGS, SITE.records)
})

// The five records backported from the baseball site, each asserted against
// real data rather than only for existence.
test('best and worst seasons rank by win percentage', () => {
	const [best] = supers.bestSeasons
	const [worst] = supers.worstSeasons
	assert.equal(best.season, 1929)
	assert.equal(best.record, '12–0–1')
	assert.equal(worst.season, 1958)
	assert.equal(worst.record, '1–10–1')
	assert.ok(best.winPct > worst.winPct)
})

test('season lists exclude a season still being played', () => {
	// The same guard perfect seasons use: a team at 3–0 in September would
	// otherwise sit at the top of the best-seasons list at 1.000.
	const live = computeSuperlatives(rows, { now: new Date(2026, 8, 15) })
	assert.ok(!live.bestSeasons.some((s) => s.season === 2026))
})

test('losing streaks mirror win streaks and may span seasons', () => {
	const [longest] = supers.loseStreaks
	assert.ok(longest.games >= 9, `longest losing streak is ${longest.games}`)
	// Same rule as wins here, and the opposite of the baseball site's.
	assert.equal(SITE.streaksSpanSeasons, true)
})

test('playoff appearances are newest first and count only postseason games', () => {
	const seasons = supers.playoffAppearances.map((a) => a.season)
	assert.deepEqual(seasons, [...seasons].sort((a, b) => b - a))
	assert.ok(supers.playoffAppearances.length >= 38, `${supers.playoffAppearances.length} appearances`)
})

test('championship appearances are the seasons that reached the final', () => {
	const c = supers.championshipAppearances
	// Super Bowls I, II, XXXI, XXXII and XLV — four won, XXXII lost.
	assert.equal(c.length, 5)
	assert.equal(c.filter((x) => x.won).length, 4)
	assert.deepEqual(c.map((x) => x.season).sort(), [1966, 1967, 1996, 1997, 2010])
})

test('every championship appearance is also a playoff appearance', () => {
	const playoff = new Set(supers.playoffAppearances.map((a) => a.season))
	for (const c of supers.championshipAppearances) {
		assert.ok(playoff.has(c.season), `${c.season} reached the final without reaching the playoffs`)
	}
})
