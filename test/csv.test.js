import test from 'node:test'
import assert from 'node:assert/strict'
import { esc, formatDate, localDate, parseGamesCsv, rec, splitCsvLine } from '../records-core.js'

// The CSV parser is hand-rolled, so the quoting rules are ours to get right
// rather than a library's. Opponent names are the field that exercises them:
// nothing else in the file contains a comma.
test('splitCsvLine keeps quoted commas together', () => {
	assert.deepEqual(
		splitCsvLine('1921-11-20,1921,"Racine, Wisconsin",WIN'),
		['1921-11-20', '1921', 'Racine, Wisconsin', 'WIN'],
	)
})

test('splitCsvLine unescapes a doubled quote', () => {
	assert.deepEqual(splitCsvLine('a,"say ""hi""",b'), ['a', 'say "hi"', 'b'])
})

test('splitCsvLine trims surrounding whitespace', () => {
	assert.deepEqual(splitCsvLine(' a , b ,c'), ['a', 'b', 'c'])
})

test('splitCsvLine keeps empty trailing fields', () => {
	// superbowl is empty on all but a handful of rows, and it is the last
	// column before location. Dropping trailing empties would shift them.
	assert.deepEqual(splitCsvLine('a,,c,'), ['a', '', 'c', ''])
})

test('parseGamesCsv maps headers onto rows', () => {
	const rows = parseGamesCsv('date,season,Opponent\n2020-09-13,2020,Chicago Bears\n')
	assert.equal(rows.length, 1)
	assert.equal(rows[0].Opponent, 'Chicago Bears')
	assert.equal(rows[0].season, '2020')
})

test('parseGamesCsv fills missing trailing columns with empty strings', () => {
	// A short row must not produce undefined, which would render as the word
	// "undefined" rather than as nothing.
	const rows = parseGamesCsv('a,b,c\n1,2\n')
	assert.equal(rows[0].c, '')
})

// The whole reason localDate exists. new Date('2011-09-25') is UTC midnight,
// which every timezone west of Greenwich renders as the 24th — a Sunday game
// labelled Saturday. This is the regression that comment is about.
test('localDate reads an ISO date as local midnight, not UTC', () => {
	const d = localDate('2011-09-25')
	assert.equal(d.getFullYear(), 2011)
	assert.equal(d.getMonth(), 8) // September
	assert.equal(d.getDate(), 25)
})

test('localDate disagrees with new Date() west of UTC, which is the point', () => {
	const naive = new Date('2011-09-25')
	const ours = localDate('2011-09-25')
	// Only assert the difference where it actually exists; a test that fails
	// in London would be testing the runner's timezone, not the code.
	if (naive.getTimezoneOffset() > 0) {
		assert.notEqual(naive.getDate(), ours.getDate())
	}
	assert.equal(ours.getDate(), 25)
})

test('formatDate never touches Date, so it cannot drift by a day', () => {
	assert.equal(formatDate('1966-10-23'), 'Oct 23, 1966')
	assert.equal(formatDate('2021-01-01'), 'Jan 1, 2021')
	assert.equal(formatDate('1997-12-31'), 'Dec 31, 1997')
})

test('rec shows ties only when there are some', () => {
	assert.equal(rec(13, 3, 0), '13–3')
	assert.equal(rec(10, 3, 1), '10–3–1')
	assert.equal(rec(0, 0, 0), '0–0')
})

test('rec uses an en dash, which the copy and the OG cards both assume', () => {
	assert.ok(rec(13, 3, 0).includes('–'))
	assert.ok(!rec(13, 3, 0).includes('-'))
})

test('esc escapes the five characters that break attributes and markup', () => {
	assert.equal(esc('<a href="x">Tom & Jerry</a>'),
		'&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;')
})

test('esc escapes ampersands before entities, not after', () => {
	// Getting the order wrong yields &amp;lt; — a double-escape that shows the
	// entity to the reader.
	assert.equal(esc('<'), '&lt;')
	assert.equal(esc('&lt;'), '&amp;lt;')
})
