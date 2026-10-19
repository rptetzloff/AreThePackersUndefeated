// The game page at /game/<ESPN event id>: fetches the box score from
// /api/boxscore/<id> and draws it (game-core.js). A game in progress
// redraws every 15 seconds, keeping the reader's place, until it is final;
// one still to come checks every minute, which is as often as the server
// refreshes it. A hidden tab skips its turns and catches up when shown.
import { gamePageHtml, gameTitle } from './game-core.js';

const root = document.getElementById('game-root');
const loading = document.getElementById('game-loading');
const errorEl = document.getElementById('game-error');

const idFromPath = () => window.location.pathname.match(/^\/game\/(\d{6,12})\/?$/)?.[1] || null;

// The team tab the reader picked, kept across a live game's redraws.
let selectedSide = null;

function render(box) {
	root.innerHTML = gamePageHtml(box, selectedSide);
	loading.hidden = true;
	document.title = `${gameTitle(box)} · Are the Packers Undefeated?`;
}

async function load(id) {
	const res = await fetch(`/api/boxscore/${id}`, { cache: 'no-cache' });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

const wait = (box) => (box.live ? 15000 : 60000);

function follow(id, first) {
	let timer = null;
	let last = first;
	let done = false;
	const tick = async () => {
		timer = null;
		if (document.visibilityState === 'hidden') return;
		try {
			const box = await load(id);
			const y = window.scrollY;
			render(box);
			window.scrollTo(0, y);
			last = box;
			if (box.final) { done = true; return; }
		} catch (err) {
			console.error('Box score refresh failed:', err);
		}
		timer = setTimeout(tick, wait(last));
	};
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible' && !timer && !done) tick();
	});
	timer = setTimeout(tick, wait(first));
}

// Team tabs, wired once on the root, which survives redraws. Arrow keys
// move between the two, as a tablist should.
function selectTab(tab) {
	selectedSide = tab.dataset.side;
	for (const t of root.querySelectorAll('.game-teamtab')) {
		const on = t === tab;
		t.classList.toggle('active', on);
		t.setAttribute('aria-selected', String(on));
	}
	for (const p of root.querySelectorAll('.game-teampanel')) p.hidden = p.dataset.side !== selectedSide;
}
root.addEventListener('click', (e) => {
	const tab = e.target.closest('.game-teamtab');
	if (tab) selectTab(tab);
});
root.addEventListener('keydown', (e) => {
	const tab = e.target.closest('.game-teamtab');
	if (!tab || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
	const other = [...root.querySelectorAll('.game-teamtab')].find((t) => t !== tab);
	if (!other) return;
	e.preventDefault();
	selectTab(other);
	other.focus();
});

async function main() {
	const id = idFromPath();
	if (!id) {
		loading.hidden = true;
		errorEl.hidden = false;
		errorEl.textContent = 'No game specified.';
		return;
	}
	try {
		const box = await load(id);
		render(box);
		// Before kickoff too: the page should turn into a live box score on
		// its own if it is left open.
		if (!box.final) follow(id, box);
	} catch (err) {
		loading.hidden = true;
		errorEl.hidden = false;
		errorEl.textContent = 'Could not load this game. It may not exist, or ESPN may not have it.';
		console.error('Box score error:', err);
	}
}

main();
