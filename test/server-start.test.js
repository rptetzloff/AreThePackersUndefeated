import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// server.js reads its data files at the top level, so a load in the wrong
// place (one above the const it uses) throws before it listens, and no test
// of the modules it imports can see that. The card renderer's two packages
// are stubbed (helpers/stub-packages.mjs): CI installs nothing, and starting
// up does not render a card.
test('server.js starts and listens', async () => {
	const child = spawn(process.execPath, [
		'--import', new URL('./helpers/stub-packages.mjs', import.meta.url).href,
		fileURLToPath(new URL('../server.js', import.meta.url)),
	], {
		env: { ...process.env, PORT: '0' },
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	let out = ''
	try {
		const code = await new Promise((resolve) => {
			const timer = setTimeout(() => resolve('timeout'), 15000)
			const read = (b) => {
				out += b
				if (/listening on/.test(out)) { clearTimeout(timer); resolve('listening') }
			}
			child.stdout.on('data', read)
			child.stderr.on('data', read)
			child.on('exit', (c) => { clearTimeout(timer); resolve(`exited ${c}`) })
		})
		assert.equal(code, 'listening', out)
	} finally {
		child.kill()
	}
})
