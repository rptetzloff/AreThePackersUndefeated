// The game page's HTML, from the box score lib/espn-box.js builds: the
// score and where it was played, the line score by quarter, the scoring
// plays, the team stats side by side, the drives, and each team's player
// tables. Pure functions over that object, so the tests pin the markup and
// game.js only fetches and redraws.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SEASON_TYPE = { 1: 'Preseason', 3: 'Playoffs' };

/** "Sunday, October 11, 2026" from "2026-10-11", without a time zone shift. */
export function longDate(iso) {
	if (!iso) return '';
	const d = new Date(`${iso}T12:00:00`);
	return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** A quarter's name: 1-4, then OT, 2OT for a playoff game that needs it. */
export const quarterName = (n) => (n <= 4 ? String(n) : n === 5 ? 'OT' : `${n - 4}OT`);

/** The page title: "Bears 7, Packers 31" once played, "Bears @ Packers"
 *  before, visitors first as a box score reads. */
export function gameTitle(box) {
	const { away, home } = box;
	return box.state === 'pre'
		? `${away.short} @ ${home.short}`
		: `${away.short} ${away.score}, ${home.short} ${home.score}`;
}

/** The heading block: both teams with scores and records, the status, and
 *  the date, place, crowd and network. */
export function headerHtml(box) {
	const { away, home } = box;
	const played = box.state !== 'pre';
	const teamHtml = (t, s) => `<div class="game-team${box.teamSide === s ? ' game-team-ours' : ''}${box.final && t.winner ? ' game-team-won' : ''}">`
		+ `<div class="game-team-name">${esc(t.name)}</div>`
		+ (t.record ? `<div class="game-team-record">${esc(t.record)}</div>` : '')
		+ (played ? `<div class="game-team-score">${esc(t.score)}</div>` : '')
		+ '</div>';
	const when = box.state === 'pre' && box.kickoff
		? new Date(box.kickoff).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
		: longDate(box.date);
	const phase = [SEASON_TYPE[box.seasonType], box.seasonType === 2 && box.week ? `Week ${box.week}` : ''].filter(Boolean).join(' · ');
	const meta = [
		esc(when),
		phase && esc(phase),
		box.venue && esc(box.city ? `${box.venue}, ${box.city}` : box.venue),
		box.attendance && `Att: ${box.attendance.toLocaleString('en-US')}`,
		box.broadcast && esc(box.broadcast),
	].filter(Boolean).join(' · ');
	// Before kickoff ESPN's status is the start time in Eastern ("10/18 -
	// 8:20 PM EDT"), which next to the meta line's local time reads as a
	// second, different kickoff. The meta line says it already.
	const status = box.live
		? `<div class="game-status-line game-status-live"><span class="live-indicator-small"></span>${esc(box.status)}</div>`
		: box.state === 'pre' ? '' : `<div class="game-status-line">${esc(box.status)}</div>`;
	return `<div class="game-header">${teamHtml(away, 'away')}<div class="game-at">@</div>${teamHtml(home, 'home')}</div>${status}<div class="game-meta">${meta}</div>`;
}

/** Down and distance, who has the ball and the last play, for a game in
 *  progress. Empty otherwise. */
export function situationHtml(box) {
	const s = box.situation;
	if (!s) return '';
	const ball = s.possession ? box[s.possession].short : '';
	const lines = [
		ball && `<div class="game-sit-ball"><i class="mdi mdi-football" aria-hidden="true"></i> ${esc(ball)} ball${s.downDistance ? ` · ${esc(s.downDistance)}` : ''}</div>`,
		s.lastPlay && `<div class="game-sit-play">${esc(s.lastPlay)}</div>`,
	].filter(Boolean);
	return lines.length ? `<div class="game-situation">${lines.join('')}</div>` : '';
}

/** The score by quarter, with OT columns only when there was overtime. */
export function lineScoreHtml(box) {
	const { away, home } = box;
	const n = Math.max(4, away.quarters.length, home.quarters.length);
	if (!away.quarters.length && !home.quarters.length) return '';
	const head = Array.from({ length: n }, (_, i) => `<th>${quarterName(i + 1)}</th>`).join('');
	const row = (t, s) => `<tr${box.teamSide === s ? ' class="game-row-ours"' : ''}><th scope="row">${esc(t.abbr)}</th>`
		+ Array.from({ length: n }, (_, i) => `<td>${esc(t.quarters[i] ?? '')}</td>`).join('')
		+ `<td class="game-total">${esc(t.score)}</td></tr>`;
	return section('Score by Quarter', `<div class="game-table-wrap"><table class="game-table game-linescore"><thead><tr><th></th>${head}<th>T</th></tr></thead><tbody>${row(away, 'away')}${row(home, 'home')}</tbody></table></div>`);
}

/** Every score in order, under its quarter, with the running score. */
export function scoringHtml(box) {
	if (!box.scoring.length) return '';
	let q = null;
	const out = [];
	for (const p of box.scoring) {
		if (p.quarter !== q) {
			q = p.quarter;
			out.push(`<div class="game-quarter">${q <= 4 ? `${ordinal(q)} Quarter` : esc(quarterName(q))}</div>`);
		}
		const team = p.side ? box[p.side] : null;
		out.push(`<div class="game-score-play${p.side === box.teamSide ? ' game-row-ours' : ''}">`
			+ `<span class="game-sp-team">${esc(team?.abbr || '')}</span>`
			+ `<span class="game-sp-type">${esc(p.type)}</span>`
			+ `<span class="game-sp-text">${esc(p.text)}<span class="game-sp-clock">${esc(p.clock)}</span></span>`
			+ `<span class="game-sp-score">${esc(p.away)}–${esc(p.home)}</span>`
			+ '</div>');
	}
	return section('Scoring', out.join(''));
}

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n] || 'th'}`;

/** The team stats, one row each, the two sides either side of the label. */
export function teamStatsHtml(box) {
	if (!box.teamStats.length) return '';
	const { away, home } = box;
	const rows = box.teamStats.map((s) => `<tr><td>${esc(s.away)}</td><th scope="row">${esc(s.label)}</th><td>${esc(s.home)}</td></tr>`).join('');
	return section('Team Stats', `<div class="game-table-wrap"><table class="game-table game-teamstats"><thead><tr><th>${esc(away.abbr)}</th><th></th><th>${esc(home.abbr)}</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

/** Each possession: who, when it started, how far it went and how it ended. */
export function drivesHtml(box) {
	if (!box.drives.length) return '';
	const rows = box.drives.map((d) => `<tr class="${[d.side === box.teamSide ? 'game-row-ours' : '', d.score ? 'game-drive-score' : ''].filter(Boolean).join(' ')}">`
		+ `<td>${esc(d.side ? box[d.side].abbr : '')}</td>`
		+ `<td>${esc(d.quarter ? quarterName(d.quarter) : '')} ${esc(d.start)}</td>`
		+ `<td>${esc(d.from)}</td>`
		+ `<td>${esc(d.summary)}</td>`
		+ `<td class="game-drive-result">${esc(d.result)}</td></tr>`).join('');
	return section('Drives', `<div class="game-table-wrap"><table class="game-table game-drives"><thead><tr><th>Team</th><th>Start</th><th>From</th><th>Drive</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

/** One team's player tables, one per category, as ESPN labels them: the
 *  body of that team's tab. */
export function playersHtml(box, side) {
	const cats = box.players[side];
	if (!cats.length) return '';
	return cats.map((c) => {
		const head = `<tr><th class="game-player-col">${esc(c.title)}</th>${c.labels.map((l) => `<th>${esc(l)}</th>`).join('')}</tr>`;
		const rows = c.rows.map((r) => `<tr><th scope="row" class="game-player-col">${esc(r.name)}</th>${c.labels.map((_, i) => `<td>${esc(r.stats[i] ?? '')}</td>`).join('')}</tr>`).join('');
		const totals = c.totals && c.rows.length > 1
			? `<tr class="game-total-row"><th scope="row" class="game-player-col">Team</th>${c.labels.map((_, i) => `<td>${esc(c.totals[i] ?? '')}</td>`).join('')}</tr>`
			: '';
		return `<div class="game-table-wrap"><table class="game-table game-players"><thead>${head}</thead><tbody>${rows}${totals}</tbody></table></div>`;
	}).join('');
}

/**
 * The player stats as two team tabs, as the Brewers box score page has
 * them: away on the left, home on the right, as the line score reads. The
 * open one is `selected` ('away' or 'home'), else ours. Both panels are in
 * the page and a tab only hides the other, so switching needs no redraw.
 */
export function teamTabsHtml(box, selected = null) {
	const sides = ['away', 'home'].filter((s) => box.players[s].length);
	if (!sides.length) return '';
	const open = sides.includes(selected) ? selected : sides.includes(box.teamSide) ? box.teamSide : sides[0];
	const tabs = sides.map((s) => `<button type="button" class="game-teamtab${s === open ? ' active' : ''}${s === box.teamSide ? ' game-teamtab-ours' : ''}" role="tab" id="game-tab-${s}" aria-controls="game-panel-${s}" aria-selected="${s === open}" data-side="${s}">${esc(box[s].name)}</button>`).join('');
	const panels = sides.map((s) => `<div class="game-teampanel" role="tabpanel" id="game-panel-${s}" aria-labelledby="game-tab-${s}" data-side="${s}"${s === open ? '' : ' hidden'}>${playersHtml(box, s)}</div>`).join('');
	return section('Player Stats', `<div class="game-teamtabs" role="tablist">${tabs}</div>${panels}`);
}

function section(title, body) {
	return `<section class="game-section"><h3 class="game-section-title">${esc(title)}</h3>${body}</section>`;
}

/** The whole page body. `selected` is the team tab the reader picked. */
export function gamePageHtml(box, selected = null) {
	return headerHtml(box)
		+ situationHtml(box)
		+ lineScoreHtml(box)
		+ scoringHtml(box)
		+ teamStatsHtml(box)
		+ teamTabsHtml(box, selected)
		+ drivesHtml(box);
}
