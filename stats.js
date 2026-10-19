// The Stats page: every Packers player's season, a table per category, and
// the leaders, single-season and career (since 1999). The server sums
// nflverse's game-by-game rows (stats-core.js) and sends each table ready to
// draw; this page draws it, sorts it, and keeps the view, season and games
// in the URL so a view can be linked.
import { esc } from './records-core.js';
import { sortItems, wireSortHeaders } from './sortable.js';
import { formatStat } from './stats-core.js';

const root = document.getElementById('stats-root');
const seasonSel = document.getElementById('stats-season');
const typeSel = document.getElementById('stats-type');
const params = new URLSearchParams(location.search);
const state = {
	view: params.get('view') === 'leaders' ? 'leaders' : 'season',
	season: Number(params.get('season')) || null,
	type: ['REG', 'POST', 'ALL'].includes(params.get('type')) ? params.get('type') : 'REG',
};
const sorts = {}; // category key -> { key, dir }

const fmt = (v) => (v == null ? '—' : typeof v === 'number' ? v.toLocaleString('en-US') : esc(v));
const playerLink = (p) => `<a class="stats-player-link" href="/player/${encodeURIComponent(p.id)}">${esc(p.name)}</a>`;

// --- Search ---

// Every player since 1999, fetched the first time the box is used: about
// 47KB, small enough to filter here as the reader types.
let players = null;
const search = document.getElementById('stats-search');
const results = document.getElementById('stats-search-results');

async function suggest() {
	players ??= await getJson('/api/players').catch(() => []);
	const q = search.value.trim().toLowerCase();
	const hits = q.length < 2 ? [] : players.filter((p) => p.name.toLowerCase().includes(q))
		// Names that start with what was typed come first.
		.sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
		.slice(0, 8);
	results.innerHTML = hits.map((p, i) => `<li role="option" id="stats-hit-${i}"><a href="/player/${encodeURIComponent(p.id)}">${esc(p.name)}<span class="stats-search-meta">${esc(p.pos)} · ${esc(p.seasons)}</span></a></li>`).join('');
	results.hidden = !hits.length;
	search.setAttribute('aria-expanded', String(hits.length > 0));
}

search.addEventListener('input', suggest);
search.addEventListener('keydown', (e) => {
	const links = [...results.querySelectorAll('a')];
	if (e.key === 'Enter' && links.length) { e.preventDefault(); location.href = links[0].href; }
	if (e.key === 'ArrowDown' && links.length) { e.preventDefault(); links[0].focus(); }
	if (e.key === 'Escape') { results.hidden = true; search.setAttribute('aria-expanded', 'false'); }
});
results.addEventListener('keydown', (e) => {
	const links = [...results.querySelectorAll('a')];
	const i = links.indexOf(document.activeElement);
	if (e.key === 'ArrowDown' && i < links.length - 1) { e.preventDefault(); links[i + 1].focus(); }
	if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? links[i - 1] : search).focus(); }
});

function saveUrl() {
	const p = new URLSearchParams();
	if (state.view === 'leaders') p.set('view', 'leaders');
	if (state.view === 'season' && state.season) p.set('season', state.season);
	if (state.type !== 'REG') p.set('type', state.type);
	history.replaceState(null, '', `${location.pathname}${p.size ? `?${p}` : ''}`);
}

async function getJson(url) {
	const r = await fetch(url);
	if (!r.ok) throw new Error(`HTTP ${r.status}`);
	return r.json();
}

// --- By season ---

function tableHtml(cat, rows) {
	const s = sorts[cat.key] || (sorts[cat.key] = { key: cat.sort, dir: 'desc' });
	const sorted = sortItems(rows, s);
	const head = `<tr><th data-sort="name" data-dir="asc" class="stats-player">Player</th><th data-sort="pos" data-dir="asc">Pos</th><th data-sort="g" class="h2h-num">G</th>`
		+ cat.columns.map(([key, label]) => `<th data-sort="${key}" class="h2h-num">${esc(label)}</th>`).join('') + '</tr>';
	const body = sorted.map((r) => `<tr><th scope="row" class="stats-player">${playerLink(r)}</th><td>${esc(r.pos)}</td><td class="h2h-num">${r.g}</td>`
		+ cat.columns.map(([key]) => `<td class="h2h-num">${esc(formatStat(key, r[key]))}</td>`).join('') + '</tr>').join('');
	return `<section class="stats-section" data-cat="${cat.key}"><h2 class="game-section-title">${esc(cat.title)}</h2>`
		+ `<div class="game-table-wrap"><table class="game-table h2h-table stats-table"><thead>${head}</thead><tbody>${body}</tbody></table></div></section>`;
}

async function showSeason() {
	const data = await getJson(`/api/stats?season=${state.season || ''}&type=${state.type}`);
	state.season = data.season;
	seasonSel.innerHTML = data.seasons.map((s) => `<option value="${s}"${s === data.season ? ' selected' : ''}>${s}</option>`).join('');
	const draw = () => {
		const sections = data.categories.filter((c) => data.tables[c.key].length);
		root.innerHTML = sections.length
			? sections.map((c) => tableHtml(c, data.tables[c.key])).join('')
			: `<p class="record-empty">No ${state.type === 'POST' ? 'playoff ' : ''}games in ${data.season}.</p>`;
		for (const sec of root.querySelectorAll('.stats-section')) {
			const cat = data.categories.find((c) => c.key === sec.dataset.cat);
			wireSortHeaders(sec, sorts[cat.key], draw);
		}
	};
	draw();
	saveUrl();
}

// --- Leaders ---

function leaderList(entries, career) {
	if (!entries.length) return '<p class="record-empty">None.</p>';
	return `<ol class="stats-leaders">${entries.map((e) => `<li><div class="stats-leader-row"><span class="stats-leader-name">${playerLink(e)}</span>`
		+ `<span class="stats-leader-when">${esc(career ? e.seasons : e.season)}</span>`
		+ `<span class="stats-leader-value">${fmt(e.value)}</span></div></li>`).join('')}</ol>`;
}

async function showLeaders() {
	const data = await getJson(`/api/stats/leaders?type=${state.type}`);
	root.innerHTML = `<div class="stats-leader-grid">${Object.values(data.leaders).map((l) => `<section class="record-card stats-leader-card">`
		+ `<h2 class="record-card-title">${esc(l.title)}</h2>`
		+ `<h3 class="stats-leader-heading">Single season</h3>${leaderList(l.season, false)}`
		+ `<h3 class="stats-leader-heading">Packers career, since ${data.first}</h3>${leaderList(l.career, true)}`
		+ '</section>').join('')}</div>`;
	saveUrl();
}

// --- Wiring ---

function setView(view) {
	state.view = view;
	for (const b of document.querySelectorAll('.stats-view')) {
		const on = b.dataset.view === view;
		b.classList.toggle('active', on);
		b.setAttribute('aria-selected', String(on));
	}
	seasonSel.closest('label').hidden = view === 'leaders';
	return show();
}

async function show() {
	root.innerHTML = '<div class="loading">Loading stats…</div>';
	try {
		await (state.view === 'leaders' ? showLeaders() : showSeason());
	} catch (err) {
		root.innerHTML = '<p class="record-empty">Could not load the stats. Try again later.</p>';
		console.error(err);
	}
}

for (const b of document.querySelectorAll('.stats-view')) b.addEventListener('click', () => setView(b.dataset.view));
seasonSel.addEventListener('change', () => { state.season = Number(seasonSel.value); show(); });
typeSel.value = state.type;
typeSel.addEventListener('change', () => { state.type = typeSel.value; show(); });
setView(state.view);
