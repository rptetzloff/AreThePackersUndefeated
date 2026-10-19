// A player's page at /player/<nflverse id>: a table per category he has
// stats in, a row a season and his Packers career since 1999 beneath, then
// a season's game log. The server computes it all (stats-core.js); this
// draws it and keeps the season and games in the URL.
import { esc } from './records-core.js';
import { formatStat } from './stats-core.js';

const id = location.pathname.match(/^\/player\/(\d{2}-\d{7})\/?$/)?.[1];
const root = document.getElementById('player-root');
const typeSel = document.getElementById('player-type');
const params = new URLSearchParams(location.search);
const state = {
	type: ['REG', 'POST', 'ALL'].includes(params.get('type')) ? params.get('type') : 'REG',
	season: Number(params.get('season')) || null,
};

const TYPE = { REG: '', POST: 'Playoffs', ALL: '' };

function categoryHtml(cat) {
	const head = `<tr><th>Season</th><th class="h2h-num">G</th>${cat.columns.map(([, l]) => `<th class="h2h-num">${esc(l)}</th>`).join('')}</tr>`;
	const line = (label, r, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${label}</th><td class="h2h-num">${r.g}</td>`
		+ cat.columns.map(([k]) => `<td class="h2h-num">${esc(formatStat(k, r[k]))}</td>`).join('') + '</tr>';
	const rows = cat.seasons.map((s) => line(`<a href="/stats?season=${s.season}">${s.season}</a>`, s.row)).join('')
		+ (cat.seasons.length > 1 ? line('Career', cat.career, 'game-total-row') : '');
	return `<section class="stats-section"><h2 class="game-section-title">${esc(cat.title)}</h2>`
		+ `<div class="game-table-wrap"><table class="game-table h2h-table stats-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div></section>`;
}

function logHtml(log, seasons) {
	const picker = `<label class="stats-season-label">Game log
		<select id="player-season" class="h2h-select">${seasons.map((s) => `<option value="${s}"${s === log.season ? ' selected' : ''}>${s}</option>`).join('')}</select></label>`;
	const tables = log.categories.map((cat) => {
		const head = `<tr><th>Wk</th><th>Opp</th>${cat.columns.map(([, l]) => `<th class="h2h-num">${esc(l)}</th>`).join('')}</tr>`;
		const rows = log.games.filter((g) => g.lines[cat.key]).map((g) => `<tr><th scope="row">${g.type === 'POST' ? 'P' : ''}${g.week}</th><td>${esc(g.opponent)}</td>`
			+ cat.columns.map(([k]) => `<td class="h2h-num">${esc(formatStat(k, g.lines[cat.key][k]))}</td>`).join('') + '</tr>').join('');
		return `<h3 class="stats-leader-heading">${esc(cat.title)}</h3><div class="game-table-wrap"><table class="game-table h2h-table stats-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
	}).join('');
	return `<section class="stats-section"><h2 class="game-section-title">Games</h2><div class="h2h-controls">${picker}</div>${tables}`
		+ '<p class="history-legend">Wk is the week; P marks a playoff game.</p></section>';
}

async function show() {
	if (!id) { root.innerHTML = '<p class="record-empty">No player specified.</p>'; return; }
	root.innerHTML = '<div class="loading">Loading…</div>';
	try {
		const r = await fetch(`/api/player/${id}?type=${state.type}${state.season ? `&season=${state.season}` : ''}`);
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
		const p = await r.json();
		state.season = p.log.season;
		document.getElementById('player-name').textContent = p.name;
		document.getElementById('player-sub').textContent = `${p.pos} · Green Bay Packers · ${p.span}`;
		// A quarterback's record in the games he started (splits-core.js).
		const starts = document.getElementById('player-starts');
		if (p.starts) {
			const s = p.starts;
			const playoffs = s.playoffs.games ? `, ${esc(s.playoffs.record)} in the playoffs` : '';
			starts.innerHTML = `As the starter: ${esc(s.regular.record)} in the regular season${playoffs} · <a href="/splits#quarterbacks">all starters</a>`;
			starts.hidden = false;
		} else starts.hidden = true;
		document.title = `${p.name} · Packers stats`;
		root.innerHTML = (p.categories.length
			? p.categories.map(categoryHtml).join('')
			: `<p class="record-empty">No ${TYPE[state.type] ? 'playoff ' : ''}stats.</p>`)
			+ logHtml(p.log, p.seasons);
		document.getElementById('player-season').addEventListener('change', (e) => { state.season = Number(e.target.value); show(); });
		const q = new URLSearchParams();
		if (state.type !== 'REG') q.set('type', state.type);
		if (state.season !== p.seasons[0]) q.set('season', state.season);
		history.replaceState(null, '', `${location.pathname}${q.size ? `?${q}` : ''}`);
	} catch (err) {
		root.innerHTML = '<p class="record-empty">Could not load this player.</p>';
		console.error(err);
	}
}

typeSel.value = state.type;
typeSel.addEventListener('change', () => { state.type = typeSel.value; show(); });
show();
