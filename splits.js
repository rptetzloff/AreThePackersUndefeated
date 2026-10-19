// Splits page: the record by when the Packers played, in close games and
// the division, by the point spread, and by starting quarterback on both
// sides, from /api/splits (splits-core.js, built on the server from the
// games CSV's nflverse columns and nflverse's schedules for the season being
// played).
import { esc } from './records-core.js';
import { shareButtonsHtml, wireShareRow, wireShareDropdown } from './share-core.js';
import { sortItems, wireSortHeaders } from './sortable.js';

const pct = (p) => (p === null ? '—' : p.toFixed(3).replace(/^0/, ''));
const span = (a, b) => (a === b ? `${a}` : `${a}–${b}`);
const rec = (t) => (t.games ? `${esc(t.record)} <span class="stadiums-pct">${pct(t.winPct)}</span>` : '—');

/** A table of situations: games, record and, for the line, against the spread. */
function situationsTable(rows, { ats = false } = {}) {
	const body = rows.map((r) => `<tr>
			<td><strong>${esc(r.label)}</strong>${r.note ? `<span class="stadiums-note">${esc(r.note)}</span>` : ''}</td>
			<td class="h2h-num">${r.games}</td>
			<td class="h2h-num">${rec(r)}</td>
			${ats ? `<td class="h2h-num">${rec(r.ats)}</td>` : ''}
		</tr>`).join('');
	return `<table class="h2h-table stadiums-conditions">
		<thead><tr><th></th><th class="h2h-num">Games</th><th class="h2h-num">Record</th>${ats ? '<th class="h2h-num">Against the spread</th>' : ''}</tr></thead>
		<tbody>${body}</tbody>
	</table>`;
}

/** A sortable table, re-rendered on each header click. */
function sortable(wrap, items, state, head, row) {
	const render = () => {
		wrap.innerHTML = `<table class="h2h-table"><thead><tr>${head}</tr></thead><tbody>${sortItems(items, state).map(row).join('')}</tbody></table>`;
		wireSortHeaders(wrap, state, render);
	};
	render();
}

async function init() {
	const whenEl = document.getElementById('splits-when');
	try {
		const res = await fetch('/api/splits');
		if (!res.ok) throw new Error(`splits ${res.status}`);
		const d = await res.json();
		document.getElementById('splits-subtitle').textContent =
			`Green Bay Packers · ${d.range.first}–${d.range.last} · ${d.games} games`;
		whenEl.innerHTML = situationsTable(d.when);
		document.getElementById('splits-close').innerHTML = situationsTable(d.close);
		document.getElementById('splits-line').innerHTML = situationsTable([...d.line, d.lineAll], { ats: true });

		// Each starter's record, linked to his player page.
		sortable(document.getElementById('splits-starters'),
			d.starters.map((q) => ({ ...q, regW: q.regular.w, postW: q.playoffs.w, regPct: q.regular.winPct })),
			{ key: 'games', dir: 'desc' },
			`<th data-sort="name" data-dir="asc">Quarterback</th>
			<th class="h2h-num compact-col-years" data-sort="first" data-dir="asc">Years</th>
			<th class="h2h-num" data-sort="games">Starts</th>
			<th class="h2h-num" data-sort="regW">Regular season</th>
			<th class="h2h-num stadiums-col-pct" data-sort="regPct">Win %</th>
			<th class="h2h-num" data-sort="postW">Playoffs</th>`,
			(q) => `<tr>
				<td>${q.id ? `<a href="/player/${esc(q.id)}">${esc(q.name)}</a>` : esc(q.name)}</td>
				<td class="h2h-num compact-col-years">${span(q.first, q.last)}</td>
				<td class="h2h-num">${q.games}</td>
				<td class="h2h-num">${esc(q.regular.record)}</td>
				<td class="h2h-num stadiums-col-pct">${pct(q.regular.winPct)}</td>
				<td class="h2h-num">${q.playoffs.games ? esc(q.playoffs.record) : '—'}</td>
			</tr>`);

		// The quarterbacks the Packers faced most, and how the Packers did.
		document.getElementById('splits-opposing').insertAdjacentHTML('beforebegin',
			`<p class="record-note">Faced ${d.minFaced} times or more: the Packers' record in those games</p>`);
		sortable(document.getElementById('splits-opposing'), d.opposing, { key: 'games', dir: 'desc' },
			`<th data-sort="name" data-dir="asc">Quarterback</th>
			<th class="h2h-num compact-col-years" data-sort="first" data-dir="asc">Years</th>
			<th class="h2h-num" data-sort="games">Games</th>
			<th class="h2h-num" data-sort="w">Packers</th>
			<th class="h2h-num stadiums-col-pct" data-sort="winPct">Win %</th>`,
			(q) => `<tr>
				<td>${esc(q.name)}<span class="stadiums-note">${esc(q.opponents.join(', '))}</span></td>
				<td class="h2h-num compact-col-years">${span(q.first, q.last)}</td>
				<td class="h2h-num">${q.games}</td>
				<td class="h2h-num">${esc(q.record)}</td>
				<td class="h2h-num stadiums-col-pct">${pct(q.winPct)}</td>
			</tr>`);

		const share = document.getElementById('footer-share');
		share.innerHTML = shareButtonsHtml('footer-share-item', { labels: true });
		wireShareRow(share, 'The Packers on Monday nights, in overtime, as underdogs, and with every starting quarterback since 1999.', `${window.location.origin}/splits`, { labels: true });
		wireShareDropdown();
	} catch (e) {
		whenEl.innerHTML = '<p class="record-empty">Could not load the splits. Try again later.</p>';
		console.error(e);
	}
}

init();
