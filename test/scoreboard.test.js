import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { withScoreboard } from '../scoreboard-core.js'
import { ttlFor, TTL } from '../lib/espn-proxy.js'

// Captured at kickoff on 18 October 2026, trimmed: this week's scoreboard
// (two finished games and Dallas at Green Bay in progress) and three games
// of the Packers' schedule. By the time these were saved the schedule had
// caught up; at 7:22 PM it had not, which is what lag() puts back.
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const scoreboard = fixture('scoreboard-2026-10-18-kickoff.json')
const schedule = fixture('schedule-2026-10-18-kickoff.json')
const DAL = '401873007'

// The schedule as it was at 7:22 PM: Dallas still scheduled, no scores.
function lag() {
	const s = structuredClone(schedule)
	const comp = s.events.find((e) => e.id === DAL).competitions[0]
	comp.status = { type: { name: 'STATUS_SCHEDULED', state: 'pre', completed: false, shortDetail: '10/18 - 8:20 PM EDT' } }
	for (const c of comp.competitors) delete c.score
	return s.events
}
const state = (events, id) => events.find((e) => e.id === id).competitions[0].status.type.state

test('a game the scoreboard has in progress is in progress, whatever the lagging schedule says', () => {
	const events = lag()
	assert.equal(state(events, DAL), 'pre')
	const merged = withScoreboard(events, scoreboard)
	assert.equal(state(merged, DAL), 'in')
	// The page picks its live game this way.
	assert.equal(merged.find((e) => e.competitions[0].status.type.state === 'in')?.id, DAL)
})

test("the scoreboard's scores land on each team, in the shape the page reads", () => {
	const merged = withScoreboard(lag(), scoreboard)
	const sb = scoreboard.events.find((e) => e.id === DAL).competitions[0]
	const comp = merged.find((e) => e.id === DAL).competitions[0]
	for (const c of comp.competitors) {
		const want = sb.competitors.find((s) => s.team.id === c.team.id).score
		assert.deepEqual(c.score, { value: Number(want), displayValue: String(want) })
	}
	assert.deepEqual(comp.situation, sb.situation)
})

test('games the scoreboard does not carry are left exactly as the schedule has them', () => {
	const events = lag()
	const merged = withScoreboard(events, scoreboard)
	for (const id of ['401872990', '401873020']) assert.deepEqual(merged.find((e) => e.id === id), events.find((e) => e.id === id))
	// No scoreboard, an empty one, or a failed fetch: the schedule as it was.
	assert.equal(withScoreboard(events, null), events)
	assert.equal(withScoreboard(events, { events: [] }), events)
})

test('the inputs are not changed', () => {
	const events = lag()
	const before = JSON.stringify(events)
	withScoreboard(events, scoreboard)
	assert.equal(JSON.stringify(events), before)
})

test('the proxy holds a scoreboard with a game in progress for 15 seconds, otherwise a minute', () => {
	const t = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
	assert.equal(ttlFor(t, 200, JSON.stringify(scoreboard)), TTL.live)
	const quiet = { events: scoreboard.events.filter((e) => e.competitions[0].status.type.state !== 'in') }
	assert.equal(ttlFor(t, 200, JSON.stringify(quiet)), TTL.normal)
})
