// Module hooks that answer the two npm packages with stubs, so server.js can
// be started in CI, which installs nothing (.github/workflows/test.yml). Only
// what runs at load is stubbed: lib/cards.js parses a font at the top level
// and renders nothing until a card is asked for.
const STUBS = {
	'@resvg/resvg-js': 'export class Resvg {}',
	'opentype.js': 'export default { parse: () => ({}) }',
}

export async function resolve(specifier, context, next) {
	if (Object.hasOwn(STUBS, specifier)) {
		return { url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`, shortCircuit: true }
	}
	return next(specifier, context)
}
