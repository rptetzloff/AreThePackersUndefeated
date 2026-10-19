import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))

test('every page loads the Disclaimer link and its Data & Licenses modal', () => {
	const pages = readdirSync(root).filter((f) => f.endsWith('.html'))
	assert.ok(pages.length >= 10)
	for (const page of pages) {
		const html = readFileSync(join(root, page), 'utf8')
		assert.match(html, /<script src="\/license-modal\.js" defer><\/script>/, `${page} has no disclaimer`)
	}
})

test('the modal names every data source and the license each asks for', () => {
	const js = readFileSync(join(root, 'license-modal.js'), 'utf8')
	for (const must of ['nflverse', 'CC BY 4.0', 'creativecommons.org/licenses/by/4.0', 'has been changed',
		'FiveThirtyEight', 'MIT License', 'LICENSE-DATA', 'ESPN', 'Wikimedia Commons', 'independent fan site',
		'not affiliated', 'issues/new']) {
		assert.ok(js.includes(must), `the modal does not say "${must}"`)
	}
})
