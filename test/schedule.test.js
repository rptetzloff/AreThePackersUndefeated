import test from 'node:test'
import assert from 'node:assert/strict'
import { scheduleRowHtml, scheduleListHtml, monthChipsHtml, monthKey, monthName } from '../schedule-core.js'
import { SITE } from '../site.js'

const row = (o) => ({ key: '1', date: new Date(2026, 9, 18, 19, 20), opp: 'Cowboys', home: true, state: 'next', text: '7:20 PM', tv: [], phase: 'regular', ...o })

test('a row: day and date, opponent with @ or vs, the result or time, and TV', () => {
	const html = scheduleRowHtml(row({ tv: ['NBC'] }))
	assert.match(html, /class="sched-row sched-next"/)
	assert.match(html, /<span class="sched-dow">Sun<\/span> Oct 18/)
	assert.match(html, /vs Cowboys/)
	assert.match(html, /7:20 PM/)
	assert.match(html, /<span class="sched-tv">NBC<\/span>/)
	assert.match(scheduleRowHtml(row({ home: false })), /@ Cowboys/)
})

test('a row carries the all-time head-to-head after the opponent, linked to its rivalry page', () => {
	const html = scheduleRowHtml(row({ opp: 'Bears', h2h: { href: '/vs/bears', text: '109–98–6', title: 'Packers vs Chicago Bears' } }))
	assert.match(html, /vs Bears <a class="sched-h2h" href="\/vs\/bears" title="Packers vs Chicago Bears">109–98–6<\/a><\/span>/)
	assert.doesNotMatch(scheduleRowHtml(row()), /sched-h2h/)
})

test("a played game links to its box score page, then to ESPN's in a new tab", () => {
	const html = scheduleRowHtml(row({ state: 'win', text: 'W 27-17', links: { box: '/game/401873007', espn: 'https://www.espn.com/nfl/game/_/gameId/401873007' } }))
	assert.match(html, /<a class="sched-link" href="\/game\/401873007"[^>]*>.*Box<\/span><\/a><a class="sched-link sched-link-espn"/)
	assert.match(html, /href="https:\/\/www\.espn\.com\/nfl\/game\/_\/gameId\/401873007" target="_blank" rel="noopener noreferrer"/)
	// The box score is this site's own page: same tab.
	assert.doesNotMatch(html.slice(0, html.indexOf('sched-link-espn')), /target="_blank"/)
	assert.doesNotMatch(html, /data-act="summary"/)
	assert.doesNotMatch(scheduleRowHtml(row()), /sched-links/)
})

test('ESPN and CSV text is escaped', () => {
	assert.match(scheduleRowHtml(row({ opp: '<b>x</b>' })), /&lt;b&gt;x&lt;\/b&gt;/)
	assert.match(scheduleRowHtml(row({ h2h: { href: '/vs/"x', text: '<1>', title: '' } })), /href="\/vs\/&quot;x" title="">&lt;1&gt;/)
})

test('months group the rows under one heading each; a phase change starts its own', () => {
	// The last regular-season week and the Wild Card round are both January.
	const rows = [
		row({ key: 'a', date: new Date(2026, 11, 27), phase: 'regular' }),
		row({ key: 'b', date: new Date(2027, 0, 3), phase: 'regular' }),
		row({ key: 'c', date: new Date(2027, 0, 10), phase: 'post' }),
		row({ key: 'd', date: new Date(2027, 0, 17), phase: 'post' }),
	]
	const html = scheduleListHtml(rows, { regular: 'Regular Season', post: 'Playoffs' })
	assert.deepEqual([...html.matchAll(/class="sched-month">([^<]+)</g)].map((m) => m[1]), ['December 2026', 'January 2027', 'January 2027'])
	assert.deepEqual([...html.matchAll(/class="season-divider">([^<]+)</g)].map((m) => m[1]), ['Regular Season', 'Playoffs'])
	assert.equal((html.match(/<section /g) || []).length, (html.match(/<\/section>/g) || []).length)
	// Both playoff games sit inside the playoffs' January group.
	const post = html.slice(html.indexOf('data-group="post|2027-01"'))
	assert.equal((post.slice(0, post.indexOf('</section>')).match(/class="sched-row/g) || []).length, 2)
})

// The chips as "label:group", with "|" where a phase's group begins (after the first).
const chipsOf = (html) => [...html.matchAll(/<span class="sched-chip-group"|data-group="([^"]+)"[^>]*>([^<]+)</g)]
	.map((m) => (m[1] ? `${m[2]}:${m[1]}` : '|')).slice(1)

test('chips by phase: the preseason, a chip a regular-season month, Playoffs', () => {
	const rows = [
		row({ phase: 'pre', date: new Date(2026, 7, 13) }), row({ phase: 'pre', date: new Date(2026, 7, 28) }),
		row({ phase: 'regular', date: new Date(2026, 8, 13) }), row({ phase: 'regular', date: new Date(2026, 9, 4) }),
		row({ phase: 'regular', date: new Date(2027, 0, 3) }),
		row({ phase: 'post', date: new Date(2027, 0, 10) }), row({ phase: 'post', date: new Date(2027, 1, 7) }),
	]
	const html = monthChipsHtml(rows)
	assert.deepEqual(chipsOf(html), ['Preseason:pre|2026-08', '|', 'Sep:regular|2026-09', 'Oct:regular|2026-10', 'Jan:regular|2027-01', '|', 'Playoffs:post|2027-01'])
	// The playoffs are one chip though they span January and February.
	assert.match(html, /data-group="post\|2027-01" data-covers="post\|2027-01 post\|2027-02"/)
})

test("the preseason chip's word is the manifest's, not this file's", () => {
	const rows = [row({ phase: 'pre', date: new Date(2026, 7, 13) }), row({ phase: 'regular', date: new Date(2026, 8, 13) })]
	assert.equal(SITE.preseasonNoun, 'Preseason')
	assert.match(monthChipsHtml(rows, { ...SITE, preseasonNoun: 'Spring' }), />Spring</)
})

test('a past season from the CSV: exhibition games share the preseason chip', () => {
	const rows = [
		row({ phase: 'other', date: new Date(1966, 7, 20) }),
		row({ phase: 'regular', date: new Date(1966, 8, 10) }),
		row({ phase: 'post', date: new Date(1967, 0, 1) }), row({ phase: 'post', date: new Date(1967, 0, 15) }),
	]
	assert.deepEqual(chipsOf(monthChipsHtml(rows)), ['Preseason:other|1966-08', '|', 'Sep:regular|1966-09', '|', 'Playoffs:post|1967-01'])
})

test('a single group needs no chips; months are local, not UTC', () => {
	const rows = [row({ date: new Date(2026, 9, 4) }), row({ date: new Date(2026, 9, 11) })]
	assert.equal(monthChipsHtml(rows), '')
	// A 7:20 PM Central kickoff on the 31st is that month's, though UTC has
	// moved on. Local construction makes this hold in any test time zone.
	assert.equal(monthKey(new Date(2026, 9, 31, 19, 20)), '2026-10')
	assert.equal(monthName('2026-10'), 'October 2026')
})

test("each phase's chips sit in a group of their own, so a narrow row breaks between phases", () => {
	const rows = [row({ phase: 'pre', date: new Date(2026, 7, 13) }), row({ phase: 'regular', date: new Date(2026, 8, 13) }), row({ phase: 'post', date: new Date(2027, 0, 10) })]
	const html = monthChipsHtml(rows)
	assert.deepEqual([...html.matchAll(/class="sched-chip-group" data-phase="([^"]+)"/g)].map((m) => m[1]), ['pre', 'regular', 'post'])
	assert.equal((html.match(/<span /g) || []).length, (html.match(/<\/span>/g) || []).length)
})
