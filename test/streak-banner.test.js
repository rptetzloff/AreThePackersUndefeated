import test from 'node:test'
import assert from 'node:assert/strict'
import { streakBannerHtml } from '../records-core.js'

// Step 3 out of main.js. updateStreakBanner computed two streaks and wrote six
// different sentences, none of which anything could reach.

/** Weekly games from a September opener, so day counts are 7 apart. */
const run = (results) =>
	[...results].map((code, i) => ({
		result: { W: 'WIN', L: 'LOSS', T: 'TIE' }[code],
		date: new Date(2011, 8, 11 + i * 7),
	}))

const past = (results) => streakBannerHtml(run(results), { isPastSeason: true })
const live = (results) => streakBannerHtml(run(results), { isPastSeason: false })

test('no games played means no banner at all', () => {
	assert.equal(streakBannerHtml([], { isPastSeason: true }), null)
	assert.equal(streakBannerHtml([], { isPastSeason: false }), null)
})

test('games are ordered before counting, whatever order they arrive in', () => {
	const shuffled = [run('WWL')[2], run('WWL')[0], run('WWL')[1]]
	assert.match(streakBannerHtml(shuffled, { isPastSeason: true }), /2 games/)
})

test('a finished season with no losses says so, with its record', () => {
	assert.equal(past('WWWW'), 'Finished the regular season undefeated &mdash; <strong>4-0</strong>')
})

test('a finished season that opened with a defeat says the opener was lost', () => {
	assert.equal(
		past('LWWW'),
		'Lost the opener &mdash; undefeated for <strong>0 games</strong> to start the season',
	)
})

test('a finished season counts the opening run and how long it lasted', () => {
	// Three weekly wins, then a loss on day 21.
	assert.equal(
		past('WWWL'),
		'Undefeated for <strong>3 games</strong> (21 days) to start the season before first loss',
	)
})

test('one opening win is a game, not games', () => {
	assert.equal(past('WL'), 'Undefeated for <strong>1 game</strong> (7 days) to start the season before first loss')
})

test('a tie ends the opening run, and the sentence calls it a loss', () => {
	// Pinned, not endorsed. 1929 went 12-0-1 and the records page lists it as an
	// undefeated season, because site.js calls a lossless season `undefeated`
	// rather than `perfect` so that ties do not disqualify it. This sentence
	// says "before first loss" about a draw.
	//
	// Ending the *streak* at a tie is defensible; describing the tie as a loss
	// is not. Changing it is a copy decision, so this test exists to make that
	// change deliberate rather than accidental.
	assert.equal(
		past('WWTW'),
		'Undefeated for <strong>2 games</strong> (14 days) to start the season before first loss',
	)
})

test('a current season with no losses reports the live streak', () => {
	assert.equal(live('WWW'), 'Undefeated to start the season &mdash; <strong>3</strong>-game win streak')
})

test('a current season that lost its opener reports only the streak since', () => {
	assert.equal(live('LWW'), 'Lost the opener. Currently on a <strong>2-game</strong> win streak.')
})

test('a current season reports the opening run and the streak it is on now', () => {
	assert.equal(
		live('WWLWW'),
		'The Packers started the season undefeated for <strong>2 games</strong> (14 days). ' +
		'Currently on a <strong>2-game</strong> win streak.',
	)
})

test('a current season on no streak at all still says so', () => {
	// The most recent game was a defeat, so the win streak is zero. "0-game win
	// streak" is clumsy, and it is what shipped.
	assert.match(live('WWLWL'), /<strong>0-game<\/strong> win streak\./)
})

test('the team name comes from the site manifest', () => {
	const html = streakBannerHtml(run('WWLW'), { isPastSeason: false, site: { team: 'Brewers' } })
	assert.match(html, /^The Brewers started the season/)
})

test('days are singular at one, on the branch that can reach it', () => {
	const games = [
		{ result: 'WIN', date: new Date(2011, 8, 11) },
		{ result: 'LOSS', date: new Date(2011, 8, 12) },
	]
	assert.match(streakBannerHtml(games, { isPastSeason: false }), /\(1 day\)/)
})

test('a one-day gap would read as a day, though this sport cannot produce one', () => {
	// Unreachable here — a weekly sport has no one-day gap between the opener
	// and the first defeat — and asserted anyway, because the same function runs
	// on the baseball site, where it rendered "1 days" on a live page. The point
	// of the two files agreeing is that a fix on one is a fix on both.
	const games = [
		{ result: 'WIN', date: new Date(2011, 8, 11) },
		{ result: 'LOSS', date: new Date(2011, 8, 12) },
	]
	assert.equal(
		streakBannerHtml(games, { isPastSeason: true }),
		'Undefeated for <strong>1 game</strong> (1 day) to start the season before first loss',
	)
})
