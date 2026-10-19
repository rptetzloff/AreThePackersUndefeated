// Stadiums page: Lambeau Field, the record by conditions, the game-day
// boards, every road stadium and every referee, from /api/stadiums
// (stadiums-core.js, built on the server from the games CSV's game-day
// columns, nflverse's schedules for the season being played, and ESPN's
// crowds).
import { esc, formatDate } from './records-core.js';
import { shareButtonsHtml, wireShareRow, wireShareDropdown } from './share-core.js';
import { sortItems, wireSortHeaders } from './sortable.js';

const commas = (n) => n.toLocaleString('en-US');
const pct = (p) => (p === null ? '—' : p.toFixed(3).replace(/^0/, ''));
const span = (a, b) => (a === b ? `${a}` : `${a}–${b}`);
const deg = (t) => `${t}°`;
const versus = (g) => (g.home ? 'vs' : g.location === 'NEUTRAL' ? 'vs' : 'at');
// A game linked to its box score where it has one.
const gameLink = (g, text) => (g.espnId ? `<a href="/game/${esc(g.espnId)}">${text}</a>` : text);
const score = (g) => `<span class="stadiums-score">${g.result} ${g.pf}–${g.pa}</span>`;

/** "vs Chicago Bears" linked to the box score, and the date, place and result. */
const gameLine = (g) => ({
	subHtml: gameLink(g, `${versus(g)} ${esc(g.opponent)}`),
	detailHtml: `${esc(formatDate(g.date))} · ${esc(g.stadium)} · ${score(g)}`,
});

function entryHtml(e, i) {
	return `<li class="record-entry${i === 0 ? ' record-entry-top' : ''}">
		<span class="record-entry-main">${esc(e.main)}</span>
		<span class="record-entry-sub">${e.subHtml}</span>
		${e.detailHtml ? `<span class="record-entry-detail">${e.detailHtml}</span>` : ''}
	</li>`;
}

function cardHtml(title, icon, note, entries, plain = false) {
	const body = entries.length
		? `<ol class="record-list${plain ? ' stadiums-facts' : ''}">${entries.map(entryHtml).join('')}</ol>`
		: '<p class="record-empty">Nothing recorded.</p>';
	return `<section class="record-card">
		<h2 class="record-card-title"><i class="mdi ${icon}"></i> ${esc(title)}</h2>
		${note ? `<p class="record-note">${note}</p>` : ''}
		${body}
	</section>`;
}

/** Lambeau as a card of facts rather than a ranked list. */
function lambeauCard(L) {
	const fact = (main, subHtml, detailHtml = '') => ({ main, subHtml, detailHtml });
	const game = (g) => `${gameLink(g, esc(formatDate(g.date)))} vs ${esc(g.opponent)}, ${score(g)}`;
	// A record Lambeau never produced is left off rather than shown empty.
	const extreme = (g, value, label, extra = () => '') => (g ? [fact(value(g), label, game(g) + extra(g))] : []);
	const facts = [
		fact(commas(L.games), `games since ${L.first}`, `through ${L.last}`),
		fact(L.regular.record, `regular season · ${pct(L.regular.winPct)}`),
		...(L.postseason.games ? [fact(L.postseason.record, `playoffs · ${pct(L.postseason.winPct)}`)] : []),
		...(L.averageCrowd ? [fact(commas(L.averageCrowd), 'average crowd')] : []),
		...extreme(L.biggestCrowd, (g) => commas(g.crowd), 'biggest crowd'),
		...extreme(L.coldest, (g) => deg(g.temp), 'coldest game', (g) => (g.wind ? ` · <span class="stadiums-score">wind ${g.wind} mph</span>` : '')),
		...extreme(L.hottest, (g) => deg(g.temp), 'hottest game'),
		...extreme(L.windiest, (g) => `${g.wind} mph`, 'windiest game', (g) => ` · ${deg(g.temp)}`),
		fact('First', game(L.firstGame), 'since 1999'),
		fact('Latest', game(L.latestGame)),
	];
	return cardHtml('Lambeau Field', 'mdi-stadium', 'Green Bay, Wisconsin · home since 1957', facts, true);
}

/** The record by weather and surface, regular season and playoffs: all
 *  games, at Lambeau and on the road. */
function conditionsTable(conditions) {
	const cell = (t) => (t.games ? `${esc(t.record)} <span class="stadiums-pct">${pct(t.winPct)}</span>` : '—');
	const rows = conditions.map((c) => `<tr>
			<td><strong>${esc(c.label)}</strong><span class="stadiums-note">${esc(c.note)}</span></td>
			<td class="h2h-num">${cell(c.all)}</td>
			<td class="h2h-num">${cell(c.lambeau)}</td>
			<td class="h2h-num">${cell(c.road)}</td>
		</tr>`).join('');
	return `<table class="h2h-table stadiums-conditions">
		<thead><tr><th>Regular season and playoffs</th><th class="h2h-num">All</th><th class="h2h-num">Lambeau</th><th class="h2h-num">Road</th></tr></thead>
		<tbody>${rows}</tbody>
	</table>`;
}

/** A sortable table of places or people: games, seasons and record. */
function groupTable(wrap, items, label) {
	const state = { key: 'games', dir: 'desc' };
	const render = () => {
		const rows = sortItems(items, state).map((r) => `<tr>
				<td>${esc(r.name)}</td>
				<td class="h2h-num">${span(r.first, r.last)}</td>
				<td class="h2h-num">${r.games}</td>
				<td class="h2h-num">${esc(r.record)}</td>
				<td class="h2h-num stadiums-col-pct">${pct(r.winPct)}</td>
			</tr>`).join('');
		wrap.innerHTML = `<table class="h2h-table">
			<thead><tr>
				<th data-sort="name" data-dir="asc">${esc(label)}</th>
				<th class="h2h-num" data-sort="first" data-dir="asc">Years</th>
				<th class="h2h-num" data-sort="games">Games</th>
				<th class="h2h-num" data-sort="w">Record</th>
				<th class="h2h-num stadiums-col-pct" data-sort="winPct">Win %</th>
			</tr></thead>
			<tbody>${rows}</tbody>
		</table>`;
		wireSortHeaders(wrap, state, render);
	};
	render();
}

async function init() {
	const recordsEl = document.getElementById('stadiums-records');
	try {
		const res = await fetch('/api/stadiums');
		if (!res.ok) throw new Error(`stadiums ${res.status}`);
		const d = await res.json();
		document.getElementById('stadiums-subtitle').textContent =
			`Green Bay Packers · ${d.range.first}–${d.range.last} · ${commas(d.games)} games · ${d.roadStadiums.length} road stadiums`;
		const board = (list, value, extra = () => '') => list.map((g) => {
			const line = gameLine(g);
			return { main: value(g), subHtml: line.subHtml, detailHtml: line.detailHtml + extra(g) };
		});
		// Lambeau and the five boards: six cards, three even rows of two.
		recordsEl.innerHTML = [
			d.lambeau ? lambeauCard(d.lambeau) : '',
			cardHtml('Coldest Games', 'mdi-snowflake', 'Kickoff temperature, °F', board(d.coldest, (g) => deg(g.temp), (g) => (g.wind ? ` · <span class="stadiums-score">wind ${g.wind} mph</span>` : ''))),
			cardHtml('Windiest Games', 'mdi-weather-windy', 'Wind at kickoff, mph', board(d.windiest, (g) => `${g.wind} mph`, (g) => ` · ${deg(g.temp)}`)),
			cardHtml('Hottest Games', 'mdi-white-balance-sunny', 'Kickoff temperature, °F', board(d.hottest, (g) => deg(g.temp))),
			cardHtml('Biggest Crowds', 'mdi-account-group', 'Home and away', board(d.biggestCrowds, (g) => commas(g.crowd))),
			cardHtml('Smallest Crowds', 'mdi-account-outline', 'Home and away; 2020 played to few or no fans', board(d.smallestCrowds, (g) => commas(g.crowd))),
		].join('');

		document.getElementById('stadiums-conditions').innerHTML = conditionsTable(d.conditions);
		groupTable(document.getElementById('stadiums-road'), d.roadStadiums, 'Stadium');
		groupTable(document.getElementById('stadiums-referees'), d.referees, 'Referee');

		// The page's share buttons live in the footer's Share menu.
		const share = document.getElementById('footer-share');
		share.innerHTML = shareButtonsHtml('footer-share-item', { labels: true });
		wireShareRow(share, 'Lambeau Field, the coldest and windiest Packers games, the biggest crowds, and the record in every road stadium.', `${window.location.origin}/stadiums`, { labels: true });
		wireShareDropdown();
	} catch (e) {
		recordsEl.innerHTML = '<p class="record-empty">Could not load the stadiums. Try again later.</p>';
		console.error(e);
	}
}

init();
