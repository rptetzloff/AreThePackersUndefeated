// The Cache-Control for a static file, from the version a request asked for
// and the version this server has.
//
// The page shells carry each script and stylesheet as name?v=<hash of the
// file>, and a versioned URL used to be marked immutable whatever was sent
// under it. During a rolling deploy the old server still answers requests
// for the new release's URLs, and it answered them with its old file,
// immutable. Cloudflare kept it: on 18 October 2026 the dev site linked
// styles.css?v=e2afe65f, the new stylesheet's hash, and the edge served the
// previous stylesheet under it (hash 5b8c22d3, cf-cache-status HIT), so the
// new summary pop-up rendered unstyled. The Brewers repo hit the same thing
// with game.js and fixed it the same way (its #99).
//
// A version this server does not have goes out no-store, so neither a
// browser nor the edge keeps it and the next request finds the right file.

export const IMMUTABLE = 'public, max-age=31536000, immutable';
export const NO_STORE = 'no-store';

/**
 * `asked` is the request's ?v= (null when there is none), `have` the
 * version of the file this server holds (null when it versions none), and
 * `ext` the file's extension, lower case with the dot.
 */
export function staticCacheControl({ asked, have, ext }) {
	if (asked != null) return asked === have ? IMMUTABLE : NO_STORE;
	// Unversioned JS (module imports like records-core.js can't carry ?v=)
	// and the data CSVs (whose column shape must match the deployed code)
	// must revalidate on every load, or a deploy can pair fresh code with
	// hour-stale data or modules.
	return ext === '.js' || ext === '.csv' ? 'no-cache' : 'public, max-age=3600';
}
