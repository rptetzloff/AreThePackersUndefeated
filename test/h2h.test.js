import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalOpponent, computeHeadToHead, h2hCopy, meetings, slugifyOpponent, streakSentence } from '../h2h-core.js'
import { game } from './helpers/rows.js'

const vs = (opponent, opts = {}) => game({ opponent, ...opts })
const only = (rows, name) => computeHeadToHead(rows).bySlug.get(slugifyOpponent(name))

test('slugifyOpponent makes a URL-safe name', () => {
	assert.equal(slugifyOpponent('San Francisco 49ers'), 'san-francisco-49ers')
	assert.equal(slugifyOpponent('Washington Commanders'), 'washington-commanders')
})

test('slugifyOpponent collapses punctuation rather than encoding it', () => {
	// 'St. Louis' must not become 'st--louis', which would 404 against a link
	// built from the display name.
	assert.equal(slugifyOpponent('St. Louis Rams'), 'st-louis-rams')
	assert.ok(!slugifyOpponent('St. Louis Rams').includes('--'))
})

// The CSV has two eras with different naming: pre-1999 rows use modern
// franchise names, 1999+ rows use the name as of the game. Without folding, a
// franchise that moved appears twice with half its history each.
test('a relocated franchise folds into one opponent', () => {
	assert.equal(canonicalOpponent('St. Louis Rams'), 'Los Angeles Rams')
	assert.equal(canonicalOpponent('Oakland Raiders'), 'Las Vegas Raiders')
	assert.equal(canonicalOpponent('San Diego Chargers'), 'Los Angeles Chargers')
})

test('folding merges the games, not just the label', () => {
	const rows = [
		vs('St. Louis Rams', { date: '1995-10-01', result: 'WIN' }),
		vs('Los Angeles Rams', { date: '2018-10-28', result: 'LOSS' }),
	]
	const { opponents } = computeHeadToHead(rows)
	assert.equal(opponents.length, 1)
	assert.equal(opponents[0].name, 'Los Angeles Rams')
	assert.equal(opponents[0].games, 2)
})

// h2h-core is explicit that these are separate franchises rather than earlier
// names of current ones. Folding them would invent a shared history.
test('defunct franchises are not folded into similarly named ones', () => {
	assert.equal(canonicalOpponent('Baltimore Colts'), 'Baltimore Colts')
	assert.equal(canonicalOpponent('Dallas Texans'), 'Dallas Texans')
	const rows = [
		vs('Baltimore Colts', { date: '1953-10-18' }),
		vs('Indianapolis Colts', { date: '2012-10-07' }),
	]
	assert.equal(computeHeadToHead(rows).opponents.length, 2)
})

test('a defunct opponent is marked as not current', () => {
	const rows = [vs('Minneapolis Red Jackets', { date: '1929-10-13' })]
	assert.equal(only(rows, 'Minneapolis Red Jackets').current, false)
	assert.equal(only([vs('Chicago Bears')], 'Chicago Bears').current, true)
})

test('opponents are ordered by games played, rivals first', () => {
	const rows = [
		...[1, 2, 3].map((i) => vs('Detroit Lions', { date: `200${i}-09-10` })),
		...[1, 2, 3, 4, 5].map((i) => vs('Chicago Bears', { date: `200${i}-10-10` })),
		vs('Miami Dolphins', { date: '2004-11-10' }),
	]
	assert.deepEqual(
		computeHeadToHead(rows).opponents.map((o) => o.name),
		['Chicago Bears', 'Detroit Lions', 'Miami Dolphins'],
	)
})

test('equal meeting counts are ordered by name', () => {
	const rows = [vs('Miami Dolphins', { date: '2004-11-10' }), vs('Atlanta Falcons', { date: '2005-11-10' })]
	assert.deepEqual(
		computeHeadToHead(rows).opponents.map((o) => o.name),
		['Atlanta Falcons', 'Miami Dolphins'],
	)
})

test('the record counts every meeting, playoffs included', () => {
	const rows = [
		vs('Chicago Bears', { date: '2010-09-27', result: 'WIN' }),
		vs('Chicago Bears', { date: '2011-01-23', result: 'WIN', regular: false }),
		vs('Chicago Bears', { date: '2011-09-25', result: 'LOSS' }),
	]
	const o = only(rows, 'Chicago Bears')
	assert.equal(o.record, '2–1')
	assert.equal(o.games, 3)
})

test('the playoff split is broken out separately', () => {
	const rows = [
		vs('Chicago Bears', { date: '2010-09-27', result: 'WIN' }),
		vs('Chicago Bears', { date: '2011-01-23', result: 'WIN', regular: false }),
	]
	const o = only(rows, 'Chicago Bears')
	assert.equal(o.playoffGames, 1)
	assert.equal(o.playoffRecord, '1–0')
})

test('an opponent never met in the playoffs has no playoff record', () => {
	const o = only([vs('Miami Dolphins', { date: '2004-11-10' })], 'Miami Dolphins')
	assert.equal(o.playoffGames, 0)
	assert.equal(o.playoffRecord, null)
})

test('the streak counts back from the most recent meeting', () => {
	const rows = [
		vs('Detroit Lions', { date: '2018-10-07', result: 'LOSS' }),
		vs('Detroit Lions', { date: '2019-10-14', result: 'WIN' }),
		vs('Detroit Lions', { date: '2020-09-20', result: 'WIN' }),
	]
	assert.deepEqual(only(rows, 'Detroit Lions').streak, { result: 'WIN', count: 2 })
})

test('a streak of one reads as a single meeting rather than a run', () => {
	const rows = [
		vs('Detroit Lions', { date: '2019-10-14', result: 'WIN' }),
		vs('Detroit Lions', { date: '2020-09-20', result: 'LOSS', pf: 20, pa: 24 }),
	]
	const o = only(rows, 'Detroit Lions')
	assert.equal(o.streak.count, 1)
	assert.equal(streakSentence(o), 'Last meeting: a 20–24 loss on Sep 20, 2020.')
})

test('a run of two or more reads as a streak', () => {
	const rows = [
		vs('Detroit Lions', { date: '2019-10-14', result: 'WIN' }),
		vs('Detroit Lions', { date: '2020-09-20', result: 'WIN' }),
	]
	assert.equal(streakSentence(only(rows, 'Detroit Lions')), 'The Packers have won the last 2 meetings.')
})

test('biggest win is by margin and only considers wins', () => {
	const rows = [
		vs('Chicago Bears', { date: '2014-11-09', result: 'WIN', pf: 55, pa: 14 }),
		vs('Chicago Bears', { date: '2021-01-03', result: 'WIN', pf: 35, pa: 16 }),
		vs('Chicago Bears', { date: '2018-12-16', result: 'LOSS', pf: 17, pa: 24 }),
	]
	assert.equal(only(rows, 'Chicago Bears').biggestWin.pf, 55)
})

test('an opponent never beaten has no biggest win', () => {
	assert.equal(only([vs('Miami Dolphins', { result: 'LOSS' })], 'Miami Dolphins').biggestWin, null)
})

test('first and last meeting bracket the history', () => {
	const rows = [
		vs('Chicago Bears', { date: '2020-11-29' }),
		vs('Chicago Bears', { date: '1921-11-27' }),
	]
	const o = only(rows, 'Chicago Bears')
	assert.equal(o.first.date, '1921-11-27')
	assert.equal(o.last.date, '2020-11-29')
})

test('win percentage counts a tie as half', () => {
	const rows = [
		vs('Chicago Bears', { date: '2010-09-27', result: 'WIN' }),
		vs('Chicago Bears', { date: '2011-09-25', result: 'TIE' }),
	]
	assert.equal(only(rows, 'Chicago Bears').winPct, 0.75)
})

test('meetings pluralises', () => {
	assert.equal(meetings(1), '1 meeting')
	assert.equal(meetings(2), '2 meetings')
	assert.equal(meetings(0), '0 meetings')
})

test('h2hCopy falls back to landing copy for an unknown slug', () => {
	const data = computeHeadToHead([vs('Chicago Bears')])
	const copy = h2hCopy('not-a-team', data)
	assert.match(copy.title, /All-Time Head-to-Head/)
	assert.match(copy.desc, /Chicago Bears/)
})

test('h2hCopy names the opponent and the record', () => {
	const data = computeHeadToHead([vs('Chicago Bears', { result: 'WIN' })])
	assert.match(h2hCopy('chicago-bears', data).title, /Packers vs Chicago Bears — 1–0 all-time/)
})
