import test from 'node:test'
import assert from 'node:assert/strict'
import { seasonVerdict, verdictText } from '../lib/season-state.js'

// The front page had two answers and needed three.
//
// At 0-0 it said NO, which is wrong in the plainest way: a team that has not
// played has not lost. Reachable for a few weeks every year — once the schedule
// fills in, isOffseason stops returning true, and the first regular-season game
// is still to come.

test('a season with no games played has not started', () => {
	assert.equal(seasonVerdict({ wins: 0, losses: 0 }), 'not-started')
})

test('preseason games do not start the season', () => {
	// The screenshot that reported this showed "Preseason: 2-1" above
	// "Current Record: 0-0". Only the regular-season record is passed here.
	assert.equal(seasonVerdict({ wins: 0, losses: 0, ties: 0 }), 'not-started')
})

test('one win is undefeated; one loss is not', () => {
	assert.equal(seasonVerdict({ wins: 1, losses: 0 }), 'undefeated')
	assert.equal(seasonVerdict({ wins: 0, losses: 1 }), 'no')
})

test('a tie starts the season without making it undefeated', () => {
	// Ties count as played, so this is no longer 'not-started'. And a tie is not
	// a win, so `wins > 0` is false and it is not undefeated either.
	assert.equal(seasonVerdict({ wins: 0, losses: 0, ties: 1 }), 'no')
})

test('an unbeaten record with ties is still undefeated', () => {
	// 1929 went 12-0-1.
	assert.equal(seasonVerdict({ wins: 12, losses: 0, ties: 1 }), 'undefeated')
})

test('a past season with no games keeps the old answer', () => {
	// A data gap, not a season about to begin. Saying GO PACK GO about 1943
	// would be strange.
	assert.equal(seasonVerdict({ wins: 0, losses: 0, isPastSeason: true }), 'no')
})

test('the guard that stopped an empty season claiming YES still holds', () => {
	// This is why `wins > 0` was there. It is untouched — the case it guarded
	// against now has its own answer instead of being swept into NO.
	assert.notEqual(seasonVerdict({ wins: 0, losses: 0 }), 'undefeated')
	assert.notEqual(seasonVerdict({ wins: 0, losses: 0, isPastSeason: true }), 'undefeated')
})

test('the not-started words come from the manifest', () => {
	assert.equal(verdictText('not-started', { copy: { seasonNotStarted: 'PLAY BALL' } }), 'PLAY BALL')
})

test('yes and no have no configurable text', () => {
	// They are the site's own joke, not vocabulary another club would change.
	assert.equal(verdictText('undefeated'), null)
	assert.equal(verdictText('no'), null)
})

test('this site says GO PACK GO', () => {
	assert.equal(verdictText('not-started'), 'GO PACK GO')
})
