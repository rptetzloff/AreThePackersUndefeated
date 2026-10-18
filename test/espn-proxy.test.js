import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { espnTarget } from '../lib/espn-target.js'
import { ttlFor, TTL, browserMaxAge, createEspnCache } from '../lib/espn-proxy.js'

const BASE = 'https://site.api.espn.com/'
const NFL = 'apis/site/v2/sports/football/nfl/'

test('every request the site makes is proxied, rebuilt from the allowlist', () => {
	const cases = [
		[`${NFL}teams/gb/schedule`, '?seasontype=1'],
		[`${NFL}teams/gb/schedule`, '?seasontype=2&season=2024'],
		[`${NFL}scoreboard`, ''],
		[`${NFL}summary`, '?event=401873007'],
	]
	for (const [path, search] of cases) assert.ok(espnTarget(path, search)?.startsWith(BASE + path), path + search)
	// Parameters are written back from integers, in the table's order.
	assert.equal(espnTarget(`${NFL}teams/gb/schedule`, '?seasontype=2&season=2024'), `${BASE}${NFL}teams/gb/schedule?season=2024&seasontype=2`)
})

test('anything else is refused', () => {
	assert.equal(espnTarget('apis/site/v2/sports/baseball/mlb/scoreboard'), null)
	assert.equal(espnTarget(`${NFL}teams/chi/schedule`), null)
	assert.equal(espnTarget(`${NFL}../../../../x`), null)
	assert.equal(espnTarget(`${NFL}scoreboard`, '?dates=20261018'), null)
	assert.equal(espnTarget(`${NFL}summary`, '?event=abc'), null)
	assert.equal(espnTarget(`${NFL}summary`, '?event=1%26x%3D2'), null)
})

// The allowlist only works if it lists everything the pages call. Read every
// /api/espn/ URL out of the client source and ask whether its path is
// allowed, so a new endpoint fails here instead of 404ing in production.
test('every /api/espn/ path in the client source is on the list, and no page calls ESPN directly', () => {
	const paths = new Set()
	for (const f of ['main.js', 'history.js', 'vs.js', 'records.js', 'coaches.js']) {
		const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
		for (const m of src.matchAll(/\/api\/espn\/(apis\/[\w/.-]+)/g)) paths.add(m[1])
		assert.doesNotMatch(src, /site\.api\.espn\.com/, `${f} calls ESPN from the browser`)
	}
	assert.equal(paths.size, 3)
	for (const p of paths) assert.notEqual(espnTarget(p), null, p)
})

const summary = (state, completed = false) => JSON.stringify({ header: { competitions: [{ status: { type: { state, completed } } }] } })
const schedule = (...events) => JSON.stringify({ events: events.map(([state, date]) => ({ date, competitions: [{ status: { type: { state } } }] })) })
const NOW = Date.parse('2026-10-18T23:00:00Z')
const hours = (h) => new Date(NOW + h * 3600e3).toISOString()

test('a summary lives 15 seconds in play, a day once final, a minute otherwise', () => {
	const t = `${BASE}${NFL}summary?event=1`
	assert.equal(ttlFor(t, 200, summary('in'), NOW), TTL.live)
	assert.equal(ttlFor(t, 200, summary('post', true), NOW), TTL.final)
	assert.equal(ttlFor(t, 200, summary('pre'), NOW), TTL.normal)
})

test('a schedule lives an hour between games, a minute near or during one, a day when all are over', () => {
	const t = `${BASE}${NFL}teams/gb/schedule?seasontype=2`
	assert.equal(ttlFor(t, 200, schedule(['post', hours(-200)], ['pre', hours(72)]), NOW), TTL.idle)
	assert.equal(ttlFor(t, 200, schedule(['post', hours(-200)], ['pre', hours(1)]), NOW), TTL.normal)
	assert.equal(ttlFor(t, 200, schedule(['in', hours(-1)]), NOW), TTL.normal)
	assert.equal(ttlFor(t, 200, schedule(['post', hours(-200)], ['post', hours(-30)]), NOW), TTL.final)
	// An empty schedule is not "all over": the season may not be posted yet.
	assert.equal(ttlFor(t, 200, schedule(), NOW), TTL.idle)
})

test('errors and unreadable bodies are volatile', () => {
	assert.equal(ttlFor(`${BASE}${NFL}summary?event=1`, 403, summary('post', true), NOW), TTL.normal)
	assert.equal(ttlFor(`${BASE}${NFL}summary?event=1`, 200, 'not json', NOW), TTL.normal)
	assert.equal(browserMaxAge({ ttl: TTL.final, cacheState: 'stale' }), 15)
	assert.equal(browserMaxAge({ ttl: TTL.idle, cacheState: 'hit' }), 300)
	assert.equal(browserMaxAge({ ttl: TTL.final, cacheState: 'hit' }), 3600)
})

// A fetch that counts calls and answers from a script.
function fakeFetch(answers) {
	const calls = []
	const impl = async (url) => {
		calls.push(url)
		const a = answers.shift()
		if (a instanceof Error) throw a
		return { status: a.status, text: async () => a.body }
	}
	return { impl, calls }
}

test('concurrent requests for one URL share one ESPN call, and the next is a hit', async () => {
	const f = fakeFetch([{ status: 200, body: summary('in') }])
	const cache = createEspnCache(f.impl, () => NOW)
	const t = `${BASE}${NFL}summary?event=1`
	const got = await Promise.all([cache.get(t), cache.get(t), cache.get(t)])
	assert.equal(f.calls.length, 1)
	assert.deepEqual(got.map((g) => g.cacheState), ['miss', 'miss', 'miss'])
	assert.equal((await cache.get(t)).cacheState, 'hit')
	assert.equal(f.calls.length, 1)
})

test('ESPN down or erroring serves the last good answer stale; with nothing cached, null', async () => {
	let now = NOW
	const t = `${BASE}${NFL}teams/gb/schedule`
	const f = fakeFetch([{ status: 200, body: schedule(['pre', hours(1)]) }, new Error('ECONNRESET'), { status: 503, body: 'down' }])
	const cache = createEspnCache(f.impl, () => now)
	assert.equal((await cache.get(t)).cacheState, 'miss')
	now += TTL.normal + 1
	const down = await cache.get(t)
	assert.equal(down.cacheState, 'stale')
	assert.equal(down.status, 200)
	const erroring = await cache.get(t)
	assert.equal(erroring.cacheState, 'stale')
	assert.equal(erroring.status, 200)

	const empty = createEspnCache(fakeFetch([new Error('ECONNRESET')]).impl, () => NOW)
	assert.equal(await empty.get(t), null)
})
