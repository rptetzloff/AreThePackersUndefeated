import test from 'node:test'
import assert from 'node:assert/strict'
import { staticCacheControl, IMMUTABLE, NO_STORE } from '../lib/static-cache.js'

test('a versioned URL is cached for good only when it is the version this server has', () => {
	assert.equal(staticCacheControl({ asked: 'e2afe65f', have: 'e2afe65f', ext: '.css' }), IMMUTABLE)
	// The old server of a rolling deploy, asked for the new release's URL:
	// what it sends must not be kept under that URL by anyone.
	assert.equal(staticCacheControl({ asked: 'e2afe65f', have: '5b8c22d3', ext: '.css' }), NO_STORE)
	assert.equal(staticCacheControl({ asked: 'e2afe65f', have: null, ext: '.js' }), NO_STORE)
	// An empty ?v= is a version asked for, and one nobody has.
	assert.equal(staticCacheControl({ asked: '', have: 'e2afe65f', ext: '.css' }), NO_STORE)
})

test('unversioned files are unchanged: scripts and data revalidate, the rest an hour', () => {
	assert.equal(staticCacheControl({ asked: null, have: null, ext: '.js' }), 'no-cache')
	assert.equal(staticCacheControl({ asked: null, have: null, ext: '.csv' }), 'no-cache')
	assert.equal(staticCacheControl({ asked: null, have: null, ext: '.png' }), 'public, max-age=3600')
})
