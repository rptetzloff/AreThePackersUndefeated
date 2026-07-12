// Head Coaches page: every Packers head coach in tenure order with their
// record, computed from the shared coaches-core.js (games assigned to
// tenures by exact dates, so mid-season changes split correctly). Columns
// sort on click; coach photos open in the site's lightbox.
import { parseGamesCsv, computeSeasonHistory, esc } from './records-core.js';
import { parseCoachesCsv, computeCoaches, coachesCopy } from './coaches-core.js';
import { shareButtonsHtml, wireShareRow } from './share-core.js';
import { sortItems, wireSortHeaders } from './sortable.js';

const pct = (p) => (p >= 1 ? '1.000' : p.toFixed(3).replace(/^0/, ''));

function photoHtml(c) {
	if (!c.image) return '<span class="coach-photo coach-photo-none"><i class="mdi mdi-account"></i></span>';
	return `<a href="${esc(c.imagePage || c.image)}" class="coach-photo-link" data-coach="${esc(c.slug)}" title="View photo">
		<img class="coach-photo" src="${esc(c.image)}" alt="${esc(c.name)}">
	</a>`;
}

function tableHtml(coaches, state) {
	const rows = coaches.map((c) => `
		<tr>
			<td class="h2h-num">${esc(c.numLabel)}</td>
			<td class="coach-photo-cell">${photoHtml(c)}</td>
			<td>${esc(c.name)}${c.interim ? '<span class="coach-interim" title="Interim">*</span>' : ''}</td>
			<td class="h2h-num"><a href="/${c.firstSeason}">${esc(c.tenure)}</a></td>
			<td class="h2h-num">${esc(c.record)}</td>
			<td class="h2h-num">${pct(c.winPct)}</td>
			<td class="h2h-num">${c.playoffRecord ? esc(c.playoffRecord) : '—'}</td>
			<td class="h2h-num">${c.titles || '—'}</td>
		</tr>`).join('');
	return `<table class="h2h-table coaches-table">
		<thead><tr>
			<th class="h2h-num" data-sort="num" data-dir="asc">#</th>
			<th></th>
			<th data-sort="name" data-dir="asc">Coach</th>
			<th class="h2h-num" data-sort="firstSeason" data-dir="asc">Tenure</th>
			<th class="h2h-num" data-sort="wins">Record</th>
			<th class="h2h-num" data-sort="winPct">Win %</th>
			<th class="h2h-num" data-sort="playoffWins">Playoffs</th>
			<th class="h2h-num" data-sort="titles">Titles</th>
		</tr></thead>
		<tbody>${rows}</tbody>
	</table>`;
}

// Reuse the site's lightbox (same markup/classes as the season photo viewer);
// caption is the coach, license line links to the Commons source page.
function wireLightbox(coaches) {
	const lightbox = document.getElementById('lightbox');
	const bySlug = new Map(coaches.map((c) => [c.slug, c]));
	document.getElementById('coaches-table-wrap').addEventListener('click', (e) => {
		const link = e.target.closest('.coach-photo-link');
		if (!link) return;
		e.preventDefault();
		const c = bySlug.get(link.dataset.coach);
		document.getElementById('lightbox-img').src = c.image;
		document.getElementById('lightbox-img').alt = c.name;
		document.getElementById('lightbox-caption').textContent = `${c.name} · ${c.tenure}`;
		document.getElementById('lightbox-license').innerHTML =
			`Photo: <a href="${esc(c.imagePage)}" target="_blank" rel="noopener noreferrer">Wikimedia Commons — source &amp; license</a>`;
		lightbox.hidden = false;
	});
	const close = () => { lightbox.hidden = true; };
	document.getElementById('lightbox-close').addEventListener('click', close);
	lightbox.addEventListener('click', (e) => {
		if (e.target === lightbox || e.target === document.getElementById('lightbox-img')) close();
	});
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && !lightbox.hidden) close();
	});
}

async function init() {
	const wrap = document.getElementById('coaches-table-wrap');
	try {
		const [gamesRes, coachesRes] = await Promise.all([
			fetch('/data/packers_games.csv'),
			fetch('/data/packers_coaches.csv'),
		]);
		if (!gamesRes.ok || !coachesRes.ok) throw new Error('CSV fetch failed');
		const rows = parseGamesCsv(await gamesRes.text());
		const champions = computeSeasonHistory(rows).filter((s) => s.champion).map((s) => s.season);
		const data = computeCoaches(rows, parseCoachesCsv(await coachesRes.text()), champions);

		document.getElementById('coaches-subtitle').textContent =
			`Green Bay Packers · ${data.coaches.filter((c) => !c.interim).length} head coaches since ${data.coaches[0].firstSeason}`;

		// Interim exclusion persists like the site's other settings.
		const interimBox = document.getElementById('coaches-interim');
		interimBox.checked = localStorage.getItem('coachesShowInterim') !== 'false';
		const sortState = { key: 'num', dir: 'asc' };
		const renderTable = () => {
			const items = interimBox.checked ? data.coaches : data.coaches.filter((c) => !c.interim);
			wrap.innerHTML = tableHtml(sortItems(items, sortState), sortState);
			wireSortHeaders(wrap, sortState, renderTable);
		};
		interimBox.addEventListener('change', () => {
			localStorage.setItem('coachesShowInterim', String(interimBox.checked));
			renderTable();
		});
		renderTable();
		wireLightbox(data.coaches);

		const share = document.getElementById('coaches-share');
		share.innerHTML = shareButtonsHtml('share-btn', { labels: true });
		wireShareRow(share, coachesCopy(data).desc, `${window.location.origin}/coaches`, { labels: true });
	} catch (e) {
		wrap.innerHTML = '<p class="record-empty">Could not load the game data. Try again later.</p>';
		console.error(e);
	}
}

init();
