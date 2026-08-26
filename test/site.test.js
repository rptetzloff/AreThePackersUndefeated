import test from 'node:test'
import assert from 'node:assert/strict'
import { SITE } from '../site.js'
import { RECORD_SLUGS, computeSeasonHistory, computeSuperlatives, historyCopy, recordsCopy } from '../records-core.js'
import { computeHeadToHead, h2hCopy, meetings, slugifyOpponent, streakSentence } from '../h2h-core.js'
import { LONG_AFTER, game, season } from './helpers/rows.js'

// The manifest is only worth having if swapping it changes the output. Most of
// these tests hand the copy functions a different sport's vocabulary and check
// that nothing leaks through — which is the property that lets one core serve
// both sites, and the property that would silently rot otherwise.

/** A deliberately unlike-football manifest. Not the real Brewers one: using a
 *  fictional sport means a test failing here is about the wiring rather than
 *  about whether Milwaukee's copy happens to read well. */
const OTHER = {
	team: 'Otters',
	fullName: 'Ocean City Otters',
	scoreNoun: 'goals',
	championship: 'Otter Cup',
	leaderNoun: 'skipper',
	leaderPlural: 'skippers',
	meetingNoun: 'clash',
	meetingPlural: 'clashes',
	streaksSpanSeasons: false,
	perfectSeasonIsPlausible: false,
	records: ['best-starts'],
	copy: {
		noPerfectSeason: 'The Otters lose at least once a year, reliably.',
		worstLossAside: 'It was windy.',
		worstStartAside: 'The season is long.',
		noTies: 'The Otters have never drawn.',
	},
}

const supers = computeSuperlatives(
	[...season(2011, 'WWWWL'), ...season(2012, 'LLLW'),
		game({ date: '2013-09-08', season: 2013, result: 'TIE', pf: 20, pa: 20, opponent: 'Chicago Bears' })],
	{ now: LONG_AFTER },
)
const history = computeSeasonHistory(season(2011, 'WWL'), { now: LONG_AFTER })

test('the manifest names this site', () => {
	assert.equal(SITE.team, 'Packers')
	assert.equal(SITE.fullName, 'Green Bay Packers')
	assert.equal(SITE.championship, 'Super Bowl')
})

// The rule the two sites genuinely disagree about, now stated as a value
// rather than as a difference between two implementations.
test('the manifest declares whether streaks span seasons', () => {
	assert.equal(SITE.streaksSpanSeasons, true)
})

test('the manifest lists the records this sport has', () => {
	assert.ok(Array.isArray(SITE.records))
	assert.ok(SITE.records.includes('perfect-seasons'))
	// Baseball-only records must not appear here. A shared core computes what
	// it is asked for, and asking for a no-hitter is how "The Packers have
	// never thrown a no-hitter" gets published.
	for (const baseballOnly of ['no-hitters', 'perfect-games', 'cycles', 'triple-plays']) {
		assert.ok(!SITE.records.includes(baseballOnly), `${baseballOnly} is not a football record`)
	}
})

test('records copy uses the manifest, not a hardcoded name', () => {
	const ours = recordsCopy('best-starts', supers)
	const theirs = recordsCopy('best-starts', supers, OTHER)

	assert.match(ours.title, /Best Packers Season Starts/)
	assert.match(theirs.title, /Best Otters Season Starts/)
	assert.match(theirs.desc, /Ocean City Otters history/)
	assert.ok(!theirs.title.includes('Packers'), 'the team name leaked through')
	assert.ok(!theirs.desc.includes('Green Bay'), 'the city leaked through')
})

test('history copy uses the manifest', () => {
	assert.match(historyCopy(history).title, /^Packers Season-by-Season History/)
	const theirs = historyCopy(history, OTHER)
	assert.match(theirs.title, /^Otters Season-by-Season History/)
	assert.match(theirs.desc, /Every Ocean City Otters season/)
})

// The copy overrides exist because substitution is not translation. These
// lines carry voice or a sport-specific fact and have to be replaceable
// wholesale rather than derived.
test('the flavour lines come from the manifest', () => {
	const noPerfect = computeSuperlatives(season(2011, 'WWL'), { now: LONG_AFTER })
	assert.equal(recordsCopy('perfect-seasons', noPerfect).desc, SITE.copy.noPerfectSeason)
	assert.equal(recordsCopy('perfect-seasons', noPerfect, OTHER).desc, OTHER.copy.noPerfectSeason)

	assert.match(recordsCopy('worst-starts', supers).desc, /It happens to the best of us\.$/)
	assert.match(recordsCopy('worst-starts', supers, OTHER).desc, /The season is long\.$/)
})

test('the no-ties line is a sentence, not a template', () => {
	const noTies = computeSuperlatives(season(2011, 'WWL'), { now: LONG_AFTER })
	assert.equal(recordsCopy('ties', noTies).desc, SITE.copy.noTies)
	assert.equal(recordsCopy('ties', noTies, OTHER).desc, 'The Otters have never drawn.')
})

test('head-to-head copy uses the manifest', () => {
	const data = computeHeadToHead([game({ opponent: 'Chicago Bears', result: 'WIN' })])
	assert.match(h2hCopy('chicago-bears', data).title, /^Packers vs Chicago Bears/)
	const theirs = h2hCopy('chicago-bears', data, OTHER)
	assert.match(theirs.title, /^Otters vs Chicago Bears/)
	assert.ok(!theirs.desc.includes('Packers'))
})

// The plural is a separate entry rather than noun + 's'. This test was first
// written asserting '2 clashs', which is what the obvious implementation
// produces and what no one would ever write. Spelling both out is the fix.
test('the word for a game against an opponent is configurable, plural included', () => {
	assert.equal(meetings(1), '1 meeting')
	assert.equal(meetings(2), '2 meetings')
	assert.equal(meetings(1, OTHER), '1 clash')
	assert.equal(meetings(2, OTHER), '2 clashes')
	assert.equal(meetings(0, OTHER), '0 clashes')
})

test('the streak sentence uses the manifest', () => {
	const rows = [
		game({ opponent: 'Chicago Bears', date: '2019-10-14', result: 'WIN' }),
		game({ opponent: 'Chicago Bears', date: '2020-09-20', result: 'WIN' }),
	]
	const o = computeHeadToHead(rows).bySlug.get(slugifyOpponent('Chicago Bears'))
	assert.equal(streakSentence(o), 'The Packers have won the last 2 meetings.')
	assert.equal(streakSentence(o, OTHER), 'The Otters have won the last 2 clashes.')
})

// Every copy function defaults to this site's manifest, so the hundreds of
// existing call sites did not have to change when it was introduced.
test('every copy function works with no manifest passed', () => {
	assert.ok(recordsCopy('overview', supers).title.includes('Packers'))
	assert.ok(historyCopy(history).title.includes('Packers'))
	const data = computeHeadToHead([game({ opponent: 'Chicago Bears' })])
	assert.ok(h2hCopy('overview', data).title.includes('Packers'))
})

// RECORD_SLUGS used to be a second copy of this list. It is now read out of
// the manifest, and this is the test that it stayed that way rather than being
// helpfully re-inlined by someone tidying up.
test('RECORD_SLUGS is the manifest list, not a copy of it', () => {
	assert.equal(RECORD_SLUGS, SITE.records, 'RECORD_SLUGS should be the same array, not an equal one')
})
