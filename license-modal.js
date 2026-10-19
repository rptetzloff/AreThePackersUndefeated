// Adds a "Disclaimer" link to the footer nav on every page and injects the
// modal it opens: that this is an independent fan site, each data source and
// the notice its license asks for, and how to ask for a correction. Ported
// from the Brewers site's license-modal.js.
(() => {
	function init() {
		const nav = document.querySelector('.footer-nav');
		if (!nav) return;

		const link = document.createElement('button');
		link.type = 'button';
		link.className = 'footer-nav-link license-link';
		// "Legal" on a phone, as Head-to-Head is "H2H": the footer is one row.
		link.innerHTML = '<i class="mdi mdi-license"></i><span class="footer-nav-label footer-label-full">Disclaimer</span><span class="footer-nav-label footer-label-short">Legal</span>';
		nav.insertBefore(link, nav.querySelector('.footer-github'));

		const ext = (href, text) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
		const overlay = document.createElement('div');
		overlay.className = 'license-overlay';
		overlay.hidden = true;
		overlay.innerHTML = `
			<div class="license-modal" role="dialog" aria-modal="true" aria-label="Data and licenses">
				<button class="license-close" aria-label="Close"><i class="mdi mdi-close"></i></button>
				<h2><i class="mdi mdi-license"></i> Data &amp; Licenses</h2>
				<p>This is an independent fan site. It is not affiliated with, sponsored by,
				or endorsed by the Green Bay Packers, the National Football League, ESPN, or
				any data provider named here. All team names, logos, and trademarks belong
				to their respective owners.</p>
				<h3>nflverse</h3>
				<p>Games from 1999 on, with their stadium, weather, referee, kickoff, point
				spread and starting quarterbacks; player statistics and birth dates; and the
				play-by-play that fills older box scores, all come from
				${ext('https://github.com/nflverse/nflverse-data', 'nflverse-data')} by the
				nflverse contributors, licensed under
				${ext('https://creativecommons.org/licenses/by/4.0/', 'CC BY 4.0')}. The data
				has been changed: reduced to the Packers' games and players, reshaped, and
				combined with the other sources here.</p>
				<h3>FiveThirtyEight</h3>
				<p>Games from 1921 to 1998 are derived from FiveThirtyEight's
				${ext('https://github.com/fivethirtyeight/nfl-elo-game', 'nfl-elo-game')}
				dataset, used under the MIT License
				(${ext('https://github.com/rptetzloff/AreThePackersUndefeated/blob/main/LICENSE-DATA', 'LICENSE-DATA')}).</p>
				<h3>ESPN</h3>
				<p>The current season's schedule, scores and live games, box scores, and
				crowds are retrieved from ESPN's publicly available API. This site is not
				affiliated with, sponsored by, or endorsed by ESPN or the NFL.</p>
				<h3>Photos</h3>
				<p>Photos come from ${ext('https://commons.wikimedia.org', 'Wikimedia Commons')}
				and are public domain or Creative Commons; each one links to its source and
				license.</p>
				<h3>Point spreads</h3>
				<p>Point spreads are historical closing lines, shown as records. They are
				not betting advice, and this site is not affiliated with any sportsbook.</p>
				<h3>Site</h3>
				<p>The site's code is open source under the MIT License
				(${ext('https://github.com/rptetzloff/AreThePackersUndefeated', 'GitHub')}).
				Bundled Liberation Sans fonts are © Red Hat, Inc., licensed under the SIL Open Font License 1.1.</p>
				<h3>Corrections</h3>
				<p>To provide additional information, or to request that information be
				removed or changed, please
				${ext('https://github.com/rptetzloff/AreThePackersUndefeated/issues/new', 'submit an issue')}.</p>
			</div>`;
		document.body.appendChild(overlay);

		const close = () => { overlay.hidden = true; };
		link.addEventListener('click', () => { overlay.hidden = false; });
		overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
		overlay.querySelector('.license-close').addEventListener('click', close);
		document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !overlay.hidden) close(); });
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();
