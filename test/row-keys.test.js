import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { parseGames } from '../records-core.js'

// The rename that introduced neutral row keys claimed "one function owns the
// CSV's own names". It was not true when it was written: the call sites in
// main.js and lib/seasons.js were switched to parseGames, but their field reads
// were left on the CSV's names. Every one of those reads silently became
// undefined, so every past season rendered as 0-0 with each game a 0-0 tie, and
// the whole suite stayed green — main.js is browser code that fetches its own
// CSV, and lib/seasons.js reads the file at import and calls ESPN, so neither
// is reachable from a unit test.
//
// This is the cheap version of the test that would have caught it: not "does
// the page render", but "does any consumer still speak a language only the
// parser is allowed to speak".

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** The files permitted to name the CSV's columns.
 *
 *  records-core.js is the parser — naming them is its entire job. update-data.js
 *  writes the file, so it defines them. Tests are excluded from the scan
 *  altogether: test/data.test.js asserts the real CSV still has these columns,
 *  which is exactly the contract that makes the parser safe. */
const OWNERS = new Set(['records-core.js', 'update-data.js'])

/** Property accesses, not bare words. A comment explaining that the CSV has a
 *  column called superbowl is fine and should stay legible; `g.superbowl` in
 *  running code is the bug. */
const BANNED = [
	"['Packers Win']",
	'["Packers Win"]',
	'.packers_score',
	"['packers_score']",
	'.opponent_score',
	"['opponent_score']",
	'.superbowl',
	"['superbowl']",
]

function sourceFiles() {
	const out = []
	for (const dir of ['', 'lib']) {
		const full = join(ROOT, dir)
		for (const name of readdirSync(full)) {
			if (!name.endsWith('.js')) continue
			if (OWNERS.has(name)) continue
			out.push(join(dir, name))
		}
	}
	return out
}

test('no consumer reads the CSV column names directly', () => {
	const offenders = []
	for (const rel of sourceFiles()) {
		const text = readFileSync(join(ROOT, rel), 'utf8')
		for (const banned of BANNED) {
			if (text.includes(banned)) offenders.push(rel + ' uses ' + banned)
		}
	}
	assert.deepEqual(
		offenders,
		[],
		'these read the CSV’s own column names instead of the neutral keys ' +
		'parseGames produces, which yields undefined rather than an error:\n  ' +
		offenders.join('\n  '),
	)
})

test('the scan actually looks at the files that had the bug', () => {
	// Without this, narrowing sourceFiles() to nothing would make the test above
	// pass forever while asserting nothing at all.
	const scanned = sourceFiles()
	for (const expected of ['main.js', join('lib', 'seasons.js')]) {
		assert.ok(scanned.includes(expected), 'not scanning ' + expected)
	}
})

test('parseGames produces the neutral keys and none of the CSV ones', () => {
	const csv = readFileSync(join(ROOT, 'data', 'packers_games.csv'), 'utf8')
	const [row] = parseGames(csv)
	// The keys consumers are entitled to rely on. Adding one is fine; removing
	// or renaming one breaks every page, so it should take a deliberate edit
	// here rather than a silent undefined at the call site.
	assert.deepEqual(Object.keys(row).sort(), [
		'Opponent', 'championship', 'date', 'location', 'playoff',
		'regular_season', 'result', 'scoreAgainst', 'scoreFor', 'season',
	])
})
